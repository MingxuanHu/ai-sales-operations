import { BadRequestException } from '@nestjs/common'

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label} must be an object.`)
  }
  return value as Record<string, unknown>
}

function uuid(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length !== 36 || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException(`${label} must be a UUID.`)
  }
  return value.toLowerCase()
}

export function orderInput(body: unknown) {
  const { requestId, customerId, discountPercent, lines } = object(body, 'Order')
  // Parse decimal strings as integers so the threshold uses hundredths of a percent.
  if (typeof discountPercent !== 'string' || !/^\d{1,3}(\.\d{1,2})?$/.test(discountPercent) ||
      discountPercent !== discountPercent.trim() || Number(discountPercent) > 100) {
    throw new BadRequestException('Discount percent must be a decimal string from 0 to 100 with up to two decimal places.')
  }
  const [whole, fraction = ''] = discountPercent.split('.')
  const discount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new BadRequestException('Provide at least one order line.')
  }
  return {
    requestId: uuid(requestId, 'Request ID'),
    customerId: uuid(customerId, 'Customer ID'),
    discount,
    lines: lines.map((value: unknown, index) => {
      const label = `Line ${index + 1}`
      const { productId, quantity } = object(value, label)
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 2_147_483_647) {
        throw new BadRequestException(`${label} quantity must be a whole number from 1 to 2147483647.`)
      }
      return { productId: uuid(productId, `${label} product ID`), quantity }
    }),
  }
}
