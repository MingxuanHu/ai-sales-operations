import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module'
import { AccessTokenGuard } from './access-token.guard'
import { AccessTokenVerifier } from './access-token.verifier'
import { IdentityController } from './identity.controller'
import { IdentityService } from './identity.service'
import { InvitationsService } from './invitations.service'

// Export the guard and tenant checks so future feature modules can reuse them.
@Module({
  imports: [DatabaseModule],
  controllers: [IdentityController],
  providers: [AccessTokenGuard, AccessTokenVerifier, IdentityService, InvitationsService],
  exports: [AccessTokenGuard, AccessTokenVerifier, IdentityService],
})
export class IdentityModule {}
