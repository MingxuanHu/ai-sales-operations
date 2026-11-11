import { Module } from '@nestjs/common'
import { HealthController } from './health.controller'

// A NestJS module groups related code. @Module registers this controller so Nest can route requests to it.
@Module({
  controllers: [HealthController],
})
export class AppModule {}
