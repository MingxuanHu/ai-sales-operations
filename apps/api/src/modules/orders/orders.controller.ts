import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AccessTokenGuard, type AuthenticatedRequest } from '../identity/access-token.guard'
import { OrdersService } from './orders.service'

// Nest matches these routes under the tenant path and authenticates them with the guard.
@Controller('organisations/:organisationId/orders')
@UseGuards(AccessTokenGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Query('status') status?: string,
  ) {
    return this.orders.list(organisationId, request.userId, status)
  }

  @Get('selectors')
  selectors(@Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest) {
    return this.orders.selectors(organisationId, request.userId)
  }

  @Get(':id')
  get(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.get(organisationId, request.userId, id)
  }

  @Post()
  submit(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.orders.submit(organisationId, request.userId, body)
  }
}
