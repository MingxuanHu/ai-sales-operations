import { Alert, Button, Modal, Paper, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import type { Membership, OrganisationsApi } from '../api/organisations'

export function CreateOrganisationPage({ api, onJoined, onDemoCreated }: {
  api: OrganisationsApi
  onJoined: (id: string) => void
  onDemoCreated: (membership: Membership) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'regular' | 'demo'>()
  const [demoError, setDemoError] = useState(false)
  const [error, setError] = useState('')
  // Refs remember the retry ID and the current browser request without updating the UI.
  const createAttempt = useRef<{ name: string; id: string } | undefined>(undefined)
  const demoAttempt = useRef<string | undefined>(undefined)
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
    setBusy('regular')
    setError('')
    try {
      const result = await api.create(attempt.name, attempt.id, request.signal)
      if (!request.signal.aborted) onJoined(result.organisationId)
    } catch {
      if (!request.signal.aborted) setError('Your request could not be completed. Please try again.')
    } finally {
      pending.current = null
      if (!request.signal.aborted) setBusy(undefined)
    }
  }

  async function createDemo() {
    if (pending.current) return
    const request = new AbortController()
    pending.current = request
    // Reuse the ID after a failed response so the retry can recover the original demo.
    const id = demoAttempt.current ??= crypto.randomUUID()
    setBusy('demo')
    try {
      const membership = await api.createDemo(id, request.signal)
      if (request.signal.aborted) return
      demoAttempt.current = undefined
      onDemoCreated(membership)
    } catch {
      if (!request.signal.aborted) setDemoError(true)
    } finally {
      pending.current = null
      if (!request.signal.aborted) setBusy(undefined)
    }
  }

  return (
    <Stack>
      <Title order={1} size="h2">Create organisation</Title>
      {/* SimpleGrid stacks the two choices on narrow screens. */}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Paper withBorder p="lg">
          <form onSubmit={createOrganisation}>
            <Stack gap="sm" align="start">
              <Title order={2} size="h4">Set up your organisation</Title>
              <Text c="dimmed" size="sm">Start with an empty workspace for your business. You’ll be its first administrator.</Text>
              {error && <Alert color="red" role="alert">{error}</Alert>}
              <TextInput label="Organisation name" required disabled={Boolean(busy)} w="100%"
                value={name} onChange={(event) => setName(event.currentTarget.value)} />
              <Button type="submit" disabled={busy === 'demo'} loading={busy === 'regular'}>Create organisation</Button>
            </Stack>
          </form>
        </Paper>
        <Paper withBorder p="lg" bg="var(--mantine-primary-color-light)">
          <Stack gap="sm" align="start">
            <Title order={2} size="h4">Explore a demo</Title>
            <Text c="dimmed" size="sm">Try the app in a separate workspace with sample customers, products and orders. A name is assigned automatically.</Text>
            <Button variant="default" disabled={busy === 'regular'} loading={busy === 'demo'} onClick={() => void createDemo()}>
              Create demo organisation
            </Button>
          </Stack>
        </Paper>
      </SimpleGrid>
      <Modal opened={demoError} onClose={() => setDemoError(false)} title="Could not create the demo">
        <Text>Try again.</Text>
      </Modal>
    </Stack>
  )
}
