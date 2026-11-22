import { JwtVerifier } from 'aws-jwt-verify'
import { FetchError } from 'aws-jwt-verify/error'

export type CognitoConfig = {
  domain: string
  clientId: string
  redirectUri: string
  issuer: string
  signOutUrl: string
  resource: string
}

type Attempt = { state: string; nonce: string; verifier: string; startedAt: number; returnTo: string }
type Tokens = { accessToken: string; refreshToken: string; expiresAt: number }

const attemptKey = 'cognito-sign-in'
const attemptLifetime = 10 * 60_000
const refreshWindow = 30_000

// Display fixed messages so provider descriptions, codes and tokens stay out of the UI.
const callbackMessages = {
  attempt: 'This sign-in attempt could not be matched or has expired. Start sign-in again in this tab.',
  provider: 'Managed Login could not complete sign-in. If you already have an account, try again using the same sign-in method and account you used before.',
  accountConflict: 'An account already exists with these sign-in details. If you registered with Google, choose Sign in with Google and select the same Google account. If you registered with a username, sign in with that username.',
  exchange: 'The app could not exchange the sign-in code with Cognito. Please try again.',
  keys: 'The app could not load Cognito’s public signing keys. Check your connection and try again.',
  verification: 'The app could not verify the sign-in response. Please try again.',
}

export class CognitoCallbackError extends Error {
  constructor(readonly stage: keyof typeof callbackMessages) {
    super(callbackMessages[stage])
  }
}

function providerFailure(params: URLSearchParams) {
  const error = params.get('error')
  const description = params.get('error_description')?.trim() ?? ''
  // OAuth may wrap an account conflict in a general error. Match known markers without showing the raw text.
  const conflictCode = /^(?:UsernameExistsException|AliasExistsException)$/i
  const conflictDescription = /^(?:(?:UsernameExistsException|AliasExistsException)\b|Already found an entry for username\b)/i
  const wrappedConflict = (error === 'invalid_request' || error === 'server_error') && conflictDescription.test(description)
  return new CognitoCallbackError((error && conflictCode.test(error)) || wrappedConflict ? 'accountConflict' : 'provider')
}

// PKCE uses URL-safe base64 so the same values can travel in URLs and form bodies.
function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

// Allow only known app routes as post-login destinations.
function protectedPath(path: string) {
  return /^\/organisations\/[a-f0-9-]+$/i.test(path) || path === '/onboarding' ? path : '/'
}

function randomValue() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

export function createCognitoSession(config: CognitoConfig) {
  // The verifier uses the configured issuer's public keys and checks the client audience.
  const verify = JwtVerifier.create({ issuer: config.issuer, audience: config.clientId })
  let tokens: Tokens | undefined
  let sessionWork = new AbortController()
  let refresh: Promise<string> | undefined

  function clear() {
    tokens = undefined
    sessionWork.abort()
    sessionWork = new AbortController()
    refresh = undefined
  }

  function endpoint(path: string, params: Record<string, string> = {}) {
    const url = new URL(path, config.domain)
    url.search = new URLSearchParams(params).toString()
    return url.href
  }

  async function post(path: string, fields: Record<string, string>, signal: AbortSignal) {
    // Unlike page navigation, cross-origin fetch needs CORS permission to read the response.
    // Cognito supplies that permission for /oauth2/token and /oauth2/revoke; no app CORS setting is needed.
    return fetch(endpoint(path), {
      method: 'POST',
      body: new URLSearchParams({ client_id: config.clientId, ...fields }),
      signal,
      cache: 'no-store',
    })
  }

  async function exchange(fields: Record<string, string>, signal: AbortSignal, nonce?: string) {
    const readTokens = async () => {
      const response = await post('/oauth2/token', fields, signal)
      if (!response.ok) throw new Error('Cognito rejected the token request.')
      return response.json()
    }
    const { access_token, refresh_token, id_token, expires_in } = await readTokens().catch((error: unknown) => {
      if (nonce !== undefined) throw new CognitoCallbackError('exchange')
      throw error
    }) ?? {}
    if (typeof access_token !== 'string' || !access_token ||
        typeof refresh_token !== 'string' || !refresh_token ||
        typeof expires_in !== 'number' || !Number.isFinite(expires_in) || expires_in <= 0) {
      if (nonce !== undefined) throw new CognitoCallbackError('exchange')
      throw new Error('Cognito returned an incomplete session.')
    }

    if (nonce !== undefined) {
      const claims = await verify.verify(id_token, {
        customJwtCheck: ({ header }) => {
          if (header.alg !== 'RS256') throw new Error('Unexpected signing algorithm.')
        },
      }).catch((error: unknown) => {
        throw new CognitoCallbackError(error instanceof FetchError ? 'keys' : 'verification')
      })
      if (typeof claims.exp !== 'number' || claims.token_use !== 'id' || claims.nonce !== nonce) {
        throw new CognitoCallbackError('verification')
      }
    }

    // Aborted work may have completed its network call just before sign-out.
    signal.throwIfAborted()
    tokens = { accessToken: access_token, refreshToken: refresh_token, expiresAt: Date.now() + expires_in * 1000 }
    return tokens.accessToken
  }

  return {
    clear,
    hasSession: () => tokens !== undefined,
    // Starts a browser redirect flow; completeSignIn handles the callback and obtains tokens later.
    async beginSignIn() {
      // State matches the callback to this attempt; nonce ties the returned ID token to it.
      const attempt: Attempt = {
        state: randomValue(), nonce: randomValue(), verifier: randomValue(), startedAt: Date.now(),
        returnTo: protectedPath(window.location.pathname),
      }
      // PKCE sends a hash now and requires the saved verifier when exchanging the returned code.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(attempt.verifier))
      // Per-tab sessionStorage preserves the attempt and return route while the browser leaves the app.
      sessionStorage.setItem(attemptKey, JSON.stringify(attempt))
      // assign navigates the whole tab to Cognito. Its authorize endpoint redirects to /login
      // with these parameters, so /login is the URL visible while the sign-in page is open.
      // Cross-origin page navigation is allowed without CORS; this does not fetch a response for JS to read.
      // After successful sign-in, Cognito returns to redirect_uri with a code and the same state.
      window.location.assign(endpoint('/oauth2/authorize', {
        response_type: 'code', redirect_uri: config.redirectUri, client_id: config.clientId,
        scope: 'openid', resource: config.resource, state: attempt.state, nonce: attempt.nonce,
        code_challenge_method: 'S256', code_challenge: base64url(new Uint8Array(digest)),
      }))
    },
    async completeSignIn(url: URL) {
      const saved = sessionStorage.getItem(attemptKey)
      sessionStorage.removeItem(attemptKey)
      const attempt: Attempt | null = saved ? JSON.parse(saved) : null
      const code = url.searchParams.get('code')
      const age = attempt ? Date.now() - attempt.startedAt : Infinity
      if (!attempt || !attempt.state ||
          attempt.state !== url.searchParams.get('state') || !attempt.nonce || !attempt.verifier ||
          !Number.isFinite(age) || age < 0 || age > attemptLifetime) {
        throw new CognitoCallbackError('attempt')
      }
      if (!code || url.searchParams.has('error')) throw providerFailure(url.searchParams)
      await exchange({
        grant_type: 'authorization_code', code, redirect_uri: config.redirectUri,
        code_verifier: attempt.verifier,
      }, sessionWork.signal, attempt.nonce)
      return protectedPath(attempt.returnTo)
    },
    async accessToken() {
      if (!tokens) throw new Error('Sign in to continue.')
      if (tokens.expiresAt - Date.now() > refreshWindow) return tokens.accessToken

      // Concurrent API requests share one exchange because Cognito rotates the refresh token.
      if (!refresh) {
        refresh = exchange({
          grant_type: 'refresh_token', refresh_token: tokens.refreshToken,
        }, sessionWork.signal)
      }
      const pending = refresh
      try {
        return await pending
      } catch (error) {
        if (refresh === pending) clear()
        throw error
      } finally {
        if (refresh === pending) refresh = undefined
      }
    },
    async signOut() {
      const latest = tokens?.refreshToken
      clear()
      try {
        if (latest) await post('/oauth2/revoke', { token: latest }, AbortSignal.timeout(2500))
      } catch {
        // A failed or timed-out revocation still leads to Cognito's logout page.
      }
      window.location.assign(endpoint('/logout', { client_id: config.clientId, logout_uri: config.signOutUrl }))
    },
  }
}

export type CognitoSession = ReturnType<typeof createCognitoSession>
