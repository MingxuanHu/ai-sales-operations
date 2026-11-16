import { Alert, Button, CopyButton, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { ApiError, type Invitation, type OrganisationsApi } from '../api/organisations'

export function Onboarding({ api, userId, hasMemberships, onJoined }: {
  api: OrganisationsApi
  userId: string
  hasMemberships: boolean
  onJoined: (id: string) => void
}) {
  const [invitations, setInvitations] = useState<Invitation[]>()
  const [inboxFailed, setInboxFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const createAttempt = useRef<{ name: string; id: string } | undefined>(undefined)
  const active = useRef(false)

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    const request = new AbortController()
    void api.invitations(request.signal).then((result) => {
      if (!request.signal.aborted) setInvitations(result.invitations)
    }).catch(() => {
      if (!request.signal.aborted) setInboxFailed(true)
    })
    return () => request.abort()
  }, [api, revision])

  async function join(action: string, send: () => Promise<{ organisationId: string }>) {
    if (busy) return
    setBusy(action)
    setError('')
    try {
      const result = await send()
      if (active.current) onJoined(result.organisationId)
    } catch (failure) {
      if (!active.current) return
      setError(failure instanceof ApiError && failure.status === 409 && action !== 'create'
        ? 'This invitation is no longer available. Refresh your invitations to see the latest list.'
        : 'Your request could not be completed. Please try again.')
    } finally {
      if (active.current) setBusy(undefined)
    }
  }

  function createOrganisation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || [...trimmed].length > 120) {
      setError('Enter an organisation name between 1 and 120 characters.')
      return
    }
    // Retain the request ID when retrying the same name so the API can return the original creation.
    const attempt = createAttempt.current?.name === trimmed
      ? createAttempt.current
      : { name: trimmed, id: crypto.randomUUID() }
    createAttempt.current = attempt
    void join('create', () => api.create(attempt.name, attempt.id))
  }

  function refreshInbox() {
    setInboxFailed(false)
    setInvitations(undefined)
    setRevision((value) => value + 1)
  }

  return (
    <Stack>
      <Title order={1}>{hasMemberships ? 'Onboarding and invitations' : 'You don’t belong to an organisation yet'}</Title>
      {error && <Alert color="red" role="alert">{error}</Alert>}
      <Paper withBorder p="lg">
        <form onSubmit={createOrganisation}>
          <Stack gap="sm">
            <Title order={2} size="h3">Create an organisation</Title>
            <Text c="dimmed" size="sm">You’ll become its first administrator.</Text>
            <TextInput label="Organisation name" required value={name} onChange={(event) => setName(event.currentTarget.value)} />
            <Button type="submit" w="fit-content" loading={busy === 'create'} disabled={Boolean(busy)}>Create organisation</Button>
          </Stack>
        </form>
      </Paper>
      <Paper withBorder p="lg">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={2} size="h3">Invitations</Title>
            <Button variant="subtle" size="xs" onClick={refreshInbox} disabled={Boolean(busy)}>Refresh invitations</Button>
          </Group>
          <Text c="dimmed" size="sm">Share your user ID with an organisation administrator so they can invite you.</Text>
          <Group gap="xs">
            <Text size="sm" style={{ overflowWrap: 'anywhere' }}>{userId}</Text>
            <CopyButton value={userId}>
              {({ copied, copy }) => <Button variant="light" size="xs" onClick={copy}>{copied ? 'Copied' : 'Copy user ID'}</Button>}
            </CopyButton>
          </Group>
          {inboxFailed ? <Alert color="red" role="alert">Could not load invitations.</Alert> :
            !invitations ? <Text role="status" size="sm">Loading invitations…</Text> :
            invitations.length === 0 && <Text size="sm">You have no pending invitations.</Text>}
          {invitations?.map((invite) => (
            // The key lets React keep each invitation row associated with its own identity.
            <Paper key={invite.invitationId} withBorder p="sm">
              <Group justify="space-between">
                <div>
                  <Text fw={600}>{invite.name}</Text>
                  <Text c="dimmed" size="sm">Role offered: {invite.role}</Text>
                  <Text c="dimmed" size="sm">Expires {new Date(invite.expiresAt).toLocaleDateString()}</Text>
                </div>
                <Button
                  variant="light"
                  loading={busy === invite.invitationId}
                  disabled={Boolean(busy)}
                  aria-label={`Accept invitation to ${invite.name}`}
                  onClick={() => void join(invite.invitationId, () => api.accept(invite.invitationId))}
                >Accept invitation</Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Paper>
    </Stack>
  )
}
