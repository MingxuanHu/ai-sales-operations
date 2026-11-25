import { Alert, Badge, Button, Group, Modal, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { ApiError, type Membership, type OrganisationsApi } from '../api/organisations'

export function OrganisationOverviewPage({ membership, api, onDeleted }: {
  membership: Membership
  api: OrganisationsApi
  onDeleted: () => void
}) {
  const [opened, setOpened] = useState(false)
  const [confirmationName, setConfirmationName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef<AbortController | null>(null)

  // Switching organisations unmounts this overview and cancels its pending response.
  useEffect(() => () => pending.current?.abort(), [])

  async function deleteOrganisation(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || confirmationName !== membership.name) return
    const request = new AbortController()
    pending.current = request
    setSaving(true)
    setError('')
    try {
      await api.deleteDemo(membership.organisationId, confirmationName, request.signal)
      if (!request.signal.aborted) onDeleted()
    } catch (failure) {
      if (request.signal.aborted) return
      // A lost response may mean the deletion already completed. Refresh access on 404.
      if (failure instanceof ApiError && failure.status === 404) onDeleted()
      else setError('Could not delete the demo organisation. Try again.')
    } finally {
      pending.current = null
      if (!request.signal.aborted) setSaving(false)
    }
  }

  return (
    <Paper withBorder p="lg">
      <Stack align="start" gap="sm">
        <Title order={1} size="h2" style={{ overflowWrap: 'anywhere' }}>{membership.name}</Title>
        <Group gap="xs">
          <Text size="sm" c="dimmed">Your role</Text>
          <Badge variant="light" tt="capitalize">{membership.role}</Badge>
        </Group>
        {membership.role === 'admin' && membership.isDemo && (
          <Button color="red" variant="light" onClick={() => {
            setConfirmationName('')
            setError('')
            setOpened(true)
          }}>Delete demo organisation</Button>
        )}
      </Stack>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Delete demo organisation"
        closeOnEscape={!saving} closeOnClickOutside={!saving} closeButtonProps={{ disabled: saving }}>
        <form onSubmit={deleteOrganisation}>
          <Stack>
            <Text size="sm">This permanently deletes the demo and all its data. Type the exact organisation name to confirm.</Text>
            <Text fw={600} style={{ overflowWrap: 'anywhere' }}>{membership.name}</Text>
            <TextInput label="Organisation name" value={confirmationName} autoComplete="off" disabled={saving}
              onChange={(event) => setConfirmationName(event.currentTarget.value)} data-autofocus />
            {error && <Alert role="alert" color="red">{error}</Alert>}
            <Group justify="end">
              <Button variant="default" disabled={saving} onClick={() => setOpened(false)}>Cancel</Button>
              <Button type="submit" color="red" disabled={confirmationName !== membership.name}
                loading={saving}>Delete permanently</Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Paper>
  )
}
