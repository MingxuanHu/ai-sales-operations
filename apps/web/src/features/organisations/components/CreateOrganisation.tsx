import { Alert, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import { type OrganisationsApi } from '../api/organisations'

export function CreateOrganisation({ api, onJoined }: {
  api: OrganisationsApi
  onJoined: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  // Refs remember the retry ID and whether the screen is mounted without updating the UI.
  const createAttempt = useRef<{ name: string; id: string } | undefined>(undefined)
  const active = useRef(false)

  useEffect(() => {
    // Cleanup marks the view inactive so a late response cannot navigate after the user leaves.
    active.current = true
    return () => { active.current = false }
  }, [])

  async function createOrganisation(event: SubmitEvent<HTMLFormElement>) {
    // Handle the form in React so the browser does not reload the page on submit.
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
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const result = await api.create(attempt.name, attempt.id)
      if (active.current) onJoined(result.organisationId)
    } catch {
      if (active.current) setError('Your request could not be completed. Please try again.')
    } finally {
      if (active.current) setBusy(false)
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
            <TextInput label="Organisation name" required value={name} onChange={(event) => setName(event.currentTarget.value)} />
            <Button type="submit" w="fit-content" loading={busy}>Create organisation</Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  )
}
