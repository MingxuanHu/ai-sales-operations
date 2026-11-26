import { Alert, Badge, Button, Checkbox, Group, List, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ListPagination, useSearchableList } from '../../../shared/ListPagination'
import type { Role } from '../../organisations/api/organisations'
import { Loading, type LoadResult } from '../../organisations/components/Loading'
import { statusLabels, type Order, type OrdersApi, type OrderSummary } from '../api/orders'
import { OrderDetail } from './OrderDetail'
import { OrderEntry } from './OrderEntry'

export function OrdersPage({ api, organisationId, role, userId, isDemo }: {
  api: OrdersApi
  organisationId: string
  role: Role
  userId: string
  isDemo: boolean
}) {
  const [pending, setPending] = useState(role === 'manager')
  const [orders, setOrders] = useState<LoadResult<OrderSummary[]>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [selection, setSelection] = useState<{ id: string; submitted?: Order }>()
  const { rows, controls, query, search } = useSearchableList(
    orders.status === 'ready' ? orders.data : undefined, ({ customerName, id, status }) => [customerName, id, statusLabels[status]],
  )

  const detailTrigger = useRef<HTMLButtonElement | null>(null)
  // Restore keyboard focus to the row button after the dialog is removed.
  useLayoutEffect(() => {
    if (selection) return
    detailTrigger.current?.focus({ preventScroll: true })
    detailTrigger.current = null
  }, [selection])

  // The organisation route remounts this page on tenant switch, and cleanup cancels the list request.
  useEffect(() => {
    const request = new AbortController()
    void api.list(organisationId, pending, request.signal).then(({ orders }) => {
      if (!request.signal.aborted) setOrders({ status: 'ready', data: orders })
    }).catch((error: unknown) => {
      if (!request.signal.aborted) setOrders({ status: 'failed', error })
    })
    return () => request.abort()
  }, [api, organisationId, pending, revision])

  function refreshList() {
    setOrders({ status: 'loading' })
    setRevision((value) => value + 1)
  }

  return (
    <Stack>
      <Title order={1} size="h2">Orders</Title>
      {role === 'salesperson' && <OrderEntry api={api} organisationId={organisationId} onSubmitted={(order) => {
        setSelection({ id: order.id, submitted: order })
        refreshList()
      }} />}
      <Paper withBorder p="lg">
        <Stack>
          <Group justify="space-between">
            <Title order={2} size="h3">{role === 'salesperson' ? 'My orders' : 'Organisation orders'}</Title>
            {role === 'manager' && <Checkbox label="Pending only" checked={pending} onChange={(event) => {
              setOrders({ status: 'loading' })
              controls.setPage(1)
              setPending(event.currentTarget.checked)
            }} />}
          </Group>
          {orders.status === 'ready' && <TextInput label="Search orders" type="search" placeholder="Search by customer, status or order ID"
            value={query} onChange={(event) => search(event.currentTarget.value)} />}
          {orders.status === 'loading' && <Loading>Loading orders…</Loading>}
          {orders.status === 'failed' && <Alert role="alert" color="red" title="Could not load orders">
            <Button variant="light" onClick={refreshList}>Retry orders</Button>
          </Alert>}
          {orders.status === 'ready' && orders.data.length > 0 && rows.length === 0 &&
            <Text c="dimmed">No orders match your search.</Text>}
          {orders.status === 'ready' && orders.data.length === 0 && (
            <Stack gap="xs">
              <Text c="dimmed">{pending ? 'No orders are awaiting approval.' : 'No orders yet.'}</Text>
              {/* Administrators see setup guidance. Salespeople use the form above. */}
              {role === 'admin' && !isDemo && <>
                <Title order={3} size="h5">How to create an order</Title>
                <List type="ordered" size="sm" spacing="xs">
                  <List.Item><strong>Administrator</strong> — Add customers and products, then invite staff as salespeople or managers.</List.Item>
                  <List.Item><strong>Salesperson</strong> — In Orders, choose a customer, add products and quantities, then submit the order.</List.Item>
                  <List.Item><strong>Manager</strong> — Review, approve or reject orders above the discount threshold (10% by default). Orders at or below it are approved automatically.</List.Item>
                  <List.Item><strong>Salesperson</strong> — Open your approved order and select Fulfil when it’s ready.</List.Item>
                </List>
              </>}
            </Stack>
          )}
          {orders.status === 'ready' && rows.length > 0 && (
            <Table.ScrollContainer minWidth={460}>
              <Table>
                <Table.Thead>
                  <Table.Tr><Table.Th>Customer</Table.Th><Table.Th>Submitted</Table.Th><Table.Th>Status</Table.Th>
                    <Table.Th>Total</Table.Th><Table.Th>Order</Table.Th></Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {rows.map((order) => (
                    <Table.Tr key={order.id}>
                      <Table.Td>{order.customerName}</Table.Td>
                      <Table.Td>{new Date(order.createdAt).toLocaleString()}</Table.Td>
                      <Table.Td><Badge variant="light">{statusLabels[order.status]}</Badge></Table.Td>
                      <Table.Td>{order.total}</Table.Td>
                      <Table.Td><Button size="xs" variant="subtle" aria-haspopup="dialog"
                        onClick={(event) => {
                          detailTrigger.current = event.currentTarget
                          setSelection({ id: order.id })
                        }}>View order</Button></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          {orders.status === 'ready' && <ListPagination {...controls} label="Orders pages" />}
        </Stack>
      </Paper>
      {/* The modal stays outside the table layout. Its key resets detail state when another order opens. */}
      {selection && <OrderDetail key={selection.id} api={api} organisationId={organisationId} id={selection.id}
        submitted={selection.submitted} role={role} userId={userId} onChanged={refreshList}
        onClose={() => setSelection(undefined)} />}
    </Stack>
  )
}
