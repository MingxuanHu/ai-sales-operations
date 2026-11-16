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
import { NestFactory } from '@nestjs/core'
// Build runs before this suite, so Node loads the same compiled modules as the API.
import { AppModule } from '../dist/app.module.js'
import { AccessTokenVerifier } from '../dist/modules/identity/access-token.verifier.js'
import { checkIdentity } from './identity.mjs'

const run = promisify(execFile)
const composeFile = fileURLToPath(new URL('./compose.yaml', import.meta.url))

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

  // Reuse the API and database for identity tests before stopping PostgreSQL to test readiness.
  await context.test('Identity and onboarding enforce tenant boundaries', () => checkIdentity(app))

  await compose('stop', 'salesOpDb')
  const unavailable = await fetch(healthUrl)
  assert.equal(unavailable.status, 503)
  assert.deepEqual(await unavailable.json(), { status: 'unavailable' })
})
