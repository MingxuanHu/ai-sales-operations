import type { CognitoConfig } from './cognito-session'

// Vite exposes these public settings at build time through import.meta.env.
export function readCognitoConfig(): CognitoConfig | undefined {
  const domain = import.meta.env.VITE_COGNITO_DOMAIN
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI
  const issuer = import.meta.env.VITE_COGNITO_ISSUER
  const signOutUrl = import.meta.env.VITE_COGNITO_SIGN_OUT_URL
  const resource = import.meta.env.VITE_COGNITO_API_RESOURCE_URL
  if (domain && clientId && redirectUri && issuer && signOutUrl && resource) {
    return { domain, clientId, redirectUri, issuer, signOutUrl, resource }
  }
}
