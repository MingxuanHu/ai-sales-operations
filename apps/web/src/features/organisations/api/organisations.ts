import { createSalesReportApi } from '../../dashboard/api/salesReport'
import { createCustomersApi } from '../../customers/api/customers'
import { createOrdersApi } from '../../orders/api/orders'
import { createProductsApi } from '../../products/api/products'

export type Role = 'admin' | 'salesperson' | 'manager'
export type Membership = { organisationId: string; name: string; role: Role; isDemo?: boolean }
export type Profile = { userId: string; memberships: Membership[] }
export type OrganisationSettings = { orderApprovalThresholdBasisPoints: number }
export type InvitationReceipt = { invitationId: string; role: Role; expiresAt: string }
export type Invitation = Membership & InvitationReceipt

export class ApiError extends Error {
  constructor(readonly status: number, readonly detail?: string) {
    super('The API request failed.')
  }
}

export function createOrganisationsApi(accessToken: () => Promise<string>, sessionSignal: AbortSignal, onUnauthorized: () => void) {
  async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
    // Either leaving the selected view or ending the session cancels its requests.
    const signal = options.signal ? AbortSignal.any([options.signal, sessionSignal]) : sessionSignal
    signal.throwIfAborted()
    const token = await accessToken()
    signal.throwIfAborted()
    const headers = new Headers({ Authorization: `Bearer ${token}` })
    if (options.body) headers.set('Content-Type', 'application/json')

    const response = await fetch(`/api${path}`, { ...options, signal, headers, cache: 'no-store' })
    signal.throwIfAborted()
    if (response.status === 401) onUnauthorized()
    if (!response.ok) {
      // Validation and conflict responses can explain what the user needs to correct.
      const body = [400, 409].includes(response.status) ? await response.json().catch(() => undefined) : undefined
      throw new ApiError(response.status, typeof body?.message === 'string' ? body.message : undefined)
    }
    // Successful revocation sends a 204 with no JSON body.
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }

  return {
    orders: createOrdersApi(request),
    salesReport: createSalesReportApi(request),
    products: createProductsApi(request),
    customers: createCustomersApi(request),
    profile: (signal: AbortSignal) => request<Profile>('/me', { signal }),
    overview: (id: string, signal: AbortSignal) =>
      request<Membership>(`/organisations/${encodeURIComponent(id)}`, { signal }),
    settings: (id: string, signal: AbortSignal) =>
      request<OrganisationSettings>(`/organisations/${encodeURIComponent(id)}/settings`, { signal }),
    updateThreshold: (id: string, orderApprovalThresholdBasisPoints: number, signal: AbortSignal) =>
      request<OrganisationSettings>(`/organisations/${encodeURIComponent(id)}/settings`, {
        method: 'PATCH', body: JSON.stringify({ orderApprovalThresholdBasisPoints }), signal,
      }),
    deleteDemo: (id: string, confirmationName: string, signal: AbortSignal) =>
      request<void>(`/organisations/${encodeURIComponent(id)}`, {
        method: 'DELETE', body: JSON.stringify({ confirmationName }), signal,
      }),
    invitations: (signal: AbortSignal) => request<{ invitations: Invitation[] }>('/invitations', { signal }),
    issueInvitation: (id: string, recipientUserId: string, role: Role, signal: AbortSignal) =>
      request<InvitationReceipt>(`/organisations/${encodeURIComponent(id)}/invitations`, {
        method: 'POST', body: JSON.stringify({ recipientUserId, role }), signal,
      }),
    revokeInvitation: (id: string, invitationId: string, signal: AbortSignal) =>
      request<void>(`/organisations/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`, {
        method: 'DELETE', signal,
      }),
    createDemo: (requestId: string, signal: AbortSignal) =>
      request<Membership>('/organisations/demo', {
        method: 'POST', body: JSON.stringify({ requestId }), signal,
      }),
    create: (name: string, requestId: string, signal: AbortSignal) =>
      request<{ organisationId: string }>('/organisations', {
        method: 'POST', body: JSON.stringify({ name, requestId }), signal,
      }),
    accept: (id: string, signal: AbortSignal) =>
      request<{ organisationId: string }>(`/invitations/${encodeURIComponent(id)}/accept`, { method: 'POST', signal }),
  }
}

export type OrganisationsApi = ReturnType<typeof createOrganisationsApi>
