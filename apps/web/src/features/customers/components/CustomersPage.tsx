import { Alert, Button, Group, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useState, type FormEvent } from 'react'
import { ListPagination, useSearchableList } from '../../../shared/ListPagination'
import { ApiError } from '../../organisations/api/organisations'
import { Loading, type LoadResult } from '../../organisations/components/Loading'
import type { Customer, CustomerInput, CustomersApi } from '../api/customers'

const emptyCustomer = { name: '' }

function accessDenied(error: unknown) {
  return error instanceof ApiError && error.status === 403
}

function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.detail) return error.detail
    if (error.status === 404) return 'The customer or organisation is no longer available. Reload the directory.'
  }
  return 'The request failed. Try again.'
}

export function CustomersPage({ api, organisationId }: { api: CustomersApi; organisationId: string }) {
  const [directory, setDirectory] = useState<LoadResult<Customer[]>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState<{ id?: string; input: CustomerInput }>()
  const [removing, setRemoving] = useState<Customer>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requests, setRequests] = useState<AbortController>()
  const { rows, controls, query, search } = useSearchableList(
    directory.status === 'ready' ? directory.data : undefined, ({ name }) => [name],
  )

  useEffect(() => {
    const request = new AbortController()
    setRequests(request)
    void api.list(organisationId, request.signal).then(({ customers }) => {
      if (!request.signal.aborted) setDirectory({ status: 'ready', data: customers })
    }).catch((failure: unknown) => {
      if (!request.signal.aborted) setDirectory({ status: 'failed', error: failure })
    })
    // The organisation route unmounts this page on switch, cancelling its pending requests.
    return () => request.abort()
  }, [api, organisationId, revision])

  function reload() {
    setForm(undefined)
    setRemoving(undefined)
    setError('')
    setNotice('')
    setDirectory({ status: 'loading' })
    setRevision((value) => value + 1)
  }

  async function mutate(action: (signal: AbortSignal) => Promise<void>) {
    if (!requests || busy) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action(requests.signal)
    } catch (failure) {
      if (requests.signal.aborted) return
      if (accessDenied(failure) || (failure instanceof ApiError && failure.status === 404)) {
        setDirectory({ status: 'failed', error: failure })
      } else {
        setError(message(failure))
      }
    } finally {
      if (!requests.signal.aborted) setBusy(false)
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    void mutate(async (signal) => {
      const saved = await api.save(organisationId, form.id, form.input, signal)
      if (signal.aborted) return
      // Use the server's validated values and replace the matching row after an edit.
      setDirectory((current) => current.status === 'ready' ? {
        status: 'ready',
        data: [...current.data.filter(({ id }) => id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id)),
      } : current)
      setForm(undefined)
      setNotice(form.id ? 'Customer updated.' : 'Customer created.')
    })
  }

  function remove() {
    if (!removing) return
    void mutate(async (signal) => {
      await api.remove(organisationId, removing.id, signal)
      if (signal.aborted) return
      setDirectory((current) => current.status === 'ready'
        ? { status: 'ready', data: current.data.filter(({ id }) => id !== removing.id) }
        : current)
      setRemoving(undefined)
      setNotice('Customer deleted.')
    })
  }

  return (
    <Paper withBorder p="lg">
      <Stack>
        <Title order={1} size="h2">Customers</Title>
        {directory.status === 'loading' && <Loading>Loading customers…</Loading>}
        {directory.status === 'failed' && (
          <Alert role="alert" color="red" title={accessDenied(directory.error) ? 'Access denied' : 'Could not load customers'}>
            {accessDenied(directory.error) ? 'Only organisation administrators can manage customers.'
              : <Button variant="light" onClick={reload}>Reload directory</Button>}
          </Alert>
        )}
        {directory.status === 'ready' && <>
          {notice && <Text role="status">{notice}</Text>}
          {error && <Alert role="alert" color="red">{error}</Alert>}
          {!form && !removing && <Group>
            <Button onClick={() => { setNotice(''); setForm({ input: emptyCustomer }) }}>Add customer</Button>
          </Group>}
          {form && (
            // The inputs read React state. Each change copies the form and replaces one field.
            <form onSubmit={save}>
              <Stack>
                <Title order={2} size="h3">{form.id ? 'Edit customer' : 'Add customer'}</Title>
                <TextInput label="Name" value={form.input.name} required disabled={busy}
                  onChange={(event) => setForm({ ...form, input: { ...form.input, name: event.currentTarget.value } })} />
                <Group>
                  <Button type="submit" loading={busy}>Save customer</Button>
                  <Button variant="default" disabled={busy} onClick={() => { setForm(undefined); setError('') }}>Cancel</Button>
                </Group>
              </Stack>
            </form>
          )}
          {removing && (
            <Alert color="red" title={`Delete ${removing.name}?`}>
              <Group>
                <Button color="red" loading={busy} onClick={remove}>Delete customer</Button>
                <Button variant="default" disabled={busy} onClick={() => { setRemoving(undefined); setError('') }}>Cancel</Button>
              </Group>
            </Alert>
          )}
          <TextInput label="Search customers" type="search" placeholder="Search by name"
            value={query} onChange={(event) => search(event.currentTarget.value)} />
          {rows.length === 0 ? <Text c="dimmed">{directory.data.length === 0
            ? 'No customers yet.' : 'No customers match your search.'}</Text> : (
            <Table.ScrollContainer minWidth={320}>
              <Table>
                <Table.Thead><Table.Tr>
                  <Table.Th>Name</Table.Th><Table.Th>Actions</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {/* The stable customer ID lets React match rows after edits or deletions. */}
                  {rows.map((customer) => (
                    <Table.Tr key={customer.id}>
                      <Table.Td>{customer.name}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button size="compact-sm" variant="subtle" aria-label={`Edit ${customer.name}`} disabled={Boolean(form || removing)}
                            onClick={() => { setNotice(''); setForm({ id: customer.id, input: customer }) }}>Edit</Button>
                          <Button size="compact-sm" variant="subtle" color="red" aria-label={`Delete ${customer.name}`} disabled={Boolean(form || removing)}
                            onClick={() => { setNotice(''); setRemoving(customer) }}>Delete</Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          <ListPagination {...controls} label="Customers pages" />
        </>}
      </Stack>
    </Paper>
  )
}
