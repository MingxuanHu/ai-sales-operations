import { Alert, Badge, Button, Group, Loader, NavLink, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, Navigate, NavLink as RouterNavLink, Route, Routes, matchPath, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, type Membership, type OrganisationsApi, type Profile } from '../api/organisations'
import { CreateOrganisation } from './CreateOrganisation'
import { InvitationInbox } from './InvitationInbox'
import { StaffInvitation } from './StaffInvitation'
import styles from './OrganisationWorkspace.module.css'

// Each status has its own shape, so TypeScript knows data is available only after a successful request.
type Result<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'failed'; error: unknown }

export function OrganisationWorkspace({ api }: { api: OrganisationsApi }) {
  const [profile, setProfile] = useState<Result<Profile>>({ status: 'loading' })
  // Changing this counter asks the effect to fetch again, even when the API client is the same.
  const [revision, setRevision] = useState(0)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    const request = new AbortController()
    void api.profile(request.signal).then((data) => {
      if (!request.signal.aborted) setProfile({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setProfile({ status: 'failed', error })
    })
    // React runs this cleanup before fetching again and when the workspace leaves the screen.
    return () => request.abort()
  }, [api, revision])

  function reloadProfile() {
    // The updater function calculates the next counter from the previous state.
    setProfile({ status: 'loading' })
    setRevision((value) => value + 1)
  }

  function onJoined(id: string) {
    reloadProfile()
    void navigate(`/organisations/${encodeURIComponent(id)}`)
  }

  if (profile.status === 'loading') return <Loading>Loading your organisations…</Loading>
  if (profile.status === 'failed') {
    return <Alert role="alert" color="red" title="Could not load your organisations">
      <Button variant="light" onClick={reloadProfile}>Try again</Button>
    </Alert>
  }

  const { memberships, userId } = profile.data
  // Read the tenant from either workspace route so the picker and navigation stay in sync.
  const invitationRoute = matchPath('/organisations/:organisationId/invitations', pathname)
  const overviewRoute = matchPath('/organisations/:organisationId', pathname)
  const isInvitations = Boolean(invitationRoute) || pathname === '/invitations'
  const selectedId = (invitationRoute ?? overviewRoute)?.params.organisationId
  const selectedPath = selectedId ? `/organisations/${encodeURIComponent(selectedId)}` : undefined
  const inbox = <InvitationInbox api={api} userId={userId} onJoined={onJoined} />

  return (
    <div className={styles.workspace}>
      <Paper withBorder p="md" className={styles.sidebar}>
        <Stack gap="md">
          {memberships.length > 0 && (
            <Select
              label="Organisation"
              placeholder="Choose an organisation"
              data={memberships.map(({ organisationId, name }) => ({ value: organisationId, label: name }))}
              allowDeselect={false}
              maxDropdownHeight={240}
              value={memberships.find(({ organisationId }) => organisationId === selectedId)?.organisationId ?? null}
              onChange={(id) => {
                if (id) void navigate(`/organisations/${encodeURIComponent(id)}${isInvitations ? '/invitations' : ''}`)
              }}
            />
          )}
          {/* RouterNavLink marks the current page so Mantine can highlight the matching link. */}
          <nav aria-label="Workspace" className={styles.navigation}>
            {memberships.length > 0 && <NavLink component={RouterNavLink} to={selectedPath ?? '/'} end label="Overview" />}
            <NavLink component={RouterNavLink} to={selectedPath ? selectedPath + '/invitations' : '/invitations'} end label="Invitations" />
            <NavLink component={RouterNavLink} to="/onboarding" end label="Create organisation" />
          </nav>
        </Stack>
      </Paper>
      <div className={styles.content}>
        <Routes>
          <Route index element={memberships.length === 1 ? (
            <Navigate replace to={`/organisations/${encodeURIComponent(memberships[0].organisationId)}`} />
          ) : memberships.length ? (
            <Paper withBorder p="lg">
              <Title order={1} size="h2">Choose an organisation</Title>
              <Text c="dimmed">Select an organisation to open its workspace.</Text>
            </Paper>
          ) : <Navigate replace to="/invitations" />} />
          <Route path="/onboarding" element={<CreateOrganisation api={api} onJoined={onJoined} />} />
          <Route path="/invitations" element={
            <Stack gap="lg">
              <Title order={1} size="h2">Invitations</Title>
              {inbox}
            </Stack>
          } />
          <Route path="/organisations/:organisationId" element={<SelectedOrganisation api={api} onDenied={reloadProfile} />} />
          <Route path="/organisations/:organisationId/invitations" element={
            <SelectedOrganisation api={api} onDenied={reloadProfile} inbox={inbox} />
          } />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Routes>
      </div>
    </div>
  )
}

function SelectedOrganisation({ api, onDenied, inbox }: {
  api: OrganisationsApi
  onDenied: () => void
  inbox?: ReactNode
}) {
  const { organisationId = '' } = useParams()
  // Switching the key unmounts the old view and clears its invitation form and confirmation.
  return <OrganisationOverview key={organisationId} id={organisationId} api={api} onDenied={onDenied} inbox={inbox} />
}

function OrganisationOverview({ id, api, onDenied, inbox }: {
  id: string
  api: OrganisationsApi
  onDenied: () => void
  inbox?: ReactNode
}) {
  // Start with a loading screen while the API checks access to this specific organisation.
  const [result, setResult] = useState<Result<Membership>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const request = new AbortController()
    // Ignore a response after cleanup so a previous organisation cannot update this view.
    void api.overview(id, request.signal).then((data) => {
      if (!request.signal.aborted) setResult({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setResult({ status: 'failed', error })
    })
    return () => request.abort()
  }, [api, id, revision])

  if (result.status === 'loading') return <Loading>Checking organisation access…</Loading>
  if (result.status === 'failed') {
    const denied = result.error instanceof ApiError && [403, 404].includes(result.error.status)
    return (
      <Alert color="red" role="alert" title={denied ? 'Access denied' : 'Could not load the organisation'}>
        {denied ? (
          <Stack align="start">
            <Text size="sm">Your account does not have access to this organisation.</Text>
            <Button component={Link} to="/" variant="light" onClick={onDenied}>Back to organisations</Button>
          </Stack>
        ) : <Button variant="light" onClick={() => {
          setResult({ status: 'loading' })
          setRevision((value) => value + 1)
        }}>Try again</Button>}
      </Alert>
    )
  }
  if (inbox) {
    return (
      <Stack gap="lg">
        <div>
          <Title order={1} size="h2">Invitations</Title>
          <Text c="dimmed" size="sm">{result.data.name}</Text>
        </div>
        <div className={styles.invitationPanels}>
          {/* The current role comes from the selected organisation's API response. */}
          {result.data.role === 'admin' && <StaffInvitation api={api} organisationId={id} />}
          {inbox}
        </div>
      </Stack>
    )
  }

  return (
    <Paper withBorder p="lg">
      <Stack align="start" gap="sm">
        <Title order={1} size="h2">{result.data.name}</Title>
        <Group gap="xs">
          <Text size="sm" c="dimmed">Your role</Text>
          <Badge variant="light" tt="capitalize">{result.data.role}</Badge>
        </Group>
      </Stack>
    </Paper>
  )
}

// React passes the content between the Loading tags as the children prop.
function Loading({ children }: { children: string }) {
  return <Group role="status" gap="sm"><Loader size="sm" />{children}</Group>
}
