// This suite exercises the NestJS HTTP API against PostgreSQL.
// Web integration belongs in the web project. Browser-to-API flows are end-to-end tests.
import 'reflect-metadata'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { env } from 'node:process'
import test from 'node:test'
import { fileURLToPath, URL } from 'node:url'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { createServer, connect } from 'node:net'
import { setTimeout, clearTimeout } from 'node:timers'
import { NestFactory } from '@nestjs/core'
// Build runs before this suite, so Node loads the same compiled modules as the API.
import { AppModule } from '../dist/app.module.js'
import { AccessTokenVerifier } from '../dist/modules/identity/access-token.verifier.js'
import { checkIdentity } from './identity.mjs'
import { checkCustomers } from './customers.mjs'
import { checkProducts } from './products.mjs'
import { PrismaService } from '../dist/database/prisma.service.js'

const run = promisify(execFile)
const composeFile = fileURLToPath(new URL('./compose.yaml', import.meta.url))
const demoGrantsFile = fileURLToPath(new URL('../../../scripts/demo-runtime-grants.sql', import.meta.url))

test('API identity and health use the isolated PostgreSQL instance', async (context) => {
  // A unique Compose project gives each run its own container and network.
  const project = `sales-readiness-${randomUUID()}`
  const compose = (...args) => run('docker', ['compose', '-f', composeFile, '-p', project, ...args])
  const originalDatabaseUrl = env.DATABASE_URL
  let app

  context.after(async () => {
    try {
      await app?.close()
    } finally {
      if (originalDatabaseUrl === undefined) {
        delete env.DATABASE_URL
      } else {
        env.DATABASE_URL = originalDatabaseUrl
      }
      await compose('down', '--volumes')
    }
  })

  await compose('up', '--wait', '--wait-timeout', '60')
  const { stdout } = await compose('port', 'salesOpDb', '5432')
  env.DATABASE_URL = `postgresql://test:test-only@${stdout.trim()}/readiness`

  // Both migration and runtime connections point to this disposable database.
  await run('pnpm', ['run', 'prisma:migrate'], { env: { ...env, DIRECT_URL: env.DATABASE_URL } })

  await context.test('demo grants repair existing access and apply to future tables without exposing migration history', async () => {
    // Query PostgreSQL's privilege catalogue without needing a runtime password.
    const sql = async (statement) => (await compose(
      'exec', '-T', 'salesOpDb', 'psql', '-U', 'test', '-d', 'readiness',
      '-v', 'ON_ERROR_STOP=1', '-qAtc', statement,
    )).stdout.trim()
    await sql('CREATE ROLE sales_ops_runtime')
    const readPrivileges = () => sql(`
      SELECT has_table_privilege('sales_ops_runtime', table_name, privilege)
      FROM unnest(ARRAY['public.products', 'public.customers', 'public._prisma_migrations']) AS tables(table_name)
      CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privileges(privilege)
      ORDER BY table_name, privilege
    `)
    assert.deepEqual((await readPrivileges()).split('\n'), Array(12).fill('f'))
    for (let attempt = 0; attempt < 2; attempt++) {
      await run('pnpm', ['exec', 'prisma', 'db', 'execute', '--file', demoGrantsFile], {
        env: { ...env, DIRECT_URL: env.DATABASE_URL },
      })
      assert.deepEqual((await readPrivileges()).split('\n'), [...Array(4).fill('f'), ...Array(8).fill('t')])
    }

    // The migration login creates a table in a later release. No grant step is needed for it.
    await sql('CREATE TABLE public.future_orders (id serial)')
    const privileges = await sql(`
      SELECT has_table_privilege('sales_ops_runtime', 'public.future_orders', privilege)
      FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) AS privileges(privilege)
    `)
    assert.deepEqual(privileges.split('\n'), Array(4).fill('t'))
    assert.equal(await sql("SELECT has_sequence_privilege('sales_ops_runtime', 'public.future_orders_id_seq', 'USAGE')"), 't')
    assert.equal(await sql('SET ROLE sales_ops_runtime; INSERT INTO public.future_orders DEFAULT VALUES RETURNING id'), '1')
    assert.deepEqual((await readPrivileges()).split('\n'), [...Array(4).fill('f'), ...Array(8).fill('t')])
  })

  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false })
  app.get(AccessTokenVerifier).verify = async (token) => {
    // Replace only the external identity boundary. Requests use the real guards and database.
    if (!['alice', 'bob', 'charlie'].includes(token)) throw new Error('Invalid test token')
    return 'synthetic-' + token
  }
  app.setGlobalPrefix('api')
  // Port 0 asks the OS for a free port for the test HTTP server.
  await app.listen(0, '127.0.0.1')
  const healthUrl = (await app.getUrl()) + '/api/health'

  const healthy = await fetch(healthUrl)
  assert.equal(healthy.status, 200)
  assert.deepEqual(await healthy.json(), { status: 'ok' })

  await context.test('database connections tolerate a wake-up longer than two seconds', async () => {
    const directUrl = env.DATABASE_URL
    const target = new URL(directUrl)
    const sockets = new Set()
    // Delay the PostgreSQL handshake, not query execution, to simulate a sleeping compute.
    const proxy = createServer((client) => {
      const upstream = connect(Number(target.port), target.hostname)
      sockets.add(client)
      sockets.add(upstream)
      const delay = setTimeout(() => {
        client.pipe(upstream)
        upstream.pipe(client)
      }, 2_500)
      client.on('error', () => upstream.destroy())
      upstream.on('error', () => client.destroy())
      client.on('close', () => { clearTimeout(delay); upstream.destroy() })
      upstream.on('close', () => client.destroy())
    })
    let delayedDatabase
    try {
      await new Promise((resolve, reject) => {
        proxy.once('error', reject)
        proxy.listen(0, '127.0.0.1', resolve)
      })
      const delayedUrl = new URL(directUrl)
      delayedUrl.port = String(proxy.address().port)
      env.DATABASE_URL = delayedUrl.href
      delayedDatabase = new PrismaService()
      assert.deepEqual(await delayedDatabase.client.$queryRaw`SELECT 1 AS ready`, [{ ready: 1 }])
    } finally {
      env.DATABASE_URL = directUrl
      await delayedDatabase?.onModuleDestroy()
      for (const socket of sockets) socket.destroy()
      await new Promise((resolve) => proxy.close(resolve))
    }
  })

  // Reuse the API and database for identity tests before stopping PostgreSQL to test readiness.
  await context.test('Identity and onboarding enforce tenant boundaries', () => checkIdentity(app))
  await context.test('Product CRUD validates input and enforces tenant roles', () => checkProducts(app))
  await context.test('Customer CRUD validates input and enforces tenant roles', () => checkCustomers(app))

  await compose('stop', 'salesOpDb')
  const unavailable = await fetch(healthUrl)
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), { status: 'unavailable' })
})
