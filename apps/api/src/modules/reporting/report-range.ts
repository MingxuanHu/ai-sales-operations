import { BadRequestException } from '@nestjs/common'

// UTC days always have the same length, even when local clocks change.
export const dayMilliseconds = 86_400_000
export const dateLabel = (date: Date) => date.toISOString().slice(0, 10)

function parseDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) {
    throw new BadRequestException('Use YYYY-MM-DD UTC dates')
  }
  const date = new Date(value + 'T00:00:00.000Z')
  // JavaScript normalises some impossible dates, so check the round trip.
  if (!Number.isFinite(date.getTime()) || dateLabel(date) !== value) {
    throw new BadRequestException('Use valid calendar dates')
  }
  return date
}

export function reportRange(startDate: unknown, endDate: unknown, now = new Date()) {
  const today = parseDate(dateLabel(now))
  const start = startDate === undefined && endDate === undefined
    ? new Date(today.getTime() - 59 * dayMilliseconds)
    : parseDate(startDate)
  const end = startDate === undefined && endDate === undefined ? today : parseDate(endDate)
  const until = new Date(end.getTime() + dayMilliseconds)
  const days = (until.getTime() - start.getTime()) / dayMilliseconds
  if (days < 1 || days > 366) throw new BadRequestException('Select an inclusive range of 1 to 366 days')
  return { start, end, until, days }
}
