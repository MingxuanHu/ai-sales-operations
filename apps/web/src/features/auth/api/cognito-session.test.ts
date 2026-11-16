// @vitest-environment jsdom

import { generateKeyPairSync, sign } from 'node:crypto'
import { JwtVerifier } from 'aws-jwt-verify'
import { FetchError } from 'aws-jwt-verify/error'
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
    await expect(session.completeSignIn(unmatched)).rejects.toMatchObject({ stage: 'attempt' })
    await expect(session.completeSignIn(callback)).rejects.toMatchObject({ stage: 'attempt' })
    setupAttempt(Date.now() - 11 * 60_000)
    await expect(session.completeSignIn(callback)).rejects.toMatchObject({ stage: 'attempt' })
    expect(fetch).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })

  it('identifies a provider error without displaying the provider description', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const rejected = new URL(config.redirectUri + '?state=fixture-state&error=server_error&error_description=private-details')
    const session = createCognitoSession(config)
    await expect(session.completeSignIn(rejected)).rejects.toMatchObject({
      stage: 'provider', message: 'Managed Login could not complete sign-in. If you already have an account, try again using the same sign-in method and account you used before.',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['UsernameExistsException', 'fixture-private-identity'],
    ['invalid_request', 'Already found an entry for username fixture-private-identity'],
    ['server_error', 'AliasExistsException: fixture-private-identity'],
  ])('explains a reported account conflict (%s) without showing identity details', async (error, description) => {
    const url = new URL(config.redirectUri)
    url.search = new URLSearchParams({ state: 'fixture-state', error, error_description: description }).toString()
    await expect(createCognitoSession(config).completeSignIn(url)).rejects.toMatchObject({
      stage: 'accountConflict',
      message: 'An account already exists with these sign-in details. If you registered with Google, choose Sign in with Google and select the same Google account. If you registered with a username, sign in with that username.',
    })
  })

  it('ignores an account conflict reported by an unmatched callback', async () => {
    const url = new URL(config.redirectUri + '?state=wrong&error=UsernameExistsException')
    await expect(createCognitoSession(config).completeSignIn(url)).rejects.toMatchObject({ stage: 'attempt' })
  })

  it('identifies a rejected exchange and consumes the callback without retrying its code', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 400 }))
    vi.stubGlobal('fetch', fetch)
    const session = createCognitoSession(config)
    await expect(session.completeSignIn(callback)).rejects.toMatchObject({ stage: 'exchange' })
    await expect(session.completeSignIn(callback)).rejects.toMatchObject({ stage: 'attempt' })
    expect(fetch).toHaveBeenCalledOnce()
    expect(session.hasSession()).toBe(false)
  })

  it('rejects a correctly signed ID token with the wrong nonce', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => tokenResponse('wrong')))
    const session = createCognitoSession(config)
    await expect(session.completeSignIn(callback)).rejects.toMatchObject({ stage: 'verification' })
    expect(session.hasSession()).toBe(false)
  })

  it('identifies signing-key network failures without exposing their details', async () => {
    const session = createCognitoSession(config)
    const verifier = vi.mocked(JwtVerifier.create).mock.results[0].value
    vi.spyOn(verifier, 'verify').mockRejectedValueOnce(new FetchError(config.issuer, 'private-details'))
    vi.stubGlobal('fetch', vi.fn(async () => tokenResponse()))
    await expect(session.completeSignIn(callback)).rejects.toMatchObject({
      stage: 'keys', message: 'The app could not load Cognito’s public signing keys. Check your connection and try again.',
    })
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
