import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { IdentityModule } from '../identity/identity.module'
import { CustomersController } from './customers.controller'
import { CustomersService } from './customers.service'

// Module imports make the shared database and identity providers available to this feature.
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
