import assert from 'node:assert/strict'
import test from 'node:test'
import { allocateCents } from '../../../dist/modules/reporting/report-money.js'
import { dateLabel, reportRange } from '../../../dist/modules/reporting/report-range.js'

test('allocates exact cents by remainder, breaking ties by line position', () => {
  const lines = [
    { position: 2, subtotal: 100n },
    { position: 1, subtotal: 100n },
    { position: 3, subtotal: 200n },
    { position: 4, subtotal: 0n },
  ]
  assert.deepEqual(allocateCents(6n, lines), [1n, 2n, 3n, 0n])
  assert.deepEqual(allocateCents(3n, lines), [1n, 1n, 1n, 0n])
  assert.deepEqual(allocateCents(0n, lines), [0n, 0n, 0n, 0n])
  assert.deepEqual(allocateCents(0n, [{ position: 1, subtotal: 0n }]), [0n])
})

test('validates UTC dates and converts an inclusive range to exclusive midnight', () => {
  const defaultRange = reportRange(undefined, undefined, new Date('2024-03-01T23:59:59Z'))
  assert.equal(dateLabel(defaultRange.start), '2024-01-02')
  assert.equal(defaultRange.days, 60)
  assert.equal(defaultRange.until.toISOString(), '2024-03-02T00:00:00.000Z')
  assert.equal(reportRange('2024-01-01', '2024-12-31').days, 366)
  for (const [start, end] of [
    ['2023-02-29', '2023-03-01'], ['2024-02-02', '2024-02-01'],
    ['2024-01-01', '2025-01-01'], ['2024-01-01', undefined],
    [['2024-01-01'], '2024-01-01'], ['2024-01-01T00:00:00Z', '2024-01-01'],
  ]) {
    assert.throws(() => reportRange(start, end), { status: 400 })
  }
})
