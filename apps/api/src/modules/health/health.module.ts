import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { HealthController } from './health.controller'
import { HealthService } from './health.service'

// A feature module registers the controllers and other classes that belong to one capability.
@Module({
  imports: [DatabaseModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
