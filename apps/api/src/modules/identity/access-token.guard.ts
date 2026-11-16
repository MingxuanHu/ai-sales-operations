import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common'
import { AccessTokenVerifier } from './access-token.verifier'
import { IdentityService } from './identity.service'

// TypeScript describes the userId added by the guard to the HTTP request.
// Nest runs the guard before any handler on a controller marked with @UseGuards.
export interface AuthenticatedRequest {
  headers: { authorization?: string }
  userId: string
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly verifier: AccessTokenVerifier, private readonly identity: IdentityService) {}

  async canActivate(context: ExecutionContext) {
    const http = context.switchToHttp()
    const request = http.getRequest<AuthenticatedRequest>()
    http.getResponse<{ setHeader(name: string, value: string): void }>().setHeader('Cache-Control', 'no-store')

    const match = /^Bearer ([^\s,]+)$/i.exec(request.headers.authorization ?? '')
    if (!match) throw new UnauthorizedException()

    const subject = await this.verifier.verify(match[1]).catch((cause: unknown) => {
      // Nest keeps cause on the server-side exception and serializes only the generic 401.
      // Verifier details can contain token claims, so avoid logging the raw cause here.
      throw new UnauthorizedException(undefined, { cause })
    })
    request.userId = await this.identity.resolveUser(subject)
    return true
  }
}
