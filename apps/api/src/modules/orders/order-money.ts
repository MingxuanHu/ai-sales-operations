// Format nonnegative integer cents as a decimal string for Prisma.
export function money(cents: bigint) {
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}

// Both fixture and live orders use the same cent rounding.
export function orderAmounts(lines: { unitPrice: { toFixed(digits: number): string }; quantity: number }[], discount: number) {
  // BigInt keeps large quantities exact. Add half the divisor before truncating to round half up.
  const subtotal = lines.reduce((sum, line) => (
    sum + BigInt(line.unitPrice.toFixed(2).replace('.', '')) * BigInt(line.quantity)
  ), 0n)
  const total = (subtotal * BigInt(10_000 - discount) + 5_000n) / 10_000n
  return { subtotal: money(subtotal), total: money(total) }
}
