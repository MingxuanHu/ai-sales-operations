import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Param,
  ParseEnumPipe, ParseUUIDPipe, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common'
import { MembershipRole } from '../../generated/prisma/enums'
import { AccessTokenGuard, type AuthenticatedRequest } from './access-token.guard'
import { IdentityService } from './identity.service'
import { InvitationsService } from './invitations.service'

function payload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException()
  return value as Record<string, unknown>
}

// Prisma generates the role values from the schema. The pipe rejects unknown values with 400.
const membershipRolePipe = new ParseEnumPipe(MembershipRole, {
  exceptionFactory: () => new BadRequestException('Invalid membership role'),
})

// Passthrough lets Nest serialize the result while we select the HTTP status.
interface StatusResponse {
  status(code: number): void
}

@Controller()
// Nest passes the same request object to @Req() after the guard sets userId.
@UseGuards(AccessTokenGuard)
export class IdentityController {
  constructor(private readonly identity: IdentityService, private readonly invitations: InvitationsService) {}

  @Get('me')
  getCurrentUser(@Req() request: AuthenticatedRequest) {
    return this.identity.me(request.userId)
  }

  @Post('organisations')
  async createOrganisation(
    @Req() request: AuthenticatedRequest, @Body() body: unknown,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    const { name, requestId } = payload(body)
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed || [...trimmed].length > 120 || trimmed.includes('\0') || typeof requestId !== 'string') {
      throw new BadRequestException('Invalid organisation name or request ID')
    }
    const id = await new ParseUUIDPipe().transform(requestId, { type: 'body' })
    if (!id) throw new BadRequestException('Missing request ID')
    const { organisationId, created } = await this.identity.createOrganisation(request.userId, trimmed, id)
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK)
    return { organisationId }
  }

  @Post('organisations/demo')
  async createDemo(
    @Req() request: AuthenticatedRequest, @Body() body: unknown,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    const { requestId } = payload(body)
    if (typeof requestId !== 'string') throw new BadRequestException('Invalid request ID')
    const id = await new ParseUUIDPipe().transform(requestId, { type: 'body' })
    if (!id) throw new BadRequestException('Missing request ID')
    const { organisationId, created } = await this.identity.createDemo(request.userId, id)
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK)
    // Resolve the membership so the web picker can update without switching workspaces.
    return this.identity.overview(organisationId, request.userId)
  }

  // ParseUUIDPipe rejects malformed path IDs before the service queries PostgreSQL.
  @Get('organisations/:organisationId')
  getOrganisationOverview(
    @Req() request: AuthenticatedRequest,
    @Param('organisationId', ParseUUIDPipe) organisationId: string
  ) {
    return this.identity.overview(organisationId, request.userId)
  }

  @Get('organisations/:organisationId/settings')
  getOrganisationSettings(
    @Req() request: AuthenticatedRequest, @Param('organisationId', ParseUUIDPipe) organisationId: string,
  ) {
    return this.identity.organisationSettings(organisationId, request.userId)
  }

  @Patch('organisations/:organisationId/settings')
  updateOrganisationSettings(
    @Req() request: AuthenticatedRequest, @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Body() body: unknown,
  ) {
    const { orderApprovalThresholdBasisPoints: threshold } = payload(body)
    if (typeof threshold !== 'number' || !Number.isInteger(threshold) || threshold < 0 || threshold > 10_000) {
      throw new BadRequestException('Use a threshold from 0% to 100% with up to two decimal places.')
    }
    return this.identity.updateApprovalThreshold(organisationId, request.userId, threshold)
  }

  @Delete('organisations/:organisationId')
  @HttpCode(204)
  deleteDemo(
    @Req() request: AuthenticatedRequest, @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Body() body: unknown,
  ) {
    const { confirmationName } = payload(body)
    if (typeof confirmationName !== 'string' || !confirmationName || [...confirmationName].length > 120) {
      throw new BadRequestException('Invalid organisation name')
    }
    return this.identity.deleteDemo(organisationId, request.userId, confirmationName)
  }

  @Post('organisations/:organisationId/invitations')
  async issueInvitation(
    @Req() request: AuthenticatedRequest, @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Body() body: unknown, @Body('role', membershipRolePipe) role: MembershipRole,
    @Res({ passthrough: true }) response: StatusResponse,
  ) {
    const { recipientUserId } = payload(body)
    if (typeof recipientUserId !== 'string') throw new BadRequestException('Invalid recipient ID')
    const recipient = await new ParseUUIDPipe().transform(recipientUserId, { type: 'body' })
    if (!recipient) throw new BadRequestException('Missing recipient ID')
    const { created, ...invitation } = await this.invitations.issue(
      organisationId, request.userId, recipient.toLowerCase(), role,
    )
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK)
    return invitation
  }

  @Get('invitations')
  listPendingInvitations(@Req() request: AuthenticatedRequest) {
    return this.invitations.list(request.userId)
  }

  @Post('invitations/:invitationId/accept')
  @HttpCode(200)
  acceptInvitation(@Req() request: AuthenticatedRequest, @Param('invitationId', ParseUUIDPipe) invitationId: string) {
    return this.invitations.accept(invitationId.toLowerCase(), request.userId)
  }

  @Delete('organisations/:organisationId/invitations/:invitationId')
  @HttpCode(204)
  revokeInvitation(
    @Req() request: AuthenticatedRequest, @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.invitations.revoke(organisationId, invitationId, request.userId)
  }

  @Patch('organisations/:organisationId/memberships/:userId')
  changeMembershipRole(
    @Req() request: AuthenticatedRequest, @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string, @Body('role', membershipRolePipe) role: MembershipRole,
  ) {
    return this.identity.changeMembership(organisationId, request.userId, userId, role)
  }

  @Delete('organisations/:organisationId/memberships/:userId')
  @HttpCode(204)
  async removeMembership(
    @Req() request: AuthenticatedRequest, @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.identity.changeMembership(organisationId, request.userId, userId)
  }
}
