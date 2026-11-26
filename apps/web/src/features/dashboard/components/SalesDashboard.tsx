import { Alert, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useState } from 'react'
import { Loading, type LoadResult } from '../../organisations/components/Loading'
import type { SalesRange, SalesReport, SalesReportApi } from '../api/salesReport'
import { SalesReportSections } from './SalesReportSections'

const dayMilliseconds = 86_400_000

function defaultRange(): SalesRange {
  const now = Date.now()
  // ISO date strings use UTC even when the browser is in another time zone.
  return {
    startDate: new Date(now - 59 * dayMilliseconds).toISOString().slice(0, 10),
    endDate: new Date(now).toISOString().slice(0, 10),
  }
}

export function SalesDashboard({ api, organisationId }: { api: SalesReportApi; organisationId: string }) {
  const [range, setRange] = useState(defaultRange)
  const [draft, setDraft] = useState(range)
  const [result, setResult] = useState<LoadResult<SalesReport>>({ status: 'loading' })
  const days = (Date.parse(draft.endDate) - Date.parse(draft.startDate)) / dayMilliseconds + 1
  const validRange = days >= 1 && days <= 366 && [draft.startDate, draft.endDate].every(
    (date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && !date.startsWith('0000'),
  )

  useEffect(() => {
    const request = new AbortController()
    void api(organisationId, range, request.signal).then((data) => {
      if (!request.signal.aborted) setResult({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setResult({ status: 'failed', error })
    })
    // Cleanup runs on a new filter or when the organisation's page unmounts.
    return () => request.abort()
  }, [api, organisationId, range])

  function load(next: SalesRange) {
    setResult({ status: 'loading' })
    // A fresh object retriggers the effect even when retrying the same dates.
    setRange({ ...next })
  }

  return (
    <Stack gap="lg">
      <Title order={1}>Sales dashboard</Title>
      <Paper withBorder p="md">
        <form onSubmit={(event) => {
          event.preventDefault()
          if (validRange) load(draft)
        }}>
          <Stack gap="sm">
            <Text size="sm">Dates are inclusive UTC calendar days. Select up to 366 days.</Text>
            <Group align="end">
              {/* The input values stay in draft state until the form is submitted. */}
              <TextInput type="date" label="Start date" required value={draft.startDate}
                onChange={(event) => setDraft({ ...draft, startDate: event.currentTarget.value })} />
              <TextInput type="date" label="End date" required value={draft.endDate}
                onChange={(event) => setDraft({ ...draft, endDate: event.currentTarget.value })} />
              <Button type="submit">Apply dates</Button>
            </Group>
            {!validRange && <Text role="status" size="sm" c="red">Enter a valid range of 1 to 366 days.</Text>}
          </Stack>
        </form>
      </Paper>
      {result.status === 'loading' && <Loading>Loading sales report…</Loading>}
      {result.status === 'failed' && (
        <Alert role="alert" color="red" title="Could not load the sales report">
          <Button variant="light" onClick={() => load(range)}>Try again</Button>
        </Alert>
      )}
      {/* Every section reads the same response, so totals and rankings change together. */}
      {result.status === 'ready' && <SalesReportSections report={result.data} />}
    </Stack>
  )
}
