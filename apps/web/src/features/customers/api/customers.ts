export type CustomerInput = { name: string }
export type Customer = CustomerInput & { id: string }

export function createCustomersApi(request: <T>(path: string, options?: RequestInit) => Promise<T>) {
  // Each encoded ID stays inside its own URL segment.
  const path = (organisationId: string) => `/organisations/${encodeURIComponent(organisationId)}/customers`
  const itemPath = (organisationId: string, id: string) => `${path(organisationId)}/${encodeURIComponent(id)}`
  return {
    list: (organisationId: string, signal: AbortSignal) =>
      request<{ customers: Customer[] }>(path(organisationId), { signal }),
    save: (organisationId: string, id: string | undefined, { name }: CustomerInput, signal: AbortSignal) =>
      request<Customer>(id ? itemPath(organisationId, id) : path(organisationId), {
        method: id ? 'PUT' : 'POST', body: JSON.stringify({ name }), signal,
      }),
    remove: (organisationId: string, id: string, signal: AbortSignal) =>
      request<void>(itemPath(organisationId, id), { method: 'DELETE', signal }),
  }
}

export type CustomersApi = ReturnType<typeof createCustomersApi>
