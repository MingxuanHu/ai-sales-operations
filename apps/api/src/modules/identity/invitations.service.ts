import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../database/prisma.service'
import { Prisma } from '../../generated/prisma/client'
import { MembershipRole } from '../../generated/prisma/enums'
import { IdentityService } from './identity.service'

const sevenDays = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class InvitationsService {
  constructor(private readonly database: PrismaService, private readonly identity: IdentityService) {}

  async list(userId: string) {
    // One SQL statement reads the invitations and organisation names on one
    // snapshot. The same statement also checks the recipient and expiry.
    const invitations = await this.database.client.$queryRaw<
      { invitationId: string; organisationId: string; name: string; role: MembershipRole; expiresAt: Date }[]
    >`
      SELECT i.id AS "invitationId", i.organisation_id AS "organisationId", o.name,
             i.role, i.expires_at AS "expiresAt"
      FROM invitations i JOIN organisations o ON o.id = i.organisation_id
      WHERE i.recipient_user_id = ${userId}::uuid AND i.status = 'pending'
        AND i.expires_at > statement_timestamp()
      ORDER BY i.expires_at, i.id
    `
    return { invitations }
  }

  async issue(organisationId: string, actorId: string, recipientUserId: string, role: MembershipRole) {
    return this.database.client.$transaction(async (tx) => {
      await this.identity.lockOrganisation(tx, organisationId)
      await this.identity.requireRole(tx, organisationId, actorId, 'admin')
      const recipient = await tx.applicationUser.findUnique({ where: { id: recipientUserId } })
      if (!recipient) throw new NotFoundException()

      const membership = await tx.membership.findUnique({
        where: { organisationId_userId: { organisationId, userId: recipientUserId } },
      })
      if (membership?.status === 'active') throw new ConflictException('Recipient is already a member')

      const now = await this.currentTime(tx)
      const pending = await tx.invitation.findFirst({
        where: { organisationId, recipientUserId, status: 'pending' },
      })
      if (pending && pending.expiresAt > now) {
        if (pending.role !== role) throw new ConflictException('A pending invitation has a different role')
        return { invitationId: pending.id, role, expiresAt: pending.expiresAt, created: false }
      }
      if (pending) {
        await tx.invitation.update({
          where: { id: pending.id }, data: { status: 'expired', resolvedAt: now },
        })
      }
      const expiresAt = new Date(now.getTime() + sevenDays)
      const invitation = await tx.invitation.create({
        data: { organisationId, issuedByUserId: actorId, recipientUserId, role, expiresAt, createdAt: now },
      })
      return { invitationId: invitation.id, role, expiresAt, created: true }
    }, { isolationLevel: 'ReadCommitted' })
  }

  async accept(invitationId: string, userId: string) {
    return this.database.client.$transaction(async (tx) => {
      // This first lookup only finds the organisation to lock for this recipient.
      // Re-read the invitation after locking before making any decision about access.
      const target = await tx.invitation.findUnique({
        where: { id: invitationId, recipientUserId: userId }, select: { organisationId: true },
      })
      if (!target) throw new NotFoundException()
      const { organisationId } = target
      await this.identity.lockOrganisation(tx, organisationId)
      const invitation = await this.lockInvitation(tx, organisationId, invitationId)
      if (invitation.recipientUserId !== userId) throw new NotFoundException()

      const receipt = { invitationId, organisationId, status: 'accepted' }
      if (invitation.status === 'accepted') return receipt

      const now = await this.currentTime(tx)
      if (invitation.status !== 'pending' || invitation.expiresAt <= now) {
        throw new ConflictException('Invitation is no longer pending')
      }
      const issuer = await tx.membership.findUnique({
        where: { organisationId_userId: { organisationId, userId: invitation.issuedByUserId } },
      })
      if (issuer?.status !== 'active' || issuer.role !== 'admin') {
        throw new ConflictException('Invitation issuer is no longer an active administrator')
      }

      const where = { organisationId_userId: { organisationId, userId } }
      const membership = await tx.membership.findUnique({ where })
      if (!membership) {
        await tx.membership.create({ data: { organisationId, userId, role: invitation.role } })
      } else if (membership.status === 'removed') {
        await tx.membership.update({ where, data: { status: 'active', role: invitation.role } })
      }
      await tx.invitation.update({
        where: { id: invitationId }, data: { status: 'accepted', resolvedAt: now },
      })
      return receipt
    }, { isolationLevel: 'ReadCommitted' })
  }

  async revoke(organisationId: string, invitationId: string, actorId: string) {
    await this.database.client.$transaction(async (tx) => {
      await this.identity.lockOrganisation(tx, organisationId)
      await this.identity.requireRole(tx, organisationId, actorId, 'admin')
      const invitation = await this.lockInvitation(tx, organisationId, invitationId)
      if (invitation.status === 'revoked') return
      const now = await this.currentTime(tx)
      if (invitation.status !== 'pending' || invitation.expiresAt <= now) {
        throw new ConflictException('Invitation is no longer pending')
      }
      await tx.invitation.update({ where: { id: invitationId }, data: { status: 'revoked', resolvedAt: now } })
    }, { isolationLevel: 'ReadCommitted' })
  }

  private async lockInvitation(tx: Prisma.TransactionClient, organisationId: string, invitationId: string) {
    // The scoped SQL lock prevents a nested ID from selecting a different tenant's invite.
    const rows = await tx.$queryRaw<unknown[]>`
      SELECT id FROM invitations WHERE id = ${invitationId}::uuid
        AND organisation_id = ${organisationId}::uuid FOR UPDATE
    `
    if (!rows.length) throw new NotFoundException()
    return tx.invitation.findUniqueOrThrow({ where: { id: invitationId, organisationId } })
  }

  private async currentTime(tx: Prisma.TransactionClient) {
    // clock_timestamp() reflects time spent waiting for locks within this transaction.
    const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`
    return row.now
  }
}
