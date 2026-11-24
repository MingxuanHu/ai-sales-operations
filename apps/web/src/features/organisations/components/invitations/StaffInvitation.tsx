import { Alert, Button, NativeSelect, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { ApiError, type InvitationReceipt, type OrganisationsApi, type Role } from '../../api/organisations'

const roles: { value: Role; label: string }[] = [
  { value: 'salesperson', label: 'Salesperson' },
  { value: 'manager', label: 'Manager' },
  { value: 'admin', label: 'Administrator' },
]

type Action = 'issue' | 'revoke'

function invitationError(error: unknown, action: Action) {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Only a current organisation administrator can manage invitations.'
    if (error.status === 404) return action === 'issue'
      ? 'The recipient or organisation could not be found. Check the shared user ID and your organisation access.'
      : 'The invitation could not be found. Check your organisation access.'
    if (error.status === 400 && action === 'issue') return 'Enter the user ID copied from the recipient’s onboarding screen.'
    if (error.status === 409) {
      if (action === 'revoke') return 'This invitation is no longer pending.'
      if (error.detail === 'Recipient is already a member') return 'This recipient is already a member of the organisation.'
      if (error.detail === 'A pending invitation has a different role') {
        return 'A pending invitation has a different role. Submit again with the original role to recover its confirmation and revoke it before offering a different role.'
      }
      return 'The recipient may already be a member or have a pending invitation with a different role.'
    }
  }
  return 'Your request could not be completed. Please try again.'
}

export function StaffInvitation({ api, organisationId }: { api: OrganisationsApi; organisationId: string }) {
  // State supplies the input values, progress indicator and latest confirmation on each render.
  const [recipient, setRecipient] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [confirmation, setConfirmation] = useState<(InvitationReceipt & { recipient: string })>()
  const [busy, setBusy] = useState<Action>()
  const [error, setError] = useState('')
  const [revoked, setRevoked] = useState(false)
  const request = useRef<AbortController | null>(null)

  // The keyed overview unmounts on organisation switch. Cleanup cancels any pending browser request.
  useEffect(() => () => request.current?.abort(), [])

  async function run(action: Action, send: (signal: AbortSignal) => Promise<void>) {
    // A ref changes immediately, so a second event cannot start a request before React renders.
    if (request.current) return
    const controller = new AbortController()
    request.current = controller
    setBusy(action)
    setError('')
    setRevoked(false)
    try {
      await send(controller.signal)
    } catch (failure) {
      if (controller.signal.aborted) return
      if (action === 'revoke' && failure instanceof ApiError && failure.status === 409) setConfirmation(undefined)
      setError(invitationError(failure, action))
    } finally {
      request.current = null
      if (!controller.signal.aborted) setBusy(undefined)
    }
  }

  function issue(event: SubmitEvent<HTMLFormElement>) {
    // Submit in place so the browser keeps the selected organisation open.
    event.preventDefault()
    const recipientUserId = recipient.trim()
    if (request.current) return
    if (!role || !recipientUserId) {
      setError('Enter the recipient’s user ID and choose a role.')
      return
    }
    void run('issue', async (signal) => {
      const receipt = await api.issueInvitation(organisationId, recipientUserId, role, signal)
      if (!signal.aborted) setConfirmation({ ...receipt, recipient: recipientUserId })
    })
  }

  function revoke(invitationId: string) {
    void run('revoke', async (signal) => {
      await api.revokeInvitation(organisationId, invitationId, signal)
      if (!signal.aborted) {
        setConfirmation(undefined)
        setRevoked(true)
      }
    })
  }

  return (
    <Paper withBorder p="lg">
      <Stack gap="md">
        <Title order={2} size="h3">Invite staff</Title>
        <form onSubmit={issue}>
          <Stack gap="md">
            <TextInput
              label="Recipient user ID"
              description="Ask the recipient to copy their user ID from the Invitations page."
              required
              disabled={Boolean(busy)}
              value={recipient}
              onChange={(event) => setRecipient(event.currentTarget.value)}
            />
            <NativeSelect
              label="Role"
              required
              disabled={Boolean(busy)}
              data={[{ value: '', label: 'Choose a role', disabled: true }, ...roles]}
              value={role}
              onChange={(event) => {
                // Match the selected string to a supported role before storing it.
                setRole(roles.find(({ value }) => value === event.currentTarget.value)?.value ?? '')
              }}
            />
            <Button type="submit" color="teal.8" w="fit-content" disabled={Boolean(busy)} loading={busy === 'issue'}>Send invitation</Button>
          </Stack>
        </form>
        {error && <Alert color="red" role="alert">{error}</Alert>}
        {revoked && <Alert role="status">Invitation revoked.</Alert>}
        {confirmation && (
          <Stack gap="xs">
            <Alert role="status" title="Invitation ready">
              <Text size="sm" style={{ overflowWrap: 'anywhere' }}>
                {roles.find(({ value }) => value === confirmation.role)?.label} invitation for {confirmation.recipient}.
              </Text>
              <Text size="sm">Expires {new Date(confirmation.expiresAt).toLocaleString()}.</Text>
            </Alert>
            <Button w="fit-content" variant="light" color="red" disabled={Boolean(busy)} loading={busy === 'revoke'}
              onClick={() => revoke(confirmation.invitationId)}
            >Revoke invitation</Button>
          </Stack>
        )}
      </Stack>
    </Paper>
  )
}
