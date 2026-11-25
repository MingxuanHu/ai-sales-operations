import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { isForeignKeyViolation } from '../../database/prisma-errors'
import { PrismaService } from '../../database/prisma.service'
import { Prisma } from '../../generated/prisma/client'
import { IdentityService } from '../identity/identity.service'
import { customerInput } from './customer-input'

// Select the public directory fields without returning the tenant foreign key.
const directoryFields = { id: true, name: true } as const

@Injectable()
export class CustomersService {
  constructor(private readonly database: PrismaService, private readonly identity: IdentityService) {}

  private async asAdmin<T>(
    organisationId: string, userId: string, write: boolean,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.database.client.$transaction(async (tx) => {
      // Share the membership lock so a role change cannot race a customer write.
      if (write) await this.identity.lockOrganisation(tx, organisationId)
      await this.identity.requireRole(tx, organisationId, userId, 'admin')
      return operation(tx)
    }, {
      isolationLevel: write
        ? Prisma.TransactionIsolationLevel.ReadCommitted
        : Prisma.TransactionIsolationLevel.RepeatableRead,
    })
  }

  list(organisationId: string, userId: string) {
    return this.asAdmin(organisationId, userId, false, async (tx) => {
      const customers = await tx.customer.findMany({ where: { organisationId }, select: directoryFields, orderBy: [{ name: 'asc' }, { id: 'asc' }] })
      return { customers: customers }
    })
  }

  get(organisationId: string, userId: string, id: string) {
    return this.asAdmin(organisationId, userId, false, async (tx) => {
      // Match both IDs even when the caller is an administrator.
      const customer = await tx.customer.findUnique({ where: { id, organisationId }, select: directoryFields })
      if (!customer) throw new NotFoundException('Customer not found.')
      return customer
    })
  }

  create(organisationId: string, userId: string, body: unknown) {
    return this.asAdmin(organisationId, userId, true, async (tx) => {
      const customer = await tx.customer.create({ data: { ...customerInput(body), organisationId }, select: directoryFields })
      return customer
    })
  }

  update(organisationId: string, userId: string, id: string, body: unknown) {
    return this.asAdmin(organisationId, userId, true, async (tx) => {
      // updateManyAndReturn returns an empty list when the tenant-scoped filter matches no rows.
      const [customer] = await tx.customer.updateManyAndReturn({
        where: { id, organisationId }, data: customerInput(body), select: directoryFields,
      })
      if (!customer) throw new NotFoundException('Customer not found.')
      return customer
    })
  }

  async remove(organisationId: string, userId: string, id: string) {
    try {
      await this.asAdmin(organisationId, userId, true, async (tx) => {
        const { count } = await tx.customer.deleteMany({ where: { id, organisationId } })
        if (count === 0) throw new NotFoundException('Customer not found.')
      })
    } catch (error) {
      // PostgreSQL rejects deletion when an order references this record.
      if (isForeignKeyViolation(error)) {
        throw new ConflictException('This customer cannot be deleted because it is used in an order.')
      }
      throw error
    }
  }
}
