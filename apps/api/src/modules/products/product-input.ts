import { BadRequestException } from '@nestjs/common'

function requiredText(value: unknown, label: string, limit: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed || [...trimmed].length > limit || trimmed.includes('\0')) {
    throw new BadRequestException(`${label} must contain 1 to ${limit} characters and no null characters.`)
  }
  return trimmed
}

export function productInput(body: unknown) {
  // Narrow the untrusted JSON value before accessing its fields.
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Provide a product object.')
  }
  const { sku, name, unitPrice } = body as Record<string, unknown>
  // Accept a decimal string so parsing never rounds through a JavaScript number.
  if (typeof unitPrice !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(unitPrice) || unitPrice !== unitPrice.trim()) {
    throw new BadRequestException('Unit price must be non-negative, with up to 10 digits before and 2 digits after the decimal point.')
  }
  return { sku: requiredText(sku, 'SKU', 64), name: requiredText(name, 'Name', 120), unitPrice }
}
