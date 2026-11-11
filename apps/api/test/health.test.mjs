import assert from 'node:assert/strict'
import test from 'node:test'
import { HealthController } from '../dist/health.controller.js'

test('the health controller reports API liveness', () => {
  assert.deepEqual(new HealthController().getHealth(), { status: 'ok' })
})
