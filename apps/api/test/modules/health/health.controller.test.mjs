import assert from 'node:assert/strict'
import test from 'node:test'
// The test imports the JavaScript file emitted by the TypeScript compiler.
import { HealthController } from '../../../dist/modules/health/health.controller.js'

test('the health controller reports a reachable database', async () => {
  // A stub lets the controller run without a database or HTTP server.
  const controller = new HealthController({ checkDatabase: async () => {} })
  assert.deepEqual(await controller.getHealth(), { status: 'ok' })
})

test('the health controller reports 503 without exposing the database error', async () => {
  const controller = new HealthController({
    async checkDatabase() {
      throw new Error('Database check failed')
    },
  })
  await assert.rejects(controller.getHealth(), (error) => {
    assert.equal(error.getStatus(), 503)
    assert.deepEqual(error.getResponse(), { status: 'unavailable' })
    return true
  })
})
