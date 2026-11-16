import { Module } from '@nestjs/common'
import { HealthModule } from './modules/health/health.module'
import { IdentityModule } from './modules/identity/identity.module'

// The root module assembles feature modules so Nest can load their routes at startup.
@Module({
  imports: [HealthModule, IdentityModule],
})
export class AppModule {}
