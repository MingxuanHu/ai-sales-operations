import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { IdentityService } from '../identity/identity.service'
import { money } from '../orders/order-money'
import { allocateCents, cents } from './report-money'
import { dateLabel, dayMilliseconds, reportRange } from './report-range'

type Ranking = { id: string; name: string; net: bigint }
type ProductRanking = Ranking & { casesSold: number }

function ranked<T extends Ranking>(entries: Map<string, T>) {
  return [...entries.values()]
    .sort((a, b) => a.net === b.net ? a.id.localeCompare(b.id) : a.net > b.net ? -1 : 1)
    .map(({ net, ...entry }) => ({ ...entry, netSales: money(net) }))
}

// Injectable lets Nest supply the database and identity services.
@Injectable()
export class ReportingService {
  constructor(private readonly database: PrismaService, private readonly identity: IdentityService) {}

  async sales(organisationId: string, userId: string, startDate: unknown, endDate: unknown) {
    const { start, end, until, days } = reportRange(startDate, endDate)
    const fulfilment = { kind: 'fulfilled' as const, createdAt: { gte: start, lt: until } }

    // One snapshot gives the permission check and the full report a consistent view of the database.
    const orders = await this.database.client.$transaction(async tx => {
      await this.identity.requireRole(tx, organisationId, userId, 'admin', 'manager')
      return tx.salesOrder.findMany({
        where: {
          organisationId, status: 'fulfilled', history: { some: fulfilment },
          customer: { organisationId },
          lines: { every: { product: { organisationId } } },
        },
        select: {
          total: true,
          customer: { select: { id: true, name: true } },
          history: { where: fulfilment, orderBy: { position: 'asc' }, take: 1, select: { createdAt: true } },
          lines: { select: { position: true, quantity: true, unitPrice: true, product: { select: { id: true, name: true } } } },
        },
      })
    }, { isolationLevel: 'RepeatableRead' })

    // Pre-fill the chart so dates without fulfilments still appear in order.
    const daily = new Map<string, bigint>(Array.from({ length: days }, (_, index) => [
      dateLabel(new Date(start.getTime() + index * dayMilliseconds)), 0n,
    ] as const))
    const customers = new Map<string, Ranking>()
    const products = new Map<string, ProductRanking>()
    let netSales = 0n
    for (const order of orders) {
      const net = cents(order.total)
      netSales += net
      const date = dateLabel(order.history[0].createdAt)
      daily.set(date, (daily.get(date) ?? 0n) + net)

      // IDs keep sales together even when names change or two records share a name.
      const customer = customers.get(order.customer.id) ?? { ...order.customer, net: 0n }
      customer.net += net
      customers.set(customer.id, customer)

      // The order line stores the original unit price and quantity, which together reconstruct its subtotal.
      const allocations = allocateCents(net, order.lines.map(line => ({
        position: line.position, subtotal: cents(line.unitPrice) * BigInt(line.quantity),
      })))
      for (const [index, line] of order.lines.entries()) {
        const product = products.get(line.product.id) ?? { ...line.product, net: 0n, casesSold: 0 }
        product.net += allocations[index]
        product.casesSold += line.quantity
        products.set(product.id, product)
      }
    }

    return {
      startDate: dateLabel(start), endDate: dateLabel(end),
      fulfilledOrderCount: orders.length, netSales: money(netSales),
      daily: [...daily].map(([date, net]) => ({ date, netSales: money(net) })),
      products: ranked(products), customers: ranked(customers),
    }
  }
}
