import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { isUniqueConstraintViolation } from '../../database/prisma-errors'
import { PrismaService } from '../../database/prisma.service'
import { Prisma, type Product } from '../../generated/prisma/client'
import { IdentityService } from '../identity/identity.service'
import { productInput } from './product-input'

function productResponse({ id, sku, name, unitPrice }: Product) {
  // Always return a two-place decimal string, including trailing zeroes.
  return { id, sku, name, unitPrice: unitPrice.toFixed(2) }
}

@Injectable()
export class ProductsService {
  constructor(private readonly database: PrismaService, private readonly identity: IdentityService) {}

  private async asAdmin<T>(
    organisationId: string, userId: string, write: boolean,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.database.client.$transaction(async (tx) => {
        // Writes share the membership workflow's lock, so a role change cannot race the role check.
        if (write) await this.identity.lockOrganisation(tx, organisationId)
        await this.identity.requireRole(tx, organisationId, userId, 'admin')
        return operation(tx)
      }, {
        isolationLevel: write
          ? Prisma.TransactionIsolationLevel.ReadCommitted
          : Prisma.TransactionIsolationLevel.RepeatableRead,
      })
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('A product with this SKU already exists in this organisation.')
      }
      throw error
    }
  }

  list(organisationId: string, userId: string) {
    return this.asAdmin(organisationId, userId, false, async (tx) => {
      const products = await tx.product.findMany({ where: { organisationId }, orderBy: { sku: 'asc' } })
      return { products: products.map(productResponse) }
    })
  }

  get(organisationId: string, userId: string, id: string) {
    return this.asAdmin(organisationId, userId, false, async (tx) => {
      // Match both IDs even when the caller is an administrator.
      const product = await tx.product.findUnique({ where: { id, organisationId } })
      if (!product) throw new NotFoundException('Product not found.')
      return productResponse(product)
    })
  }

  create(organisationId: string, userId: string, body: unknown) {
    return this.asAdmin(organisationId, userId, true, async (tx) => {
      const product = await tx.product.create({ data: { ...productInput(body), organisationId } })
      return productResponse(product)
    })
  }

  update(organisationId: string, userId: string, id: string, body: unknown) {
    return this.asAdmin(organisationId, userId, true, async (tx) => {
      // updateManyAndReturn returns an empty list when the tenant-scoped filter matches no rows.
      const [product] = await tx.product.updateManyAndReturn({
        where: { id, organisationId }, data: productInput(body),
      })
      if (!product) throw new NotFoundException('Product not found.')
      return productResponse(product)
    })
  }

  remove(organisationId: string, userId: string, id: string) {
    return this.asAdmin(organisationId, userId, true, async (tx) => {
      const { count } = await tx.product.deleteMany({ where: { id, organisationId } })
      if (count === 0) throw new NotFoundException('Product not found.')
    })
  }
}
