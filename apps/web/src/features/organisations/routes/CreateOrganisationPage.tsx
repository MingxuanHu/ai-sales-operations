import { Alert, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { type OrganisationsApi } from '../api/organisations'

export function CreateOrganisationPage({ api, onJoined }: {
  api: OrganisationsApi
  onJoined: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Refs remember the retry ID and the current browser request without updating the UI.
  const createAttempt = useRef<{ name: string; id: string } | undefined>(undefined)
  const pending = useRef<AbortController | null>(null)

  // Leaving this page aborts the browser request and prevents late navigation.
  useEffect(() => () => pending.current?.abort(), [])

  async function createOrganisation(event: SubmitEvent<HTMLFormElement>) {
    // Handle the form in React so the browser does not reload the page on submit.
    event.preventDefault()
    if (pending.current) return
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
    const request = new AbortController()
    pending.current = request
    setBusy(true)
    setError('')
    try {
      const result = await api.create(attempt.name, attempt.id, request.signal)
      if (!request.signal.aborted) onJoined(result.organisationId)
    } catch {
      if (!request.signal.aborted) setError('Your request could not be completed. Please try again.')
    } finally {
      pending.current = null
      if (!request.signal.aborted) setBusy(false)
    }
  }

  return (
    <Stack>
      <Title order={1} size="h2">Create organisation</Title>
      {error && <Alert color="red" role="alert">{error}</Alert>}
      <Paper withBorder p="lg">
        <form onSubmit={createOrganisation}>
          <Stack gap="sm">
            <Text c="dimmed" size="sm">You’ll become its first administrator.</Text>
            {/* This is a controlled input. React state supplies the value and onChange updates it as the user types. */}
            <TextInput label="Organisation name" required disabled={busy} value={name} onChange={(event) => setName(event.currentTarget.value)} />
            <Button type="submit" w="fit-content" loading={busy}>Create organisation</Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  )
}
