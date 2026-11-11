import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'

// A feature module registers the controllers and other classes that belong to one capability.
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
