import { Alert, Button, Group, Paper, Stack, Table, Text, TextInput, Title } from '@mantine/core'
import { useEffect, useState, type FormEvent } from 'react'
import { ListPagination, useListPagination } from '../../../shared/ListPagination'
import { ApiError } from '../../organisations/api/organisations'
import { Loading, type LoadResult } from '../../organisations/components/Loading'
import type { Product, ProductInput, ProductsApi } from '../api/products'

const emptyProduct = { sku: '', name: '', unitPrice: '' }

function accessDenied(error: unknown) {
  return error instanceof ApiError && error.status === 403
}

function message(error: unknown) {
  if (error instanceof ApiError) {
    if (error.detail) return error.detail
    if (error.status === 404) return 'The product or organisation is no longer available. Reload the catalogue.'
  }
  return 'The request failed. Try again.'
}

export function ProductsPage({ api, organisationId }: { api: ProductsApi; organisationId: string }) {
  const [catalogue, setCatalogue] = useState<LoadResult<Product[]>>({ status: 'loading' })
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState<{ id?: string; input: ProductInput }>()
  const [removing, setRemoving] = useState<Product>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [requests, setRequests] = useState<AbortController>()
  const { rows, controls } = useListPagination(catalogue.status === 'ready' ? catalogue.data : undefined)

  useEffect(() => {
    const request = new AbortController()
    setRequests(request)
    void api.list(organisationId, request.signal).then(({ products }) => {
      if (!request.signal.aborted) setCatalogue({ status: 'ready', data: products })
    }).catch((failure: unknown) => {
      if (!request.signal.aborted) setCatalogue({ status: 'failed', error: failure })
    })
    // The organisation route unmounts this page on switch, cancelling its pending requests.
    return () => request.abort()
  }, [api, organisationId, revision])

  function reload() {
    setForm(undefined)
    setRemoving(undefined)
    setError('')
    setNotice('')
    setCatalogue({ status: 'loading' })
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
        setCatalogue({ status: 'failed', error: failure })
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
      setCatalogue((current) => current.status === 'ready' ? {
        status: 'ready',
        data: [...current.data.filter(({ id }) => id !== saved.id), saved].sort((a, b) => a.sku.localeCompare(b.sku)),
      } : current)
      setForm(undefined)
      setNotice(form.id ? 'Product updated.' : 'Product created.')
    })
  }

  function remove() {
    if (!removing) return
    void mutate(async (signal) => {
      await api.remove(organisationId, removing.id, signal)
      if (signal.aborted) return
      setCatalogue((current) => current.status === 'ready'
        ? { status: 'ready', data: current.data.filter(({ id }) => id !== removing.id) }
        : current)
      setRemoving(undefined)
      setNotice('Product deleted.')
    })
  }

  return (
    <Paper withBorder p="lg">
      <Stack>
        <Title order={1} size="h2">Products</Title>
        {catalogue.status === 'loading' && <Loading>Loading products…</Loading>}
        {catalogue.status === 'failed' && (
          <Alert role="alert" color="red" title={accessDenied(catalogue.error) ? 'Access denied' : 'Could not load products'}>
            {accessDenied(catalogue.error) ? 'Only organisation administrators can manage products.'
              : <Button variant="light" onClick={reload}>Reload catalogue</Button>}
          </Alert>
        )}
        {catalogue.status === 'ready' && <>
          {notice && <Text role="status">{notice}</Text>}
          {error && <Alert role="alert" color="red">{error}</Alert>}
          {!form && !removing && <Group>
            <Button onClick={() => { setNotice(''); setForm({ input: emptyProduct }) }}>Add product</Button>
          </Group>}
          {form && (
            // The inputs read React state. Each change copies the form and replaces one field.
            <form onSubmit={save}>
              <Stack>
                <Title order={2} size="h3">{form.id ? 'Edit product' : 'Add product'}</Title>
                <TextInput label="SKU" value={form.input.sku} required disabled={busy}
                  onChange={(event) => setForm({ ...form, input: { ...form.input, sku: event.currentTarget.value } })} />
                <TextInput label="Name" value={form.input.name} required disabled={busy}
                  onChange={(event) => setForm({ ...form, input: { ...form.input, name: event.currentTarget.value } })} />
                <TextInput label="Unit price" value={form.input.unitPrice} required disabled={busy} inputMode="decimal"
                  onChange={(event) => setForm({ ...form, input: { ...form.input, unitPrice: event.currentTarget.value } })} />
                <Group>
                  <Button type="submit" loading={busy}>Save product</Button>
                  <Button variant="default" disabled={busy} onClick={() => { setForm(undefined); setError('') }}>Cancel</Button>
                </Group>
              </Stack>
            </form>
          )}
          {removing && (
            <Alert color="red" title={`Delete ${removing.name}?`}>
              <Group>
                <Button color="red" loading={busy} onClick={remove}>Delete product</Button>
                <Button variant="default" disabled={busy} onClick={() => { setRemoving(undefined); setError('') }}>Cancel</Button>
              </Group>
            </Alert>
          )}
          {catalogue.data.length === 0 ? <Text c="dimmed">No products yet.</Text> : (
            <Table.ScrollContainer minWidth={520}>
              <Table>
                <Table.Thead><Table.Tr>
                  <Table.Th>SKU</Table.Th><Table.Th>Name</Table.Th><Table.Th>Unit price</Table.Th><Table.Th>Actions</Table.Th>
                </Table.Tr></Table.Thead>
                <Table.Tbody>
                  {/* The stable product ID lets React match rows after edits or deletions. */}
                  {rows.map((product) => (
                    <Table.Tr key={product.id}>
                      <Table.Td>{product.sku}</Table.Td>
                      <Table.Td>{product.name}</Table.Td>
                      <Table.Td>{product.unitPrice}</Table.Td>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap">
                          <Button size="compact-sm" variant="subtle" aria-label={`Edit ${product.sku}`} disabled={Boolean(form || removing)}
                            onClick={() => { setNotice(''); setForm({ id: product.id, input: product }) }}>Edit</Button>
                          <Button size="compact-sm" variant="subtle" color="red" aria-label={`Delete ${product.sku}`} disabled={Boolean(form || removing)}
                            onClick={() => { setNotice(''); setRemoving(product) }}>Delete</Button>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
          <ListPagination {...controls} label="Products pages" />
        </>}
      </Stack>
    </Paper>
  )
}
