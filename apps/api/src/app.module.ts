import { Module } from '@nestjs/common'
import { HealthModule } from './modules/health/health.module'

// The root module assembles feature modules so Nest can load their routes at startup.
@Module({
  imports: [HealthModule],
})
export class AppModule {}
