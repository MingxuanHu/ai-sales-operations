import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common'
import { AccessTokenGuard, type AuthenticatedRequest } from '../identity/access-token.guard'
import { ProductsService } from './products.service'

// Nest adds each method's route to this base path and runs the guard before handling it.
@Controller('organisations/:organisationId/products')
@UseGuards(AccessTokenGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest) {
    return this.products.list(organisationId, request.userId)
  }

  @Get(':id')
  get(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.products.get(organisationId, request.userId, id)
  }

  @Post()
  create(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.products.create(organisationId, request.userId, body)
  }

  // PUT replaces all editable fields with the submitted values.
  @Put(':id')
  update(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown,
  ) {
    return this.products.update(organisationId, request.userId, id, body)
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('organisationId', ParseUUIDPipe) organisationId: string, @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.products.remove(organisationId, request.userId, id)
  }
}
