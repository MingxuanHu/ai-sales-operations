import { randomUUID } from 'node:crypto'
import { Prisma, type OrderStatus } from '../../generated/prisma/client'
import { money, orderAmounts } from '../orders/order-money'

const customers = [
  'Fern Lane Café', 'Juniper Bakehouse', 'Paperbark Coffee', 'Wattle Corner Deli', 'Banksia Kiosk',
  'Acorn Espresso', 'Blue Wren Bakery', 'Clover Street Café', 'Dogwood Deli', 'Elm & Ember Coffee',
  'Fig Tree Kitchen', 'Golden Wattle Bakery', 'Hazel Corner Café', 'Ironbark Espresso', 'Jasmine Lane Deli',
]
const products = [
  { sku: 'CUP-08', name: '8 oz paper cups (case of 500)', unitPrice: '44.50' },
  { sku: 'CUP-12', name: '12 oz paper cups (case of 500)', unitPrice: '52.75' },
  { sku: 'LID-90', name: '90 mm cup lids (case of 500)', unitPrice: '34.25' },
  { sku: 'BAG-KR', name: 'Kraft takeaway bags (case of 250)', unitPrice: '29.80' },
  { sku: 'NAP-2P', name: 'Two-ply napkins (case of 1,000)', unitPrice: '24.60' },
  { sku: 'TRAY-4', name: 'Four-cup carriers (case of 100)', unitPrice: '19.95' },
  { sku: 'CUP-16', name: '16 oz paper cups (case of 500)', unitPrice: '61.25' },
  { sku: 'LID-80', name: '80 mm cup lids (case of 500)', unitPrice: '32.40' },
  { sku: 'SLV-KR', name: 'Kraft cup sleeves (case of 500)', unitPrice: '27.50' },
  { sku: 'STIR-WD', name: 'Wooden stirrers (case of 1,000)', unitPrice: '16.80' },
  { sku: 'STRAW-P', name: 'Paper straws (case of 500)', unitPrice: '23.75' },
  { sku: 'BOX-SM', name: 'Small takeaway boxes (case of 200)', unitPrice: '38.60' },
  { sku: 'BOX-LG', name: 'Large takeaway boxes (case of 200)', unitPrice: '46.20' },
  { sku: 'PCH-KR', name: 'Kraft sandwich pouches (case of 500)', unitPrice: '33.90' },
  { sku: 'LIN-GP', name: 'Greaseproof liners (case of 1,000)', unitPrice: '28.35' },
  { sku: 'CUT-WD', name: 'Wooden cutlery sets (case of 250)', unitPrice: '41.50' },
]

// Each tuple is fulfilment age in days, customer index, discount in basis points,
// and pairs of catalogue index and case quantity.
const sales: [number, number, number, [number, number][]][] = [
  [54, 0, 0, [[0, 4], [2, 4]]],
  [52, 2, 500, [[1, 3], [2, 3], [5, 2]]],
  [47, 1, 0, [[3, 5], [4, 3]]],
  [45, 3, 1_000, [[1, 5], [2, 5], [4, 2]]],
  [40, 0, 500, [[0, 5], [2, 5], [4, 2]]],
  [37, 4, 0, [[0, 2], [3, 3]]],
  [35, 2, 1_250, [[1, 8], [2, 8], [5, 4]]],
  [33, 1, 0, [[3, 6], [4, 4]]],
  [30, 3, 750, [[1, 4], [2, 4]]],
  [27, 0, 0, [[0, 6], [2, 6]]],
  [25, 4, 500, [[0, 3], [5, 2]]],
  [23, 2, 0, [[1, 5], [2, 5], [4, 3]]],
  [20, 1, 500, [[3, 8], [4, 5]]],
  [17, 3, 1_500, [[1, 10], [2, 10], [3, 4]]],
  [15, 0, 0, [[0, 6], [2, 6], [5, 3]]],
  [12, 4, 0, [[0, 3], [3, 2]]],
  [10, 2, 1_000, [[1, 7], [2, 7], [5, 3]]],
  [8, 1, 500, [[3, 7], [4, 4]]],
  [5, 0, 1_250, [[0, 10], [2, 10], [4, 4]]],
  [1, 3, 0, [[1, 6], [2, 6], [3, 4]]],
  // Add sales on quiet days and a second sale on an existing chart day.
  [49, 4, 0, [[3, 9], [5, 6]]],
  [42, 1, 750, [[0, 5], [4, 8], [5, 6]]],
  [36, 0, 0, [[1, 4], [2, 4], [3, 5]]],
  [29, 4, 1_500, [[0, 8], [2, 8], [5, 5]]],
  [22, 3, 0, [[3, 10], [4, 6]]],
  [16, 2, 500, [[1, 8], [2, 8], [5, 5]]],
  [5, 1, 0, [[3, 12], [4, 8]]],
  [3, 4, 1_000, [[0, 7], [2, 7], [5, 5]]],
  // Each new customer buys two catalogue products, so every added product has sales.
  [56, 5, 0, [[6, 4], [7, 4]]],
  [44, 6, 500, [[7, 3], [8, 6]]],
  [31, 7, 0, [[8, 5], [9, 4]]],
  [24, 8, 0, [[9, 5], [10, 3]]],
  [18, 9, 750, [[10, 6], [11, 4]]],
  [13, 10, 0, [[11, 6], [12, 5]]],
  [11, 11, 1_000, [[12, 7], [13, 8]]],
  [9, 12, 0, [[13, 4], [14, 5]]],
  [7, 13, 500, [[14, 9], [15, 6]]],
  [6, 14, 0, [[15, 3], [6, 5]]],
]
const outstanding: [OrderStatus, ...typeof sales[number]][] = [
  ['pending', 0, 2, 1_500, [[1, 9], [2, 9]]],
  ['pending', 1, 4, 1_001, [[0, 4], [3, 3]]],
  ['approved', 1, 1, 1_000, [[3, 5], [4, 4]]],
  ['rejected', 2, 3, 2_500, [[1, 12], [2, 12]]],
]

// Only the JSON boolean true marks a demo. Older regular organisations can omit the setting.
export function isDemoOrganisation(settings: Prisma.JsonValue) {
  return settings !== null && typeof settings === 'object' && !Array.isArray(settings) && settings.isDemo === true
}

export async function provisionDemo(tx: Prisma.TransactionClient, userId: string, requestId: string) {
  const id = randomUUID()
  const { createdAt } = await tx.organisation.create({
    data: {
      id, name: `Demo · Fern & Finch Supply · ${id}`,
      // Keep the previous column populated so the prior API build can still recognise new demos.
      isDemo: true, settings: { isDemo: true },
      createdByUserId: userId, creationRequestId: requestId,
      memberships: { create: { userId, role: 'admin' } },
    },
  })
  // Preassign IDs so bulk inserts can verify the tenant's references without depending on return order.
  const buyerRows = customers.map((name) => ({ id: randomUUID(), organisationId: id, name }))
  const productRows = products.map((product) => ({ ...product, id: randomUUID(), organisationId: id }))
  await tx.customer.createMany({ data: buyerRows })
  await tx.product.createMany({ data: productRows })

  const orders: Prisma.SalesOrderCreateManyInput[] = []
  const lines: Prisma.OrderLineCreateManyInput[] = []
  const events: Prisma.OrderEventCreateManyInput[] = []
  const fixtures: typeof outstanding = [...sales.map((sale): typeof outstanding[number] => ['fulfilled', ...sale]), ...outstanding]
  const hour = 60 * 60 * 1_000
  for (const [status, age, buyerIndex, discount, items] of fixtures) {
    const orderId = randomUUID()
    const customer = buyerRows[buyerIndex]
    const snapshots = items.map(([productIndex, quantity], position) => {
      const { id: productId, sku, name, unitPrice } = productRows[productIndex]
      return { orderId, position, productId, sku, name, unitPrice: new Prisma.Decimal(unitPrice), quantity }
    })
    const completedAt = new Date(createdAt.getTime() - age * 24 * hour)
    const submittedAt = new Date(completedAt.getTime() - 26 * hour)
    const decisionAt = new Date(completedAt.getTime() - 24 * hour)
    const automatic = discount <= 1_000
    orders.push({
      id: orderId, organisationId: id, customerId: customer.id, customerName: customer.name,
      requestId: orderId, requestHash: '0'.repeat(64), status, createdAt: submittedAt,
      discountPercent: money(BigInt(discount)), approvalThresholdPercent: '10.00',
      ...orderAmounts(snapshots, discount),
    })
    lines.push(...snapshots)
    // Event positions preserve lifecycle order, including approvals at the submission timestamp.
    events.push({ orderId, position: 0, kind: 'submitted', toStatus: 'pending', createdAt: submittedAt })
    if (status !== 'pending') {
      const decision = status === 'rejected' ? 'rejected' : 'approved'
      events.push({
        orderId, position: 1, kind: automatic ? 'automatically_approved' : decision,
        fromStatus: 'pending', toStatus: decision, createdAt: automatic ? submittedAt : decisionAt,
      })
    }
    if (status === 'fulfilled') {
      events.push({ orderId, position: 2, kind: 'fulfilled', fromStatus: 'approved', toStatus: 'fulfilled', createdAt: completedAt })
    }
  }
  await tx.salesOrder.createMany({ data: orders })
  await tx.orderLine.createMany({ data: lines })
  await tx.orderEvent.createMany({ data: events })
  return id
}
