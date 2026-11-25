import { Alert, Badge, Button, Group, List, Modal, Stack, Table, Text, Title } from '@mantine/core'
import { useEffect, useRef, useState } from 'react'
import { ApiError, type Role } from '../../organisations/api/organisations'
import { Loading, type LoadResult } from '../../organisations/components/Loading'
import { statusLabels, type Order, type OrderAction, type OrdersApi } from '../api/orders'

const eventLabels: Record<string, string> = {
  submitted: 'Submitted',
  automatically_approved: 'Automatically approved',
  approved: 'Approved',
  rejected: 'Rejected',
  fulfilled: 'Fulfilled',
}

const actionLabels = { approve: 'Approve', reject: 'Reject', fulfil: 'Fulfil' }

export function OrderDetail({ api, organisationId, id, submitted, role, userId, onChanged, onClose }: {
  api: OrdersApi
  organisationId: string
  id: string
  submitted?: Order
  role: Role
  userId: string
  onChanged: () => void
  onClose: () => void
}) {
  const [result, setResult] = useState<LoadResult<Order>>(submitted
    ? { status: 'ready', data: submitted }
    : { status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<OrderAction>()
  // The ref prevents overlapping actions even before React renders the disabled buttons.
  const mutation = useRef<AbortController | null>(null)

  useEffect(() => {
    if (submitted && revision === 0) return
    const request = new AbortController()
    void api.detail(organisationId, id, request.signal).then((data) => {
      if (!request.signal.aborted) setResult({ status: 'ready', data })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setResult({ status: 'failed', error })
    })
    return () => request.abort()
  }, [api, id, organisationId, revision, submitted])

  // Closing the order or switching organisations removes this component and cancels its action.
  useEffect(() => () => mutation.current?.abort(), [])

  function reload() {
    setResult({ status: 'loading' })
    setRevision((value) => value + 1)
  }

  async function transition(action: OrderAction) {
    if (mutation.current) return
    const request = new AbortController()
    mutation.current = request
    setSaving(action)
    setError('')
    try {
      const data = await api.transition(organisationId, id, action, request.signal)
      if (request.signal.aborted) return
      setResult({ status: 'ready', data })
      onChanged()
    } catch (error) {
      if (request.signal.aborted) return
      setError(error instanceof ApiError
        ? error.detail ?? 'The order action could not be completed.'
        : 'The order action could not be confirmed. Check the current status before trying again.')
      // A competing transition or an uncertain response may have changed the order on the server.
      reload()
      onChanged()
    } finally {
      if (!request.signal.aborted) {
        mutation.current = null
        setSaving(undefined)
      }
    }
  }

  return (
    // Keep the dialog open while an order action is saving, including when Escape is pressed.
    <Modal opened onClose={onClose} title="Order details" size="xl" centered
      closeOnEscape={!saving} closeOnClickOutside={!saving}
      closeButtonProps={{ 'aria-label': 'Close details', disabled: Boolean(saving) }}>
      <Stack>
        {error && <Alert role="alert" color="red">{error}</Alert>}
        {result.status === 'loading' && <Loading>Loading order details…</Loading>}
        {result.status === 'failed' && <Alert role="alert" color="red" title="Could not load order details">
          <Button variant="light" onClick={reload}>Retry details</Button>
        </Alert>}
        {result.status === 'ready' && (() => {
          const order = result.data
          // The UI offers actions for the current role and status. The API checks permission again.
          const actions: OrderAction[] = []
          if (role === 'manager' && order.status === 'pending') actions.push('approve', 'reject')
          if (role === 'salesperson' && order.status === 'approved' && order.submittedByUserId === userId) actions.push('fulfil')
          return <>
            <Group><Title order={2} size="h4">{order.customerName}</Title><Badge>{statusLabels[order.status]}</Badge></Group>
            <Text size="sm" c="dimmed">Order {order.id} · Submitted {new Date(order.createdAt).toLocaleString()}</Text>
            <Table.ScrollContainer minWidth={400}>
              <Table>
                <Table.Thead><Table.Tr><Table.Th>Product</Table.Th><Table.Th>SKU</Table.Th>
                  <Table.Th>Unit price</Table.Th><Table.Th>Quantity</Table.Th></Table.Tr></Table.Thead>
                <Table.Tbody>
                  {/* The API keeps snapshot rows in their original order, including repeated products. */}
                  {order.lines.map((line, index) => <Table.Tr key={index}>
                    <Table.Td>{line.name}</Table.Td><Table.Td>{line.sku}</Table.Td>
                    <Table.Td>{line.unitPrice}</Table.Td><Table.Td>{line.quantity}</Table.Td>
                  </Table.Tr>)}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Group>
              <Text>Subtotal {order.subtotal}</Text>
              <Text>Discount {order.discountPercent}%</Text>
              <Text>Approval threshold {order.approvalThresholdPercent}%</Text>
              <Text fw={700}>Total {order.total}</Text>
            </Group>
            {actions.length > 0 && <Group>
              {actions.map((action) => <Button key={action} loading={saving === action} disabled={Boolean(saving)}
                color={action === 'reject' ? 'red' : undefined} onClick={() => void transition(action)}>
                {actionLabels[action]}
              </Button>)}
            </Group>}
            <Title order={2} size="h4">Order history</Title>
            <List type="ordered">
              {order.history.map((event, index) => <List.Item key={index}>
                <Text span fw={600}>{eventLabels[event.kind] ?? event.kind}</Text>
                {' · '}{new Date(event.createdAt).toLocaleString()}
                {' · '}{event.actorUserId === userId ? 'You' : event.actorUserId ?? 'System'}
                {' · '}{event.fromStatus && `${statusLabels[event.fromStatus]} → `}{statusLabels[event.toStatus]}
              </List.Item>)}
            </List>
          </>
        })()}
      </Stack>
    </Modal>
  )
}
