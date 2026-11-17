import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

test('the packaged Lambda handles HTTP API v2 events and reuses startup', async (context) => {
  // Copy the artifact outside the workspace so Node cannot fall back to its
  // node_modules when a dependency is missing from the package.
  const directory = mkdtempSync(join(tmpdir(), 'sales-demo-api-'))
  context.after(() => rmSync(directory, { recursive: true, force: true }))
  cpSync(new URL('../build/demo-api/', import.meta.url), directory, { recursive: true })
  const require = createRequire(join(directory, 'package.json'))
  const { SSMClient } = require('@aws-sdk/client-ssm')
  const parameterName = '/sales-operations/test/database-url'
  process.env.DATABASE_URL_PARAMETER = parameterName
  const parameter = context.mock.method(SSMClient.prototype, 'send', async () => {
    // An invalid port lets the readiness check fail without opening a database connection.
    return { Parameter: { Type: 'SecureString', Value: 'postgresql://test:test@127.0.0.1:65536/test' } }
  })
  // A failed cold start must not poison the next invocation or expose its error.
  parameter.mock.mockImplementationOnce(async () => {
    throw new Error('Synthetic SSM failure')
  })
  const { handler } = require('./dist/lambda.js')

  function request(method, path, body) {
    return handler({
      version: '2.0',
      routeKey: '$default',
      rawPath: path,
      rawQueryString: '',
      headers: { 'content-type': 'application/json' },
      requestContext: { stage: '$default', http: { method, path, sourceIp: '127.0.0.1' } },
      body,
      isBase64Encoded: false,
    }, {})
  }

  await assert.rejects(request('GET', '/api/health'), { message: 'API initialisation failed' })
  const health = await request('GET', '/api/health')
  assert.equal(health.statusCode, 503)
  assert.deepEqual(JSON.parse(health.body), { status: 'unavailable' })
  assert.equal((await request('GET', '/api/me')).statusCode, 401)
  assert.equal((await request('POST', '/api/organisations', '{"name":"Synthetic"}')).statusCode, 401)
  assert.equal((await request('GET', '/health')).statusCode, 404)
  assert.equal(parameter.mock.callCount(), 2)
  assert.deepEqual(parameter.mock.calls[0].arguments[0].input, {
    Name: parameterName, WithDecryption: true,
  })
})
