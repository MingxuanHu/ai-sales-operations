export type OrderStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled'
export type OrderAction = 'approve' | 'reject' | 'fulfil'

export type OrderSummary = {
  id: string
  submittedByUserId: string
  customerName: string
  status: OrderStatus
  createdAt: string
  discountPercent: string
  approvalThresholdPercent: string
  subtotal: string
  total: string
}

export type Order = OrderSummary & {
  lines: { productId: string; sku: string; name: string; unitPrice: string; quantity: number }[]
  history: { kind: string; actorUserId: string | null; fromStatus: OrderStatus | null; toStatus: OrderStatus; createdAt: string }[]
}

export type OrderSelectors = {
  customers: { id: string; name: string }[]
  products: { id: string; sku: string; name: string; unitPrice: string }[]
}

export type OrderInput = {
  requestId: string
  customerId: string
  discountPercent: string
  lines: { productId: string; quantity: number }[]
}

export function createOrdersApi(request: <T>(path: string, options?: RequestInit) => Promise<T>) {
  // These paths use the shared authenticated request helper, including session cancellation.
  const path = (organisationId: string) => `/organisations/${encodeURIComponent(organisationId)}/orders`
  const itemPath = (organisationId: string, id: string) => `${path(organisationId)}/${encodeURIComponent(id)}`
  return {
    list: (organisationId: string, pending: boolean, signal: AbortSignal) =>
      request<{ orders: OrderSummary[] }>(path(organisationId) + (pending ? '?status=pending' : ''), { signal }),
    selectors: (organisationId: string, signal: AbortSignal) =>
      request<OrderSelectors>(path(organisationId) + '/selectors', { signal }),
    detail: (organisationId: string, id: string, signal: AbortSignal) =>
      request<Order>(itemPath(organisationId, id), { signal }),
    submit: (organisationId: string, input: OrderInput, signal: AbortSignal) =>
      request<Order>(path(organisationId), { method: 'POST', body: JSON.stringify(input), signal }),
    transition: (organisationId: string, id: string, action: OrderAction, signal: AbortSignal) =>
      request<Order>(itemPath(organisationId, id) + '/' + action, { method: 'POST', signal }),
  }
}

export type OrdersApi = ReturnType<typeof createOrdersApi>

export const statusLabels = {
  pending: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  fulfilled: 'Fulfilled',
}
