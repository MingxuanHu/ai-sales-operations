import { ActionIcon, Alert, Button, CopyButton, Group, Indicator, Modal, Paper, Stack, Text, Title } from '@mantine/core'
import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { ApiError, type Invitation, type OrganisationsApi } from '../../api/organisations'

export function InvitationInbox({ api, userId, onJoined, target }: {
  target: HTMLElement
  api: OrganisationsApi
  userId: string
  onJoined: (id: string) => void
}) {
  // An undefined inbox is still loading. An empty array means the API returned no invitations.
  const [opened, setOpened] = useState(false)
  const [invitations, setInvitations] = useState<Invitation[]>()
  const [inboxFailed, setInboxFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  // Store the active invitation ID so only its button displays a spinner.
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)

  // Signing out unmounts Messages and aborts the browser request and prevents late navigation.
  useEffect(() => () => pending.current?.abort(), [])

  useEffect(() => {
    const request = new AbortController()
    void api.invitations(request.signal).then((result) => {
      if (!request.signal.aborted) {
        setInvitations(result.invitations)
        setInboxFailed(false)
      }
    }).catch(() => {
      if (!request.signal.aborted) setInboxFailed(true)
    })
    // Cancel the old inbox read when the user refreshes it or leaves this screen.
    return () => request.abort()
  }, [api, revision])

  // Check for incoming invitations while the user works elsewhere in the app.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!pending.current && !document.hidden) setRevision((value) => value + 1)
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  function closeInbox() {
    pending.current?.abort()
    pending.current = null
    setBusy(undefined)
    setOpened(false)
  }

  async function accept(invitationId: string) {
    if (pending.current) return
    const request = new AbortController()
    pending.current = request
    setBusy(invitationId)
    setError('')
    try {
      const result = await api.accept(invitationId, request.signal)
      // The parent supplied onJoined as a prop and uses it to open the organisation.
      if (!request.signal.aborted) onJoined(result.organisationId)
    } catch (failure) {
      if (request.signal.aborted) return
      setError(failure instanceof ApiError && failure.status === 409
        ? 'This invitation is no longer available. Refresh your invitations to see the latest list.'
        : 'Your request could not be completed. Please try again.')
    } finally {
      if (!request.signal.aborted) {
        pending.current = null
        setBusy(undefined)
      }
    }
  }

  function refreshInbox() {
    setError('')
    setInboxFailed(false)
    setRevision((value) => value + 1)
  }

  const count = invitations?.length ?? 0
  return createPortal(
    <>
      <Indicator color="red" label={count} size={17} offset={3} disabled={count === 0}>
        <ActionIcon variant="subtle" size="lg" aria-haspopup="dialog"
          aria-label={count ? `Messages (${count} pending ${count === 1 ? 'invitation' : 'invitations'})` : 'Messages'}
          onClick={() => {
            refreshInbox()
            setOpened(true)
          }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </ActionIcon>
      </Indicator>
      <Modal opened={opened} onClose={closeInbox} title="Messages" size="lg" centered>
        <Stack gap="md">
          {error && <Alert color="red" role="alert">{error}</Alert>}
          <Group justify="space-between">
            <Title order={2} size="h3">Received invitations</Title>
            <Button variant="subtle" size="xs" onClick={refreshInbox} disabled={Boolean(busy)}>Refresh invitations</Button>
          </Group>
          <Text c="dimmed" size="sm">Share your user ID with an organisation administrator so they can invite you.</Text>
          <Group gap="xs">
            <Text size="sm" ff="monospace" style={{ overflowWrap: 'anywhere' }}>{userId}</Text>
            {/* Mantine calls this child function with the copy action and the state for the button label. */}
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
                  onClick={() => void accept(invite.invitationId)}
                >Accept invitation</Button>
              </Group>
            </Paper>
          ))}
        </Stack>
      </Modal>
    </>,
    target,
  )
}
