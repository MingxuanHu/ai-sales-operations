import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { IdentityModule } from '../identity/identity.module'
import { ReportingController } from './reporting.controller'
import { ReportingService } from './reporting.service'

// The imports make database access and tenant checks available to this feature.
@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
