import assert from 'node:assert/strict'
import test from 'node:test'
// The test imports the JavaScript file emitted by the TypeScript compiler.
import { HealthController } from '../dist/health.controller.js'

test('the health controller reports API liveness', () => {
  // Calling the controller directly checks its return value without starting a server.
  assert.deepEqual(new HealthController().getHealth(), { status: 'ok' })
})
