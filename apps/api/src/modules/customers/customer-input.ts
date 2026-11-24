import { BadRequestException } from '@nestjs/common'

export function customerInput(body: unknown) {
  // Narrow untrusted JSON before reading its fields.
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Provide a customer object.')
  }
  const { name } = body as Record<string, unknown>
  const trimmed = typeof name === 'string' ? name.trim() : ''
  // Iterating the string counts Unicode code points, matching PostgreSQL's length limit.
  if (!trimmed || [...trimmed].length > 120 || trimmed.includes('\0')) {
    throw new BadRequestException('Name must contain 1 to 120 characters and no null characters.')
  }
  return { name: trimmed }
}
