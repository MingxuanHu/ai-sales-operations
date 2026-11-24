import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { IdentityModule } from '../identity/identity.module'
import { ProductsController } from './products.controller'
import { ProductsService } from './products.service'

// Module imports make the shared database and identity providers available to this feature.
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
