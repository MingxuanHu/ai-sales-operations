// @vitest-environment jsdom

import { generateKeyPairSync, sign } from 'node:crypto'
import { JwtVerifier } from 'aws-jwt-verify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCognitoSession } from './cognito-session'

const config = {
  issuer: 'https://issuer.example.test/pool',
  domain: 'https://login.example.test',
  clientId: 'fixture-app',
  resource: 'http://localhost:5173/api',
  redirectUri: 'http://localhost:5173/auth/callback',
  signOutUrl: 'http://localhost:5173/',
}
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const { e, n } = publicKey.export({ format: 'jwk' })
if (!e || !n) throw new Error('The test key is missing its RSA public parameters.')
const key = { e, n, kty: 'RSA', kid: 'fixture-key', alg: 'RS256' }
const callback = new URL(config.redirectUri + '?code=fixture-code&state=fixture-state')

function setupAttempt(startedAt = Date.now()) {
  sessionStorage.setItem('cognito-sign-in', JSON.stringify({
    state: 'fixture-state', nonce: 'fixture-nonce', verifier: 'fixture-verifier', startedAt, returnTo: '/onboarding',
  }))
}

function tokenResponse(nonce = 'fixture-nonce', expires = 600) {
  // Sign a synthetic ID token with a test key to exercise the real verifier.
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'RS256', kid: key.kid })
  const claims = encode({
    iss: config.issuer, aud: config.clientId, exp: Date.now() / 1000 + 600,
    sub: 'fixture-subject', token_use: 'id', nonce,
  })
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), privateKey).toString('base64url')
  return Response.json({
    id_token: `${header}.${claims}.${signature}`, access_token: 'fixture-access',
    refresh_token: 'fixture-refresh', expires_in: expires,
  })
}

beforeEach(() => {
  const verifier = JwtVerifier.create({ issuer: config.issuer, audience: config.clientId })
  verifier.cacheJwks({ keys: [key] })
  vi.spyOn(JwtVerifier, 'create').mockReturnValue(verifier)
  setupAttempt()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  sessionStorage.clear()
})

describe('Cognito browser session', () => {
  it('consumes a mismatched or expired attempt without exchanging the code', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const session = createCognitoSession(config)
    const unmatched = new URL(callback)
    unmatched.searchParams.set('state', 'wrong')
    await expect(session.completeSignIn(unmatched)).rejects.toThrow('invalid or expired')
    await expect(session.completeSignIn(callback)).rejects.toThrow('invalid or expired')
    setupAttempt(Date.now() - 11 * 60_000)
    await expect(session.completeSignIn(callback)).rejects.toThrow('invalid or expired')
    expect(fetch).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })

  it('rejects a correctly signed ID token with the wrong nonce', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tokenResponse('wrong')))
    const session = createCognitoSession(config)
    await expect(session.completeSignIn(callback)).rejects.toThrow('could not be verified')
    expect(session.hasSession()).toBe(false)
  })

  it('exchanges the original verifier and shares a single refresh across requests', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(tokenResponse('fixture-nonce', 1))
      .mockResolvedValueOnce(Response.json({
        access_token: 'renewed-access', refresh_token: 'rotated-refresh', expires_in: 1,
      }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
    vi.stubGlobal('fetch', fetch)
    const session = createCognitoSession(config)
    await expect(session.completeSignIn(callback)).resolves.toBe('/onboarding')
    expect(new URLSearchParams(String(fetch.mock.calls[0][1]?.body)).get('code_verifier')).toBe('fixture-verifier')
    expect(sessionStorage.length).toBe(0)
    await expect(Promise.all([session.accessToken(), session.accessToken()])).resolves.toEqual([
      'renewed-access', 'renewed-access',
    ])
    expect(fetch).toHaveBeenCalledTimes(2)
    await expect(session.accessToken()).rejects.toThrow('rejected the token request')
    expect(new URLSearchParams(String(fetch.mock.calls[2][1]?.body)).get('refresh_token')).toBe('rotated-refresh')
    expect(session.hasSession()).toBe(false)
  })

  it('discards a refresh response that arrives after the session ends', async () => {
    let respond: (response: Response) => void = () => {}
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(tokenResponse('fixture-nonce', 1))
      .mockImplementationOnce(async () => new Promise((resolve) => { respond = resolve }))
    vi.stubGlobal('fetch', fetch)
    const session = createCognitoSession(config)
    await session.completeSignIn(callback)
    const refreshing = session.accessToken()
    session.clear()
    respond(Response.json({ access_token: 'late-access', refresh_token: 'late-refresh', expires_in: 600 }))
    await expect(refreshing).rejects.toThrow()
    expect(session.hasSession()).toBe(false)
  })
})
