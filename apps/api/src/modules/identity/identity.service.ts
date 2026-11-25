import { randomUUID } from 'node:crypto'
import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common'
import { isUniqueConstraintViolation } from '../../database/prisma-errors'
import { PrismaService } from '../../database/prisma.service'
import { Prisma } from '../../generated/prisma/client'
import { MembershipRole } from '../../generated/prisma/enums'
import { provisionDemo } from './demo-organisation'

@Injectable()
export class IdentityService {
  // Nest injects the shared database provider when it constructs this service.
  constructor(private readonly database: PrismaService) {}

  async resolveUser(subject: string) {
    const db = this.database.client
    const findIdentityBySubject = () => db.externalIdentity.findUnique({ where: { subject } })
    const existing = await findIdentityBySubject()
    if (existing) return existing.userId

    try {
      // First sign-in completes app registration. Commit the identity only if its demo is ready.
      return await db.$transaction(async (tx) => {
        const identity = await tx.externalIdentity.create({ data: { subject, user: { create: {} } } })
        await provisionDemo(tx, identity.userId, randomUUID())
        return identity.userId
      })
    } catch (error) {
      // Another request may have inserted the same unique subject. Read the winning row.
      if (!isUniqueConstraintViolation(error)) throw error
      const concurrentIdentity = await findIdentityBySubject()
      if (!concurrentIdentity) throw error
      return concurrentIdentity.userId
    }
  }

  async me(userId: string) {
    // The nested select fetches related names in bulk. Like overview(), this read
    // uses RepeatableRead so any separate queries see the same database snapshot.
    const [memberships] = await this.database.client.$transaction(
      [this.database.client.membership.findMany({
        where: { userId, status: 'active' },
        // true includes that field in the result. The inner select includes only the organisation name.
        select: { organisationId: true, role: true, organisation: { select: { name: true } } },
        orderBy: { organisationId: 'asc' },
      })],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    return {
      userId,
      memberships: memberships.map(({ organisationId, role, organisation }) => ({
        organisationId, role, name: organisation.name,
      })),
    }
  }

  async createOrganisation(userId: string, name: string, requestId: string) {
    const db = this.database.client
    try {
      // Prisma inserts the organisation and uses its new ID to insert the first
      // admin membership, then SELECTs the new organisation for the result.
      // That's three data statements on this Prisma version, committed together.
      const organisation = await db.organisation.create({
        data: {
          name, createdByUserId: userId, creationRequestId: requestId,
          memberships: { create: { userId, role: 'admin' } },
        },
      })
      // true means this request created the organisation, so the controller sends 201.
      return { organisationId: organisation.id, created: true }
    } catch (error) {
      // A repeated request may have hit the unique creator/request ID pair.
      if (!isUniqueConstraintViolation(error)) throw error
      const existing = await db.organisation.findUnique({
        // Prisma joins the field names in @@unique with underscores. Supply both
        // values inside that generated key so findUnique can match the pair.
        where: { createdByUserId_creationRequestId: { createdByUserId: userId, creationRequestId: requestId } },
      })
      if (!existing) throw error
      if (existing.isDemo || existing.name !== name) throw new ConflictException('Request ID already used')
      return { organisationId: existing.id, created: false }
    }
  }

  async createDemo(userId: string, requestId: string) {
    const db = this.database.client
    try {
      const organisationId = await db.$transaction((tx) => provisionDemo(tx, userId, requestId))
      return { organisationId, created: true }
    } catch (error) {
      // The creation key is shared with regular organisations. Only a demo can satisfy this retry.
      if (!isUniqueConstraintViolation(error)) throw error
      const existing = await db.organisation.findUnique({
        where: { createdByUserId_creationRequestId: { createdByUserId: userId, creationRequestId: requestId } },
      })
      if (!existing) throw error
      if (!existing.isDemo) throw new ConflictException('Request ID already used')
      return { organisationId: existing.id, created: false }
    }
  }

  async overview(organisationId: string, userId: string) {
    // Prisma may issue separate queries for the membership and organisation name.
    // RepeatableRead keeps both reads on the same PostgreSQL snapshot.
    const [membership] = await this.database.client.$transaction(
      [this.database.client.membership.findUnique({
        where: { organisationId_userId: { organisationId, userId }, status: 'active' },
        select: { organisationId: true, role: true, organisation: { select: { name: true } } },
      })],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    )
    if (!membership) throw new NotFoundException()
    return { organisationId: membership.organisationId, name: membership.organisation.name, role: membership.role }
  }

  async lockOrganisation(tx: Prisma.TransactionClient, organisationId: string) {
    // Prisma's model methods have no FOR UPDATE option. Tenant writes take this row
    // lock before checking access. Read Committed lets those checks see changes
    // committed while waiting for the lock. A tagged template calls $queryRaw without parentheses
    // and passes the interpolated ID as a bound SQL parameter.
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT id FROM organisations WHERE id = ${organisationId}::uuid FOR UPDATE
    `
    if (!rows.length) throw new NotFoundException()
  }

  async requireRole(tx: Prisma.TransactionClient, organisationId: string, userId: string, role: MembershipRole) {
    const membership = await tx.membership.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
    })
    if (membership?.status !== 'active') throw new NotFoundException()
    if (membership.role !== role) throw new ForbiddenException()
  }

  async changeMembership(organisationId: string, actorId: string, userId: string, role?: MembershipRole) {
    return this.database.client.$transaction(async (tx) => {
      await this.lockOrganisation(tx, organisationId)
      await this.requireRole(tx, organisationId, actorId, 'admin')
      const where = { organisationId_userId: { organisationId, userId } }
      const target = await tx.membership.findUnique({ where })
      if (!target || (target.status === 'removed' && role)) throw new NotFoundException()
      if (target.status === 'removed') return

      if (target.role === 'admin' && role !== 'admin') {
        const admins = await tx.membership.count({ where: { organisationId, status: 'active', role: 'admin' } })
        if (admins === 1) throw new ConflictException('The organisation must retain an active administrator')

        // Demoted administrators lose the ability to sponsor their pending invites.
        await tx.invitation.updateMany({
          where: { organisationId, issuedByUserId: userId, status: 'pending' },
          data: { status: 'revoked', resolvedAt: new Date() },
        })
      }
      if (!role) {
        await tx.invitation.updateMany({
          where: { organisationId, recipientUserId: userId, status: 'pending' },
          data: { status: 'revoked', resolvedAt: new Date() },
        })
      }
      return tx.membership.update({
        where,
        data: role ? { role } : { status: 'removed' },
        select: { userId: true, role: true, status: true },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted })
  }
}
