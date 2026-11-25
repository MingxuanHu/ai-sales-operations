import { Alert, Button, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type SubmitEvent } from 'react'
import type { Membership, OrganisationsApi } from '../api/organisations'
import { StaffInvitation } from '../components/invitations/StaffInvitation'
import { Loading } from '../components/Loading'
import { DeleteDemoPanel } from './DeleteDemoPanel'

export function OrganisationSettingsPage({ membership, api, onDeleted }: {
  membership: Membership
  api: OrganisationsApi
  onDeleted: () => void
}) {
  const { organisationId } = membership
  const [threshold, setThreshold] = useState<string>()
  const [loadFailed, setLoadFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string }>()
  const saveRequest = useRef<AbortController | null>(null)

  // Start a fresh read on retry and ignore results after switching organisations.
  useEffect(() => {
    const request = new AbortController()
    void api.settings(organisationId, request.signal).then(({ orderApprovalThresholdBasisPoints }) => {
      if (!request.signal.aborted) setThreshold((orderApprovalThresholdBasisPoints / 100).toFixed(2))
    }).catch(() => {
      if (!request.signal.aborted) setLoadFailed(true)
    })
    return () => request.abort()
  }, [api, organisationId, revision])
  useEffect(() => () => saveRequest.current?.abort(), [])

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saveRequest.current || threshold === undefined) return
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(threshold) || Number(threshold) > 100) {
      setMessage({ error: true, text: 'Enter a percentage from 0 to 100 with up to two decimal places.' })
      return
    }
    // Split the decimal into hundredths so the API receives an exact integer.
    const [whole, fraction = ''] = threshold.split('.')
    const basisPoints = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
    const request = new AbortController()
    saveRequest.current = request
    setSaving(true)
    setMessage(undefined)
    try {
      const settings = await api.updateThreshold(organisationId, basisPoints, request.signal)
      if (request.signal.aborted) return
      setThreshold((settings.orderApprovalThresholdBasisPoints / 100).toFixed(2))
      setMessage({ error: false, text: 'Threshold saved.' })
    } catch {
      if (!request.signal.aborted) setMessage({ error: true, text: 'Could not save the threshold. Try again.' })
    } finally {
      saveRequest.current = null
      if (!request.signal.aborted) setSaving(false)
    }
  }

  return (
    <Stack>
      <Title order={1} size="h2">Settings</Title>
      <StaffInvitation api={api} organisationId={organisationId} />
      <Paper withBorder p="lg">
        <Stack>
          <Title order={2} size="h4">Order approval</Title>
          <Text c="dimmed" size="sm">New orders with a discount above this threshold require manager approval.</Text>
          {loadFailed ? <Alert color="red" role="alert" title="Could not load settings">
            <Button variant="light" onClick={() => {
              setLoadFailed(false)
              setRevision((value) => value + 1)
            }}>Try again</Button>
          </Alert> : threshold === undefined ? <Loading>Loading settings…</Loading> : (
            <form onSubmit={save}>
              <Stack align="start">
                <TextInput label="Discount approval threshold (%)" inputMode="decimal" required disabled={saving}
                  value={threshold} onChange={(event) => {
                    setThreshold(event.currentTarget.value)
                    setMessage(undefined)
                  }} />
                {message && <Text role={message.error ? 'alert' : 'status'} c={message.error ? 'red' : 'dimmed'} size="sm">
                  {message.text}
                </Text>}
                <Button type="submit" loading={saving}>Save threshold</Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
      {membership.isDemo && <DeleteDemoPanel membership={membership} api={api} onDeleted={onDeleted} />}
    </Stack>
  )
}
