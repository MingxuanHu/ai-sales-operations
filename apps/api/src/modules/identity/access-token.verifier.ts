import { Injectable, UnauthorizedException } from '@nestjs/common'
import { CognitoJwtVerifier } from 'aws-jwt-verify'

@Injectable()
export class AccessTokenVerifier {
  // A single verifier shares cached signing keys and in-flight fetches across requests.
  // On a cache miss, the library fetches public keys from Cognito over HTTPS.
  private readonly verifier = this.createVerifier()

  async verify(token: string): Promise<string> {
    if (!this.verifier) throw new UnauthorizedException()
    // await unwraps the Promise so we can read sub. A .then callback would do the same.
    const claims = await this.verifier.verify(token)
    return claims.sub
  }

  private createVerifier() {
    const { COGNITO_USER_POOL_ID, COGNITO_APP_CLIENT_ID, COGNITO_API_RESOURCE_URL, COGNITO_ISSUER } = process.env
    if (!COGNITO_USER_POOL_ID || !COGNITO_APP_CLIENT_ID || !COGNITO_API_RESOURCE_URL || !COGNITO_ISSUER) return

    return CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      clientId: COGNITO_APP_CLIENT_ID,
      tokenUse: 'access',
      scope: 'openid',
      customJwtCheck: ({ header, payload }) => {
        // Cognito checks client_id separately. The resource audience must also match this API.
        const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
        if (header.alg !== 'RS256' || payload.iss !== COGNITO_ISSUER || !audiences.includes(COGNITO_API_RESOURCE_URL) ||
            typeof payload.exp !== 'number' || !Number.isFinite(payload.exp) ||
            typeof payload.sub !== 'string' || !payload.sub.trim()) {
          throw new UnauthorizedException()
        }
      },
    })
  }
}
