// The database amounts have two decimal places. BigInt keeps every cent exact.
export function cents(amount: { toFixed(digits: number): string }) {
  return BigInt(amount.toFixed(2).replace('.', ''))
}

export function allocateCents(total: bigint, lines: { position: number; subtotal: bigint }[]) {
  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0n)
  if (subtotal === 0n) return lines.map(() => 0n)

  // Keep each share's fractional remainder so leftover cents can be awarded in order.
  const shares = lines.map(({ position, subtotal: lineSubtotal }, index) => {
    const numerator = total * lineSubtotal
    return { position, index, cents: numerator / subtotal, remainder: numerator % subtotal }
  })
  const allocations = shares.map(share => share.cents)
  const leftover = total - allocations.reduce((sum, amount) => sum + amount, 0n)
  // Position is the line identifier within this order's composite key.
  shares.sort((a, b) => a.remainder === b.remainder ? a.position - b.position : a.remainder > b.remainder ? -1 : 1)
  for (const share of shares.slice(0, Number(leftover))) allocations[share.index] += 1n
  return allocations
}
