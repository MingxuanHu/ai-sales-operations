import { Controller, Get, Param, ParseUUIDPipe, Query, Req, UseGuards } from '@nestjs/common'
import { AccessTokenGuard, type AuthenticatedRequest } from '../identity/access-token.guard'
import { ReportingService } from './reporting.service'

// The guard authenticates each request before Nest calls the report handler.
@Controller('organisations/:organisationId/reports')
@UseGuards(AccessTokenGuard)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  // Nest extracts date filters from the query string and validates the tenant ID as a UUID.
  @Get('sales')
  sales(
    @Param('organisationId', ParseUUIDPipe) organisationId: string,
    @Req() request: AuthenticatedRequest,
    @Query('startDate') startDate?: unknown,
    @Query('endDate') endDate?: unknown,
  ) {
    return this.reporting.sales(organisationId, request.userId, startDate, endDate)
  }
}
