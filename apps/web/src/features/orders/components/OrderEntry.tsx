import { Alert, Button, Fieldset, Group, NativeSelect, Paper, Stack, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../organisations/api/organisations'
import { Loading, type LoadResult } from '../../organisations/components/Loading'
import type { Order, OrdersApi, OrderSelectors } from '../api/orders'

export function OrderEntry({ api, organisationId, onSubmitted }: {
  api: OrdersApi
  organisationId: string
  onSubmitted: (order: Order) => void
}) {
  const [selectors, setSelectors] = useState<LoadResult<OrderSelectors>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [lines, setLines] = useState([0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Refs retain the request and line identifiers without changing the rendered form.
  const nextLine = useRef(1)
  const submission = useRef<AbortController | null>(null)
  const attempt = useRef<{ payload: string; requestId: string } | null>(null)

  useEffect(() => {
    const request = new AbortController()
    void api.selectors(organisationId, request.signal).then((data) => {
      if (!request.signal.aborted) setSelectors({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setSelectors({ status: 'failed', error })
    })
    return () => request.abort()
  }, [api, organisationId, revision])

  // Leaving the form cancels the browser request and prevents updates to the next organisation.
  useEffect(() => () => submission.current?.abort(), [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submission.current) return
    const form = event.currentTarget
    // FormData reads inputs by name. Quantities become JSON integers and the discount stays a decimal string.
    const data = new FormData(form)
    const input = {
      customerId: String(data.get('customer')),
      discountPercent: String(data.get('discount')),
      lines: lines.map((id) => ({
        productId: String(data.get(`product-${id}`)),
        quantity: Number(data.get(`quantity-${id}`)),
      })),
    }
    const payload = JSON.stringify(input)
    // An unchanged retry keeps its UUID in case the first request already reached the server.
    if (attempt.current?.payload !== payload) attempt.current = { payload, requestId: crypto.randomUUID() }
    const request = new AbortController()
    submission.current = request
    setSaving(true)
    setError('')
    try {
      const order = await api.submit(organisationId, { ...input, requestId: attempt.current.requestId }, request.signal)
      if (request.signal.aborted) return
      attempt.current = null
      form.reset()
      setLines([nextLine.current++])
      onSubmitted(order)
    } catch (error) {
      if (!request.signal.aborted) {
        setError(error instanceof ApiError ? error.detail ?? 'Could not submit the order.' : 'Could not submit the order. Try again.')
      }
    } finally {
      if (!request.signal.aborted) {
        submission.current = null
        setSaving(false)
      }
    }
  }

  return (
    <Paper withBorder p="lg">
      <Stack>
        <Title order={2} size="h3">New order</Title>
        {selectors.status === 'loading' && <Loading>Loading customers and products…</Loading>}
        {selectors.status === 'failed' && (
          <Alert role="alert" color="red" title="Could not load customers and products">
            <Button variant="light" onClick={() => {
              setSelectors({ status: 'loading' })
              setRevision((value) => value + 1)
            }}>Retry selectors</Button>
          </Alert>
        )}
        {selectors.status === 'ready' && (
          selectors.data.customers.length === 0 || selectors.data.products.length === 0
            ? <Text c="dimmed">Ask an administrator to add at least one customer and one product.</Text>
            : <form onSubmit={(event) => void submit(event)}>
              <Fieldset disabled={saving} variant="unstyled">
                <Stack>
                  <NativeSelect required label="Customer" name="customer" data={[
                    { value: '', label: 'Choose a customer' },
                    ...selectors.data.customers.map(({ id, name }) => ({ value: id, label: name })),
                  ]} />
                  <TextInput required label="Discount (%)" name="discount" defaultValue="0" inputMode="decimal"
                    pattern="[0-9]{1,3}([.][0-9]{1,2})?" description="Enter 0 to 100 with up to two decimal places." />
                  {/* Stable keys keep each line's inputs intact when a different line is removed. */}
                  {lines.map((id, index) => (
                    <Fieldset key={id} legend={`Line ${index + 1}`}>
                      <Group align="end">
                        <NativeSelect required label={`Product ${index + 1}`} name={`product-${id}`} data={[
                          { value: '', label: 'Choose a product' },
                          ...selectors.data.products.map(({ id, name, sku, unitPrice }) => ({
                            value: id, label: `${name} (${sku}) · ${unitPrice}`,
                          })),
                        ]} />
                        <TextInput required label={`Quantity ${index + 1}`} name={`quantity-${id}`} type="number"
                          min={1} max={2147483647} step={1} defaultValue="1" w={120} />
                        {lines.length > 1 && <Button variant="subtle" aria-label={`Remove line ${index + 1}`}
                          onClick={() => setLines(lines.filter((line) => line !== id))}>Remove</Button>}
                      </Group>
                    </Fieldset>
                  ))}
                  {error && <Alert role="alert" color="red">{error}</Alert>}
                  <Group>
                    <Button variant="light" onClick={() => {
                      const id = nextLine.current++
                      setLines([...lines, id])
                    }}>Add line</Button>
                    <Button type="submit" loading={saving}>Submit order</Button>
                  </Group>
                </Stack>
              </Fieldset>
            </form>
        )}
      </Stack>
    </Paper>
  )
}
