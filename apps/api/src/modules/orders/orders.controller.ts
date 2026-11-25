import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
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

  // @HttpCode overrides Nest's default POST response because these commands update an existing order.
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.transition(organisationId, request.userId, id, 'approved')
  }

  @Post(':id/reject')
  @HttpCode(200)
  reject(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.transition(organisationId, request.userId, id, 'rejected')
  }

  @Post(':id/fulfil')
  @HttpCode(200)
  fulfil(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.orders.transition(organisationId, request.userId, id, 'fulfilled')
  }
}
