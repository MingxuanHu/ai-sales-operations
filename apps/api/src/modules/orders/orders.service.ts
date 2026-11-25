import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { OrderStatus, Prisma, type SalesOrder } from '../../generated/prisma/client'
import { IdentityService } from '../identity/identity.service'
import { orderInput } from './order-input'
import { money, orderAmounts } from './order-money'

// Positions keep nested rows in submission order even when timestamps match.
const details = {
  lines: { orderBy: { position: 'asc' } },
  history: { orderBy: { position: 'asc' } },
} satisfies Prisma.SalesOrderInclude

function summary(order: SalesOrder) {
  const { id, submittedByUserId, customerId, customerName, status, createdAt } = order
  return {
    id, submittedByUserId, customerId, customerName, status, createdAt,
    discountPercent: order.discountPercent.toFixed(2),
    approvalThresholdPercent: order.approvalThresholdPercent.toFixed(2),
    subtotal: order.subtotal.toFixed(2),
    total: order.total.toFixed(2),
  }
}

function detail(order: Prisma.SalesOrderGetPayload<{ include: typeof details }>) {
  return {
    ...summary(order),
    lines: order.lines.map(({ productId, sku, name, unitPrice, quantity }) => ({
      productId, sku, name, unitPrice: unitPrice.toFixed(2), quantity,
    })),
    history: order.history.map(({ kind, actorUserId, fromStatus, toStatus, createdAt }) => ({
      kind, actorUserId, fromStatus, toStatus, createdAt,
    })),
  }
}

function approvalThreshold(settings: Prisma.JsonValue) {
  // Settings values are JSON, so narrow the value before using it in the approval rule.
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    const threshold = settings.orderApprovalThresholdBasisPoints
    if (threshold === undefined) return 1_000 // 1,000 hundredths of a percent is 10%.
    if (typeof threshold === 'number' && Number.isInteger(threshold) && threshold >= 0 && threshold <= 10_000) {
      return threshold
    }
  }
  throw new InternalServerErrorException('Invalid organisation order approval settings.')
}

@Injectable()
export class OrdersService {
  // Nest injects the shared database and identity services into this constructor.
  constructor(private readonly database: PrismaService, private readonly identity: IdentityService) {}

  private async readScope(tx: Prisma.TransactionClient, organisationId: string, userId: string) {
    const member = await tx.membership.findUnique({ where: { organisationId_userId: { organisationId, userId } } })
    if (member?.status !== 'active') throw new NotFoundException()
    if (member.role === 'admin') throw new ForbiddenException()
    return member.role === 'salesperson' ? { organisationId, submittedByUserId: userId } : { organisationId }
  }

  list(organisationId: string, userId: string, status?: string) {
    return this.database.client.$transaction(async (tx) => {
      const scope = await this.readScope(tx, organisationId, userId)
      const filter = Object.values(OrderStatus).find((value) => value === status)
      if (status !== undefined && !filter) throw new BadRequestException('Invalid order status filter.')
      const orders = await tx.salesOrder.findMany({
        where: { ...scope, ...(filter && { status: filter }) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      return { orders: orders.map(summary) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  }

  get(organisationId: string, userId: string, id: string) {
    return this.database.client.$transaction(async (tx) => {
      // A repeatable-read snapshot keeps the membership check and order lookup consistent.
      const scope = await this.readScope(tx, organisationId, userId)
      const order = await tx.salesOrder.findUnique({ where: { id, ...scope }, include: details })
      if (!order) throw new NotFoundException('Order not found.')
      return detail(order)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  }

  selectors(organisationId: string, userId: string) {
    return this.database.client.$transaction(async (tx) => {
      await this.identity.requireRole(tx, organisationId, userId, 'salesperson')
      const customers = await tx.customer.findMany({
        where: { organisationId }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      })
      const products = await tx.product.findMany({
        where: { organisationId }, select: { id: true, sku: true, name: true, unitPrice: true }, orderBy: { sku: 'asc' },
      })
      return { customers, products: products.map((product) => ({ ...product, unitPrice: product.unitPrice.toFixed(2) })) }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
  }

  // The union type limits callers to states that have a lifecycle command.
  transition(organisationId: string, userId: string, id: string, status: 'approved' | 'rejected' | 'fulfilled') {
    return this.database.client.$transaction(async (tx) => {
      // Lock before reading membership and state so competing writes see the latest committed values.
      await this.identity.lockOrganisation(tx, organisationId)
      const fulfilling = status === 'fulfilled'
      await this.identity.requireRole(tx, organisationId, userId, fulfilling ? 'salesperson' : 'manager')
      const where = { id, organisationId, ...(fulfilling && { submittedByUserId: userId }) }
      const current = await tx.salesOrder.findUnique({
        where,
        select: { status: true, history: { select: { position: true }, orderBy: { position: 'desc' }, take: 1 } },
      })
      if (!current) throw new NotFoundException('Order not found.')
      const fromStatus = fulfilling ? 'approved' : 'pending'
      if (current.status !== fromStatus) {
        throw new ConflictException(`Order must be ${fromStatus} for this action.`)
      }

      // Prisma's nested write appends history with the state update, so an audit failure rolls back both.
      const order = await tx.salesOrder.update({
        where,
        data: {
          status,
          history: {
            create: {
              position: (current.history[0]?.position ?? -1) + 1,
              kind: status,
              actorUserId: userId,
              fromStatus,
              toStatus: status,
            },
          },
        },
        include: details,
      })
      return detail(order)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
  }

  submit(organisationId: string, userId: string, body: unknown) {
    return this.database.client.$transaction(async (tx) => {
      // The shared tenant lock serializes retries, membership changes and master-data writes.
      await this.identity.lockOrganisation(tx, organisationId)
      await this.identity.requireRole(tx, organisationId, userId, 'salesperson')
      const { requestId, customerId, discount, lines } = orderInput(body)
      const requestHash = createHash('sha256').update(JSON.stringify({ customerId, discount, lines })).digest('hex')
      const previous = await tx.salesOrder.findUnique({
        where: { organisationId_submittedByUserId_requestId: { organisationId, submittedByUserId: userId, requestId } },
        include: details,
      })
      if (previous) {
        if (previous.requestHash !== requestHash) throw new ConflictException('This request ID was already used for a different order.')
        return detail(previous)
      }

      const customer = await tx.customer.findUnique({ where: { id: customerId, organisationId } })
      if (!customer) throw new NotFoundException('Customer not found.')
      const products = await tx.product.findMany({ where: { organisationId, id: { in: lines.map((line) => line.productId) } } })
      const byId = new Map(products.map((product) => [product.id, product]))
      const snapshots = lines.map(({ productId, quantity }, position) => {
        const product = byId.get(productId)
        if (!product) throw new NotFoundException(`Product on line ${position + 1} not found.`)
        const { sku, name, unitPrice } = product
        return { position, productId, sku, name, unitPrice, quantity }
      })
      const { subtotal, total } = orderAmounts(snapshots, discount)
      // Read the policy under the organisation lock after checking for a matching retry.
      const { settings } = await tx.organisation.findUniqueOrThrow({ where: { id: organisationId }, select: { settings: true } })
      const threshold = approvalThreshold(settings)
      const status = discount <= threshold ? OrderStatus.approved : OrderStatus.pending
      const history: Prisma.OrderEventUncheckedCreateWithoutOrderInput[] = [
        { position: 0, kind: 'submitted', actorUserId: userId, toStatus: 'pending' },
      ]
      if (status === 'approved') {
        history.push({ position: 1, kind: 'automatically_approved', fromStatus: 'pending', toStatus: 'approved' })
      }
      // Prisma's nested create writes the order, snapshots and history as one unit.
      const order = await tx.salesOrder.create({
        data: {
          organisationId, submittedByUserId: userId, requestId, requestHash, customerId,
          customerName: customer.name, status, discountPercent: money(BigInt(discount)),
          approvalThresholdPercent: money(BigInt(threshold)), subtotal, total,
          lines: { create: snapshots }, history: { create: history },
        },
        include: details,
      })
      return detail(order)
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
  }
}
