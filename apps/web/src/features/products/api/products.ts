export type ProductInput = { sku: string; name: string; unitPrice: string }
export type Product = ProductInput & { id: string }

export function createProductsApi(request: <T>(path: string, options?: RequestInit) => Promise<T>) {
  // Each encoded ID stays inside its own URL segment.
  const path = (organisationId: string) => `/organisations/${encodeURIComponent(organisationId)}/products`
  const itemPath = (organisationId: string, id: string) => `${path(organisationId)}/${encodeURIComponent(id)}`
  return {
    list: (organisationId: string, signal: AbortSignal) =>
      request<{ products: Product[] }>(path(organisationId), { signal }),
    save: (organisationId: string, id: string | undefined, { sku, name, unitPrice }: ProductInput, signal: AbortSignal) =>
      request<Product>(id ? itemPath(organisationId, id) : path(organisationId), {
        method: id ? 'PUT' : 'POST', body: JSON.stringify({ sku, name, unitPrice }), signal,
      }),
    remove: (organisationId: string, id: string, signal: AbortSignal) =>
      request<void>(itemPath(organisationId, id), { method: 'DELETE', signal }),
  }
}

export type ProductsApi = ReturnType<typeof createProductsApi>
