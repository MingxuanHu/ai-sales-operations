import { AppShell, Button, Container, Group, Loader, MantineProvider, Text, createTheme } from '@mantine/core'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router'
import { readCognitoConfig } from '../features/auth/api/cognito-config'
import { CognitoCallbackError, createCognitoSession, type CognitoSession } from '../features/auth/api/cognito-session'
import { SignIn } from '../features/auth/components/SignIn'
import { createOrganisationsApi } from '../features/organisations/api/organisations'
import '@mantine/core/styles.css'
import './app.css'

// Lazy loading keeps the protected workspace out of the initial signed-out bundle.
const OrganisationWorkspace = lazy(async () => {
  const { OrganisationWorkspace } = await import('../features/organisations/components/OrganisationWorkspace')
  return { default: OrganisationWorkspace }
})

const theme = createTheme({ primaryColor: 'teal', defaultRadius: 'md' })
const config = readCognitoConfig()
const defaultSession = config && createCognitoSession(config)

// The provider shares the same component theme across signed-out and protected views.
export function App({ session = defaultSession }: { session?: CognitoSession }) {
  return (
    <MantineProvider theme={theme}>
      <BrowserRouter>
        <SalesOperations session={session} />
      </BrowserRouter>
    </MantineProvider>
  )
}

function SalesOperations({ session }: { session?: CognitoSession }) {
  // React Router lets this component read the current URL and change screens without a full page reload.
  const navigate = useNavigate()
  const location = useLocation()
  // useState remembers these values across renders. Calling a setter updates what the shell shows.
  const [status, setStatus] = useState(location.pathname === '/auth/callback' ? 'callback' : 'signed-out')
  const [error, setError] = useState('')
  // A ref remembers whether the one-time callback started without triggering another render.
  const callbackStarted = useRef(false)
  const [requests, setRequests] = useState<AbortController>()

  // An effect runs after React renders. This one exchanges the code when the browser returns from Cognito.
  useEffect(() => {
    if (status !== 'callback' || callbackStarted.current) return
    callbackStarted.current = true
    // Cognito returns to /auth/callback?code=...&state=...; save that URL before changing the address.
    const url = new URL(window.location.href)
    // Immediately replace it with / so the authorization code leaves the current history entry.
    // This changes the address without reloading; status stays 'callback', showing “Completing sign-in…”.
    void navigate('/', { replace: true })
    if (!session) {
      setStatus('signed-out')
      return
    }
    // Use the saved callback URL to exchange the code and verify sign-in while / is visible.
    void session.completeSignIn(url).then((returnTo) => {
      // Once sign-in succeeds, show the saved return route and replace the loading screen.
      void navigate(returnTo, { replace: true })
      setRequests(new AbortController())
      setStatus('signed-in')
    }).catch((failure: unknown) => {
      setError(failure instanceof CognitoCallbackError
        ? failure.message
        : 'Sign-in could not be completed. Please try again.')
      setStatus('signed-out')
    })
  }, [navigate, session, status])

  // useMemo reuses the API client until the session or its request controller changes.
  const api = useMemo(() => {
    if (!session || !requests) return
    function expire() {
      requests?.abort()
      session?.clear()
      setRequests(undefined)
      setError('Your session has ended. Sign in to continue.')
      setStatus('signed-out')
    }
    return createOrganisationsApi(async () => {
      try {
        return await session.accessToken()
      } catch (error) {
        if (!requests.signal.aborted && !session.hasSession()) expire()
        throw error
      }
    }, requests.signal, expire)
  }, [requests, session])

  async function beginSignIn() {
    if (!session) return
    setError('')
    setStatus('redirecting')
    try {
      await session.beginSignIn()
    } catch {
      setError('Managed Login could not be opened. Please try again.')
      setStatus('signed-out')
    }
  }

  function signOut() {
    // Cancel protected requests and remove the workspace before redirecting to Cognito.
    requests?.abort()
    setRequests(undefined)
    setStatus('signing-out')
    void session?.signOut().catch(() => {
      setStatus('signed-out')
      setError('The app session ended. Managed Login could not be fully cleared.')
    })
  }

  return (
    <AppShell header={{ height: 64 }} padding="md">
      <AppShell.Header>
        <Container size="lg" h="100%">
          <Group justify="space-between" h="100%" wrap="nowrap">
            <Text fw={750} fz={{ base: 'sm', sm: 'md' }}>AI Sales Operations</Text>
            {api && <Button variant="subtle" onClick={signOut}>Sign out</Button>}
          </Group>
        </Container>
      </AppShell.Header>
      <AppShell.Main className="app-main">
        <Container size="lg" py={{ base: 'lg', sm: 'xl' }}>
          {/* JSX conditions choose the workspace, a progress message, or the sign-in form. */}
          {status === 'signed-in' && api ? (
            <Suspense fallback={<Text role="status">Loading workspace…</Text>}>
              <OrganisationWorkspace api={api} />
            </Suspense>
          ) :
            status === 'callback' || status === 'signing-out' ? (
              <Group role="status" gap="sm" justify="center">
                <Loader size="sm" />
                {status === 'callback' ? 'Completing sign-in…' : 'Signing out…'}
              </Group>
            ) : (
              <SignIn
                configured={Boolean(session)}
                redirecting={status === 'redirecting'}
                error={error}
                onSignIn={() => void beginSignIn()}
              />
            )}
        </Container>
      </AppShell.Main>
    </AppShell>
  )
}
