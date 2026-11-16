import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { generateKeyPairSync, sign } from 'node:crypto'
import { env } from 'node:process'
import test from 'node:test'
import { AccessTokenVerifier } from '../../../dist/modules/identity/access-token.verifier.js'

test('Cognito verification requires a signed, unexpired access token bound to the API', async (context) => {
  const userPool = 'us-east-1_Synthetic'
  const issuer = 'https://cognito-idp.us-east-1.amazonaws.com/' + userPool
  const audience = 'http://localhost:5173/api'
  for (const [name, value] of Object.entries({
    COGNITO_USER_POOL_ID: userPool,
    COGNITO_ISSUER: issuer,
    COGNITO_APP_CLIENT_ID: 'synthetic',
    COGNITO_API_RESOURCE_URL: audience,
  })) {
    const previous = env[name]
    env[name] = value
    context.after(() => {
      if (previous === undefined) delete env[name]
      else env[name] = previous
    })
  }

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const instance = new AccessTokenVerifier()
  // Warm the verifier with a synthetic public key so this test never contacts Cognito.
  instance.verifier.cacheJwks({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', alg: 'RS256' }] })
  const now = Math.floor(Date.now() / 1000)
  const baseClaims = {
    iss: issuer, aud: audience, token_use: 'access', client_id: 'synthetic', scope: 'openid',
    exp: now + 300, sub: 'synthetic-user',
  }
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  function token(overrides, key = privateKey) {
    const data = encode({ alg: 'RS256', kid: 'test' }) + '.' + encode({ ...baseClaims, ...overrides })
    return data + '.' + sign('sha256', Buffer.from(data), key).toString('base64url')
  }

  assert.equal(await instance.verify(token()), 'synthetic-user')
  for (const overrides of [
    { iss: 'https://issuer-cognito-idp.us-east-1.amazonaws.com/' + userPool },
    { client_id: 'another-client' }, { token_use: 'id' }, { aud: undefined }, { aud: 'another-api' },
    { exp: undefined }, { exp: now - 1 }, { nbf: now + 120 }, { scope: 'email' }, { sub: '' },
  ]) {
    await assert.rejects(() => instance.verify(token(overrides)), JSON.stringify(overrides))
  }
  const wrongKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
  await assert.rejects(() => instance.verify(token({}, wrongKey)))
})
