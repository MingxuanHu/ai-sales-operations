export type Role = 'admin' | 'salesperson' | 'manager'
export type Membership = { organisationId: string; name: string; role: Role }
export type Profile = { userId: string; memberships: Membership[] }
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
      // The two issue conflicts share a status. Read the server detail so the form can explain which occurred.
      const body = response.status === 409 ? await response.json().catch(() => undefined) : undefined
      throw new ApiError(response.status, typeof body?.message === 'string' ? body.message : undefined)
    }
    // Successful revocation sends a 204 with no JSON body.
    return response.status === 204 ? undefined as T : response.json() as Promise<T>
  }

  return {
    profile: (signal: AbortSignal) => request<Profile>('/me', { signal }),
    overview: (id: string, signal: AbortSignal) =>
      request<Membership>(`/organisations/${encodeURIComponent(id)}`, { signal }),
    invitations: (signal: AbortSignal) => request<{ invitations: Invitation[] }>('/invitations', { signal }),
    issueInvitation: (id: string, recipientUserId: string, role: Role, signal: AbortSignal) =>
      request<InvitationReceipt>(`/organisations/${encodeURIComponent(id)}/invitations`, {
        method: 'POST', body: JSON.stringify({ recipientUserId, role }), signal,
      }),
    revokeInvitation: (id: string, invitationId: string, signal: AbortSignal) =>
      request<void>(`/organisations/${encodeURIComponent(id)}/invitations/${encodeURIComponent(invitationId)}`, {
        method: 'DELETE', signal,
      }),
    create: (name: string, requestId: string) =>
      request<{ organisationId: string }>('/organisations', {
        method: 'POST', body: JSON.stringify({ name, requestId }),
      }),
    accept: (id: string) =>
      request<{ organisationId: string }>(`/invitations/${encodeURIComponent(id)}/accept`, { method: 'POST' }),
  }
}

export type OrganisationsApi = ReturnType<typeof createOrganisationsApi>
