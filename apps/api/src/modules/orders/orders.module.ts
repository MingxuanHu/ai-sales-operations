import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { IdentityModule } from '../identity/identity.module'
import { OrdersController } from './orders.controller'
import { OrdersService } from './orders.service'

// Imports make the database and tenant permission providers available to the order routes.
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
