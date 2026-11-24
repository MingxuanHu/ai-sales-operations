import { Alert, Badge, Button, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'
import { ApiError, type Membership, type OrganisationsApi, type Profile } from '../api/organisations'
import { Onboarding } from './Onboarding'
import { StaffInvitation } from './StaffInvitation'

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

  function openOrganisation(id: string) {
    void navigate(`/organisations/${encodeURIComponent(id)}`)
  }

  if (profile.status === 'loading') return <Loading>Loading your organisations…</Loading>
  if (profile.status === 'failed') {
    return <Alert role="alert" color="red" title="Could not load your organisations">
      <Button variant="light" onClick={reloadProfile}>Try again</Button>
    </Alert>
  }

  const { memberships, userId } = profile.data
  return (
    <Stack gap="lg">
      <Group align="end" justify="space-between">
        {/* The current route determines the selected option and choosing an option changes the route. */}
        <Select
          label="Organisation"
          placeholder={memberships.length ? 'Choose an organisation' : 'No organisations'}
          data={memberships.map(({ organisationId, name }) => ({ value: organisationId, label: name }))}
          disabled={!memberships.length}
          allowDeselect={false}
          maxDropdownHeight={240}
          value={memberships.find(({ organisationId }) => pathname === `/organisations/${organisationId}`)?.organisationId ?? null}
          onChange={(id) => { if (id) openOrganisation(id) }}
        />
        <Button component={Link} to="/onboarding" variant="default">Onboarding and invitations</Button>
      </Group>
      {/* React Router renders the element whose route matches the URL. The index route handles the workspace home. */}
      <Routes>
        <Route index element={memberships.length === 1 ? (
          <Navigate replace to={`/organisations/${encodeURIComponent(memberships[0].organisationId)}`} />
        ) : memberships.length ? (
          <Paper withBorder p="lg">
            <Title order={1}>Choose an organisation</Title>
            <Text c="dimmed">Select an organisation to open its workspace.</Text>
          </Paper>
        ) : (
          <Navigate replace to="/onboarding" />
        )} />
        <Route path="/onboarding" element={
          <Onboarding api={api} userId={userId} hasMemberships={memberships.length > 0} onJoined={(id) => {
            reloadProfile()
            openOrganisation(id)
          }} />
        } />
        <Route path="/organisations/:organisationId" element={<SelectedOrganisation api={api} onDenied={reloadProfile} />} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </Stack>
  )
}

function SelectedOrganisation({ api, onDenied }: { api: OrganisationsApi; onDenied: () => void }) {
  // useParams reads the organisation ID from the dynamic part of the URL.
  const { organisationId = '' } = useParams()
  // A new key resets view state immediately when the route changes to another organisation.
  return <OrganisationOverview key={organisationId} id={organisationId} api={api} onDenied={onDenied} />
}

function OrganisationOverview({ id, api, onDenied }: { id: string; api: OrganisationsApi; onDenied: () => void }) {
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
  return (
    <Paper withBorder p="lg">
      <Stack align="start" gap="sm">
        <Title order={1}>{result.data.name}</Title>
        <Group gap="xs">
          <Text size="sm" c="dimmed">Your role</Text>
          <Badge variant="light" tt="capitalize">{result.data.role}</Badge>
        </Group>
        {/* The overview response supplies the current role for this organisation. */}
        {result.data.role === 'admin' && <StaffInvitation api={api} organisationId={id} />}
      </Stack>
    </Paper>
  )
}

// React passes the content between the Loading tags as the children prop.
function Loading({ children }: { children: string }) {
  return <Group role="status" gap="sm"><Loader size="sm" />{children}</Group>
}
