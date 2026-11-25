// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CognitoCallbackError, type CognitoSession } from '../features/auth/api/cognito-session'
import { App } from './App'

const first = { organisationId: 'first', name: 'Cedar Wholesale', role: 'salesperson' }
const second = { organisationId: 'second', name: 'River Wholesale', role: 'manager' }

function mockSession(returnTo = '/'): CognitoSession {
  return {
    beginSignIn: vi.fn(async () => {}),
    completeSignIn: vi.fn(async () => returnTo),
    accessToken: vi.fn(async () => 'fixture-access-token'),
    hasSession: vi.fn(() => true),
    clear: vi.fn(),
    signOut: vi.fn(async () => { throw new Error('Navigation unavailable in this test') }),
  }
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })))
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  Element.prototype.scrollIntoView = vi.fn()
  window.history.replaceState(null, '', '/auth/callback?code=fixture&state=fixture')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// Render the real components with a fake session so these tests can exercise the UI without Cognito.
describe('protected React shell', () => {
  it('starts Managed Login from the signed-out shell without requesting protected data', () => {
    window.history.replaceState(null, '', '/')
    const session = mockSession()
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<App session={session} />)
    expect(screen.getByText('Open Managed Login to sign in, register a new account, or continue with Google.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue to sign in' }))
    expect(session.beginSignIn).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('cleans up a rejected callback and returns to sign-in', async () => {
    const session = mockSession()
    vi.mocked(session.completeSignIn).mockRejectedValueOnce(new CognitoCallbackError('attempt'))
    render(<App session={session} />)
    expect(await screen.findByText(/could not be matched or has expired/)).toBeTruthy()
    expect(window.location.search).toBe('')
  })

  it('accepts an invitation from the no-membership screen and reloads membership', async () => {
    let accepted = false
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: accepted ? [first] : [] })
      if (url === '/api/invitations') {
        return Response.json({ invitations: accepted ? [] : [{ ...first, invitationId: 'invite', expiresAt: '2026-11-30' }] })
      }
      if (url === '/api/invitations/invite/accept') {
        accepted = true
        return Response.json({ organisationId: first.organisationId })
      }
      if (url === '/api/organisations/first') return Response.json(first)
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession()} />)
    expect(await screen.findByRole('heading', { name: 'Create organisation' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Messages (1 pending invitation)' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation to Cedar Wholesale' }))
    expect(await screen.findByRole('heading', { name: first.name })).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Messages' })).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/invitations/invite/accept', expect.objectContaining({ method: 'POST' }))
  })

  it('retains the creation request ID when retrying the same organisation name', async () => {
    let created = false
    const requestIds: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: created ? [first] : [] })
      if (url === '/api/invitations') return Response.json({ invitations: [] })
      if (url === '/api/organisations') {
        requestIds.push(JSON.parse(String(options.body)).requestId)
        if (requestIds.length === 1) return new Response(null, { status: 503 })
        created = true
        return Response.json({ organisationId: first.organisationId })
      }
      if (url === '/api/organisations/first') return Response.json(first)
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession('/onboarding')} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Organisation name' }), { target: { value: first.name } })
    fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
    await screen.findByText('Your request could not be completed. Please try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
    expect(await screen.findByRole('heading', { name: first.name })).toBeTruthy()
    expect(requestIds).toEqual([expect.any(String), requestIds[0]])
  })

  it('automatically opens the first organisation when the user has only demos', async () => {
    const demos = [{ ...second, isDemo: true }, { ...first, isDemo: true }]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: demos })
      if (url === '/api/organisations/second') return Response.json(demos[0])
      if (url === '/api/invitations') return Response.json({ invitations: [] })
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession()} />)
    await screen.findByRole('heading', { name: second.name })
    expect(screen.getByRole('combobox', { name: 'Organisation' })).toHaveProperty('value', second.name)
    expect(window.location.pathname).toBe('/organisations/second')
  })

  it('shows Overview only after choosing an organisation and groups it with organisation links', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [first, second] })
      if (url === '/api/organisations/first') return Response.json(first)
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession('/onboarding')} />)
    await screen.findByRole('heading', { name: 'Create organisation' })
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull()
    const picker = screen.getByRole('combobox', { name: 'Organisation' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.click(await screen.findByText(first.name))
    const navigation = await screen.findByRole('navigation', { name: 'Selected organisation' })
    expect(within(navigation).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page')
    expect(within(navigation).getByRole('link', { name: 'Orders' })).toBeTruthy()
    expect(within(navigation).queryByRole('link', { name: 'Invitations' })).toBeNull()
  })

  it('automatically opens the first organisation in the picker after sign-in', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [second, first] })
      if (url === '/api/organisations/second') return Response.json(second)
      if (url === '/api/invitations') return Response.json({ invitations: [] })
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession()} />)
    await screen.findByRole('heading', { name: second.name })
    expect(screen.getByRole('combobox', { name: 'Organisation' })).toHaveProperty('value', second.name)
    expect(window.location.pathname).toBe('/organisations/second')
  })

  it('retries demo creation and selects each newly created demo', async () => {
    const demoId = '20b6acc4-c4e8-41fd-901d-4a601880ded2'
    const demos = [
      { organisationId: demoId, name: `Demo · Fern & Finch Supply · ${demoId}`, role: 'admin' },
      { organisationId: 'demo-2', name: 'Fern & Finch Demo 2', role: 'admin' },
    ]
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [first] })
      if (url === '/api/organisations/first') return Response.json(first)
      if (url === '/api/organisations/' + demoId) return Response.json(demos[0])
      if (url === '/api/organisations/demo-2') return Response.json(demos[1])
      if (url === '/api/organisations/demo') {
        requests.push(JSON.parse(String(options.body)).requestId)
        if (requests.length === 1) return new Response(null, { status: 503 })
        return Response.json(demos[requests.length - 2], { status: 201 })
      }
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession('/organisations/first')} />)
    await screen.findByRole('heading', { name: first.name })
    expect(screen.queryByRole('button', { name: 'Create demo organisation' })).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Create organisation' }))
    const create = await screen.findByRole('button', { name: 'Create demo organisation' })
    fireEvent.click(create)
    await screen.findByRole('dialog', { name: 'Could not create the demo' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(create)
    await screen.findByRole('heading', { name: demos[0].name })
    const picker = screen.getByRole('combobox', { name: 'Organisation' })
    expect(picker).toHaveProperty('value', 'Demo · 20b6acc4')
    expect(picker.getAttribute('title')).toBe(demos[0].name)
    fireEvent.click(screen.getByRole('link', { name: 'Create organisation' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Create demo organisation' }))
    await screen.findByRole('heading', { name: demos[1].name })
    expect(requests).toEqual([expect.any(String), requests[0], expect.any(String)])
    expect(requests[2]).not.toBe(requests[0])
    expect(window.location.pathname).toBe('/organisations/demo-2')
    expect(screen.getByRole('combobox', { name: 'Organisation' })).toHaveProperty('value', demos[1].name)
    expect(screen.queryByText(/Demo ready/)).toBeNull()
  })

  it('requires the exact name to delete a demo and removes it from the picker', async () => {
    const demo = { organisationId: 'demo', name: 'Demo · Fern & Finch', role: 'admin', isDemo: true }
    const regular = { ...first, role: 'admin', isDemo: false }
    let deleted = false
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: deleted ? [regular] : [demo, regular] })
      if (url === '/api/organisations/demo/settings') return Response.json({ orderApprovalThresholdBasisPoints: 1000 })
      if (url === '/api/organisations/first') return Response.json(regular)
      if (url === '/api/organisations/demo' && options.method === 'DELETE') {
        expect(JSON.parse(String(options.body))).toEqual({ confirmationName: demo.name })
        deleted = true
        return new Response(null, { status: 204 })
      }
      if (url === '/api/organisations/demo') return Response.json(demo)
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/demo')} />)
    await screen.findByRole('heading', { name: demo.name })
    expect(screen.queryByRole('button', { name: 'Delete demo organisation' })).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete demo organisation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete demo organisation' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete permanently' })
    const name = within(dialog).getByRole('textbox', { name: 'Organisation name' })
    fireEvent.change(name, { target: { value: demo.name + ' ' } })
    expect(confirm).toHaveProperty('disabled', true)
    fireEvent.change(name, { target: { value: demo.name } })
    expect(confirm).toHaveProperty('disabled', false)
    fireEvent.click(confirm)
    expect(await screen.findByRole('heading', { name: regular.name })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete demo organisation' })).toBeNull()
    expect(screen.getByRole('combobox', { name: 'Organisation' })).toHaveProperty('value', regular.name)
  })

  it('loads and saves the organisation threshold from Settings', async () => {
    const admin = { ...first, role: 'admin', isDemo: false }
    const save = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [admin] })
      if (url === '/api/organisations/first') return Response.json(admin)
      if (url === '/api/organisations/first/settings') {
        if (options.method === 'PATCH') {
          const body = JSON.parse(String(options.body))
          save(body)
          return Response.json(body)
        }
        return Response.json({ orderApprovalThresholdBasisPoints: 1000 })
      }
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession('/organisations/first')} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Settings' }))
    const input = await screen.findByRole('textbox', { name: 'Discount approval threshold (%)' })
    expect(input).toHaveProperty('value', '10.00')
    expect(screen.queryByRole('button', { name: 'Delete demo organisation' })).toBeNull()
    fireEvent.change(input, { target: { value: '12.35' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save threshold' }))
    await screen.findByText('Threshold saved.')
    expect(save).toHaveBeenCalledWith({ orderApprovalThresholdBasisPoints: 1235 })
  })

  it('aborts a pending acceptance when closing Messages and ignores its late response', async () => {
    let pendingSignal: AbortSignal | null = null
    let finishAcceptance: (response: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [] })
      if (url === '/api/invitations') {
        return Response.json({ invitations: [{ ...first, invitationId: 'invite', expiresAt: '2026-11-30' }] })
      }
      if (url === '/api/invitations/invite/accept') {
        pendingSignal = options.signal ?? null
        return new Promise<Response>((resolve) => { finishAcceptance = resolve })
      }
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession()} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Messages/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation to Cedar Wholesale' }))
    await waitFor(() => expect(pendingSignal).not.toBeNull())
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Messages' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(pendingSignal).toHaveProperty('aborted', true)
    await act(async () => finishAcceptance(Response.json({ organisationId: first.organisationId })))
    expect(window.location.pathname).toBe('/onboarding')
  })

  it('switches tenant requests, ignores a late response and clears the shell on sign-out', async () => {
    let previousSignal: AbortSignal | null = null
    let finishPrevious: (value: Response) => void = () => {}
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      expect(new Headers(options.headers).get('Authorization')).toBe('Bearer fixture-access-token')
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [first, second] })
      if (url === '/api/organisations/first') {
        previousSignal = options.signal ?? null
        return new Promise<Response>((resolve) => { finishPrevious = resolve })
      }
      if (url === '/api/organisations/second') return Response.json(second)
      if (url === '/api/invitations') return Response.json({ invitations: [] })
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    const session = mockSession('/organisations/first')
    render(<App session={session} />)
    await waitFor(() => expect(previousSignal).not.toBeNull())
    const picker = screen.getByRole('combobox', { name: 'Organisation' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'Enter', code: 'Enter' })
    expect(await screen.findByRole('heading', { name: second.name })).toBeTruthy()
    expect(screen.getByText('manager')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()
    expect(window.location.pathname).toBe('/organisations/second')
    expect(previousSignal).toHaveProperty('aborted', true)
    // act lets React process any updates from the late response before we check the screen.
    await act(async () => finishPrevious(Response.json(first)))
    expect(screen.queryByRole('heading', { name: first.name })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Messages' }))
    await screen.findByRole('heading', { name: 'Received invitations' })
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Messages' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(session.signOut).toHaveBeenCalledOnce()
    expect(screen.queryByText('manager')).toBeNull()
  })

  it('recovers the same invitation, explains a role conflict and retries revocation', async () => {
    const admin = { ...first, role: 'admin' }
    const recipient = 'abcc5d8a-ead7-4f6a-a7ce-d149103edd80'
    const path = '/api/organisations/first/invitations'
    let issued = false
    let revokeAttempts = 0
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [admin] })
      if (url === '/api/organisations/first') return Response.json(admin)
      if (url === '/api/invitations') return Response.json({ invitations: [] })
      if (url === path) {
        expect(options.method).toBe('POST')
        const body = JSON.parse(String(options.body))
        expect(body.recipientUserId).toBe(recipient)
        if (body.role === 'admin') {
          return Response.json({ message: 'A pending invitation has a different role' }, { status: 409 })
        }
        expect(body.role).toBe('manager')
        const status = issued ? 200 : 201
        issued = true
        return Response.json({ invitationId: 'invite', expiresAt: '2026-11-30T00:00:00Z', role: 'manager' }, { status })
      }
      if (url === path + '/invite') {
        expect(options.method).toBe('DELETE')
        return new Response(null, { status: ++revokeAttempts === 1 ? 503 : 204 })
      }
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/first')} />)
    await screen.findByRole('heading', { name: first.name })
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: 'Settings' }))
    expect(await screen.findByRole('heading', { name: 'Invite staff' })).toBeTruthy()
    fireEvent.change(await screen.findByRole('textbox', { name: 'Recipient user ID' }), { target: { value: ' ' + recipient + ' ' } })
    const picker = screen.getByRole('combobox', { name: 'Role' })
    const send = screen.getByRole('button', { name: 'Send invitation' })
    fireEvent.change(picker, { target: { value: 'manager' } })
    fireEvent.click(send)
    await screen.findByText('Invitation ready')
    expect(screen.getByText(/^Expires /)).toBeTruthy()
    fireEvent.change(picker, { target: { value: 'admin' } })
    fireEvent.click(send)
    await screen.findByText(/Submit again with the original role/)
    fireEvent.change(picker, { target: { value: 'manager' } })
    fireEvent.click(send)
    const revoke = screen.getByRole('button', { name: 'Revoke invitation' })
    await waitFor(() => expect(revoke).toHaveProperty('disabled', false))
    expect(fetch.mock.calls.filter(([url]) => url === path)).toHaveLength(3)
    fireEvent.click(revoke)
    await screen.findByText('Your request could not be completed. Please try again.')
    fireEvent.click(revoke)
    await screen.findByText('Invitation revoked.')
    expect(screen.queryByRole('button', { name: 'Revoke invitation' })).toBeNull()
  })

  it('clears invitation state on switch and ignores a late issuance response', async () => {
    const organisations = [first, second].map((organisation) => ({ ...organisation, role: 'admin' }))
    let previousSignal: AbortSignal | null = null
    let finishPrevious: (value: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: organisations })
      if (url === '/api/invitations') return Response.json({ invitations: [] })
      if (url === '/api/organisations/first/invitations') {
        previousSignal = options.signal ?? null
        return new Promise<Response>((resolve) => { finishPrevious = resolve })
      }
      const organisation = organisations.find(({ organisationId }) => url === '/api/organisations/' + organisationId)
      if (organisation) return Response.json(organisation)
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession('/organisations/first/settings')} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Recipient user ID' }), { target: { value: 'abcc5d8a-ead7-4f6a-a7ce-d149103edd80' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'salesperson' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(previousSignal).not.toBeNull())
    const picker = screen.getByRole('combobox', { name: 'Organisation' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'Enter', code: 'Enter' })
    await screen.findByRole('heading', { name: 'Invite staff' })
    expect(window.location.pathname).toBe('/organisations/second/settings')
    expect(previousSignal).toHaveProperty('aborted', true)
    await act(async () => finishPrevious(Response.json({ invitationId: 'stale', role: 'salesperson', expiresAt: '2026-11-30' })))
    expect(screen.getByRole('textbox', { name: 'Recipient user ID' })).toHaveProperty('value', '')
    expect(screen.queryByText('Invitation ready')).toBeNull()
  })

  it('shows access denied when the API rejects the selected tenant', async () => {
    const fetch = vi.fn(async (url: string) => url === '/api/me'
      ? Response.json({ userId: 'synthetic-user', memberships: [first] })
      : new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/foreign/settings')} />)
    expect(await screen.findByText('Access denied')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: first.name })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()
  })

  it('clears local auth when the API rejects the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    const session = mockSession()
    render(<App session={session} />)
    expect(await screen.findByText('Your session has ended. Sign in to continue.')).toBeTruthy()
    expect(session.clear).toHaveBeenCalledOnce()
  })
})

describe('product catalogue', () => {
  const admin = { ...first, role: 'admin' }
  const cataloguePath = '/api/organisations/first/products'

  it('creates, edits and deletes products and keeps the form open on server errors', async () => {
    const product = { id: 'box', sku: 'BOX-01', name: 'Shipping box', unitPrice: '12.30' }
    let attempts = 0
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [admin] })
      if (url === '/api/organisations/first') return Response.json(admin)
      if (url === cataloguePath && options.method === 'POST') {
        expect(JSON.parse(String(options.body))).toEqual({ sku: 'BOX-01', name: 'Shipping box', unitPrice: '12.30' })
        attempts++
        if (attempts === 1) return Response.json({ message: 'This SKU already exists.' }, { status: 409 })
        return Response.json(product, { status: 201 })
      }
      if (url === cataloguePath) return Response.json({ products: [] })
      if (url === cataloguePath + '/box' && options.method === 'PUT') {
        return Response.json({ ...product, name: 'Large box' })
      }
      if (url === cataloguePath + '/box' && options.method === 'DELETE') return new Response(null, { status: 204 })
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession()} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Products' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add product' }))
    for (const [label, value] of [['SKU', product.sku], ['Name', product.name], ['Unit price', product.unitPrice]]) {
      fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await screen.findByText('This SKU already exists.')
    expect(screen.getByDisplayValue('Shipping box')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await screen.findByText('Product created.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit BOX-01' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Large box' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save product' }))
    await screen.findByText('Large box')
    expect(fetch).toHaveBeenCalledWith(cataloguePath + '/box', expect.objectContaining({
      method: 'PUT', body: expect.stringContaining('Large box'),
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete BOX-01' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Large box')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalledWith(cataloguePath + '/box', expect.objectContaining({ method: 'DELETE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete BOX-01' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete product' }))
    await screen.findByText('Product deleted.')
    expect(screen.getByText('No products yet.')).toBeTruthy()
  })

  it('gates direct routes with the current organisation role before requesting products', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [admin, second] })
      if (url === '/api/organisations/second') return Response.json(second)
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/second/products')} />)
    expect(await screen.findByText('Only organisation administrators can manage products.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Products' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull()
    expect(fetch.mock.calls.map(([url]) => url).filter((url) => url !== '/api/invitations')).toEqual(['/api/me', '/api/organisations/second'])
  })
})

describe('customer directory', () => {
  const admin = { ...first, role: 'admin' }
  const directoryPath = '/api/organisations/first/customers'

  it('creates, edits and deletes customers and keeps the form open on server errors', async () => {
    const customer = { id: 'acme', name: 'Acme Wholesale' }
    let attempts = 0
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [admin] })
      if (url === '/api/organisations/first') return Response.json(admin)
      if (url === directoryPath && options.method === 'POST') {
        expect(JSON.parse(String(options.body))).toEqual({ name: 'Acme Wholesale' })
        attempts++
        if (attempts === 1) return Response.json({ message: 'Name must contain 1 to 120 characters.' }, { status: 400 })
        return Response.json(customer, { status: 201 })
      }
      if (url === directoryPath) return Response.json({ customers: [] })
      if (url === directoryPath + '/acme' && options.method === 'PUT') {
        return Response.json({ ...customer, name: 'Acme Distribution' })
      }
      if (url === directoryPath + '/acme' && options.method === 'DELETE') return new Response(null, { status: 204 })
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession()} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Customers' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Add customer' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: customer.name } })
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }))
    await screen.findByText('Name must contain 1 to 120 characters.')
    expect(screen.getByDisplayValue('Acme Wholesale')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }))
    await screen.findByText('Customer created.')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Acme Wholesale' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Acme Distribution' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save customer' }))
    await screen.findByText('Acme Distribution')
    expect(fetch).toHaveBeenCalledWith(directoryPath + '/acme', expect.objectContaining({
      method: 'PUT', body: expect.stringContaining('Acme Distribution'),
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Acme Distribution' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText('Acme Distribution')).toBeTruthy()
    expect(fetch).not.toHaveBeenCalledWith(directoryPath + '/acme', expect.objectContaining({ method: 'DELETE' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete Acme Distribution' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete customer' }))
    await screen.findByText('Customer deleted.')
    expect(screen.getByText('No customers yet.')).toBeTruthy()
  })

  it('gates direct routes with the current organisation role before requesting customers', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [admin, second] })
      if (url === '/api/organisations/second') return Response.json(second)
      throw new Error('Unexpected API request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/second/customers')} />)
    expect(await screen.findByText('Only organisation administrators can manage customers.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Customers' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add customer' })).toBeNull()
    expect(fetch.mock.calls.map(([url]) => url).filter((url) => url !== '/api/invitations')).toEqual(['/api/me', '/api/organisations/second'])
  })
})

describe('order workflows', () => {
  const ordersPath = (id: string) => '/api/organisations/' + id + '/orders'
  const createdAt = '2026-11-25T00:00:00Z'
  const order = {
    id: 'order-1', submittedByUserId: 'synthetic-user', customerName: 'Fixture customer',
    status: 'approved', createdAt, discountPercent: '10.00', approvalThresholdPercent: '10.00',
    subtotal: '20.00', total: '18.00',
    lines: [{ productId: 'product-1', sku: 'BOX', name: 'Fixture box', unitPrice: '10.00', quantity: 2 }],
    history: [{ kind: 'automatically_approved', actorUserId: null, fromStatus: null, toStatus: 'approved', createdAt }],
  }

  function workspaceResponse(url: string) {
    if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [first, second] })
    const membership = [first, second].find(({ organisationId }) => url === '/api/organisations/' + organisationId)
    if (membership) return Response.json(membership)
  }

  function selectors() {
    return Response.json({
      customers: [{ id: 'customer-1', name: order.customerName }],
      products: [{ id: 'product-1', sku: 'BOX', name: 'Fixture box', unitPrice: '10.00' }],
    })
  }

  function fillOrder() {
    fireEvent.change(screen.getByLabelText(/^Customer/), { target: { value: 'customer-1' } })
    fireEvent.change(screen.getByLabelText(/^Product 1/), { target: { value: 'product-1' } })
    fireEvent.change(screen.getByLabelText(/^Quantity 1/), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/^Discount/), { target: { value: '10' } })
  }

  it('shows the salesperson form and enables it when missing setup is refreshed', async () => {
    let ready = false
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const workspace = workspaceResponse(url)
      if (workspace) return workspace
      if (url === '/api/invitations') return Response.json({ invitations: [] })
      if (url === ordersPath('first')) return Response.json({ orders: [] })
      if (url === ordersPath('first') + '/selectors') {
        return ready ? selectors() : Response.json({
          customers: [{ id: 'customer-1', name: order.customerName }], products: [],
        })
      }
      throw new Error('Unexpected API request')
    }))
    render(<App session={mockSession('/organisations/first/orders')} />)
    expect(await screen.findByText('Ask an administrator to add a product to this organisation.')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'How to create an order' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Submit order' }).closest('fieldset')).toHaveProperty('disabled', true)
    ready = true
    fireEvent.click(screen.getByRole('button', { name: 'Refresh customers and products' }))
    const submit = await screen.findByRole('button', { name: 'Submit order' })
    expect(submit.closest('fieldset')).toHaveProperty('disabled', false)
    expect(await screen.findByRole('option', { name: /Fixture box/ })).toBeTruthy()
  })

  it('explains who can submit and approve orders in an empty regular organisation', async () => {
    const regular = { ...first, role: 'admin', isDemo: false }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [regular] })
      if (url === '/api/organisations/first') return Response.json(regular)
      if (url === ordersPath('first')) return Response.json({ orders: [] })
      throw new Error('Unexpected request')
    }))
    render(<App session={mockSession('/organisations/first/orders')} />)
    expect(await screen.findByRole('heading', { name: 'How to create an order' })).toBeTruthy()
    expect(screen.getByText(/choose a customer, add products and quantities/)).toBeTruthy()
    expect(screen.getByText(/approve or reject orders above the discount threshold/)).toBeTruthy()
  })

  it('lets an administrator open orders and see history without order actions', async () => {
    const admin = { ...first, role: 'admin' }
    const path = ordersPath(admin.organisationId)
    const pending = { ...order, status: 'pending', history: [{
      kind: 'submitted', actorUserId: null, fromStatus: null, toStatus: 'pending', createdAt,
    }] }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [admin] })
      if (url === '/api/organisations/first') return Response.json(admin)
      if (url === path) return Response.json({ orders: [pending] })
      if (url === path + '/order-1') return Response.json(pending)
      throw new Error('Unexpected request')
    }))
    render(<App session={mockSession('/organisations/first')} />)
    fireEvent.click(await screen.findByRole('link', { name: 'Orders' }))
    await screen.findByRole('heading', { name: 'Organisation orders' })
    const viewOrder = await screen.findByRole('button', { name: 'View order' })
    fireEvent.click(viewOrder)
    const dialog = await screen.findByRole('dialog', { name: 'Order details' })
    expect(await within(dialog).findByText(/· System/)).toBeTruthy()
    for (const name of ['Submit order', 'Approve', 'Reject', 'Fulfil']) {
      expect(within(dialog).queryByRole('button', { name })).toBeNull()
    }
    expect(viewOrder.closest('table')?.contains(dialog)).toBe(false)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: 'View order' })).toBe(viewOrder)
    expect(document.activeElement).toBe(viewOrder)
  })

  it('retries the same submission and fulfils the returned approved order', async () => {
    const path = ordersPath('first')
    const submissions: unknown[] = []
    let orders: object[] = []
    const fetch = vi.fn(async (url: string, options: RequestInit) => {
      const workspace = workspaceResponse(url)
      if (workspace) return workspace
      if (url === path + '/selectors') return selectors()
      if (url === path && options.method === 'POST') {
        submissions.push(JSON.parse(String(options.body)))
        if (submissions.length === 1) throw new Error('Lost response')
        orders = [order]
        return Response.json(order, { status: 201 })
      }
      if (url === path + '/order-1/fulfil') {
        const fulfilled = { ...order, status: 'fulfilled', history: [...order.history, {
          kind: 'fulfilled', actorUserId: 'synthetic-user', fromStatus: 'approved', toStatus: 'fulfilled', createdAt,
        }] }
        orders = [fulfilled]
        return Response.json(fulfilled)
      }
      if (url === path) return Response.json({ orders })
      throw new Error('Unexpected request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/first/orders')} />)
    await screen.findByLabelText(/^Customer/)
    fillOrder()
    fireEvent.click(screen.getByRole('button', { name: 'Add line' }))
    await screen.findByLabelText(/^Product 2/)
    fireEvent.click(screen.getByRole('button', { name: 'Remove line 2' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit order' }))
    await screen.findByText('Could not submit the order. Try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Submit order' }))
    await screen.findByText('Total 18.00')
    expect(submissions).toEqual([expect.objectContaining({
      requestId: expect.any(String), customerId: 'customer-1', discountPercent: '10',
      lines: [{ productId: 'product-1', quantity: 2 }],
    }), submissions[0]])
    expect(screen.getByText('Automatically approved')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fulfil' }))
    expect(await screen.findByText(/Approved → Fulfilled/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Fulfil' })).toBeNull()
    expect(fetch).toHaveBeenCalledWith(path + '/order-1/fulfil', expect.objectContaining({ method: 'POST' }))
  })

  it('opens the manager queue and refreshes a stale decision', async () => {
    const path = ordersPath('second')
    let status = 'pending'
    const fetch = vi.fn(async (url: string) => {
      const workspace = workspaceResponse(url)
      if (workspace) return workspace
      if (url === path + '?status=pending') return Response.json({ orders: status === 'pending' ? [{ ...order, status }] : [] })
      if (url === path) return Response.json({ orders: [{ ...order, status }] })
      if (url === path + '/order-1') return Response.json({ ...order, status })
      if (url === path + '/order-1/reject') {
        status = 'approved'
        return Response.json({ message: 'Order already decided.' }, { status: 409 })
      }
      throw new Error('Unexpected request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/second/orders')} />)
    fireEvent.click(await screen.findByRole('button', { name: 'View order' }))
    const reject = await screen.findByRole('button', { name: 'Reject' })
    expect(screen.getByRole('button', { name: 'Approve' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'New order' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Fulfil' })).toBeNull()
    fireEvent.click(reject)
    await screen.findByText('Order already decided.')
    await screen.findByText('No orders are awaiting approval.')
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pending only' }))
    await screen.findByRole('button', { name: 'View order' })
    expect(fetch).toHaveBeenCalledWith(path, expect.anything())
  })

  it.each([
    { action: 'Approve', command: 'approve', status: 'approved', label: 'Approved' },
    { action: 'Reject', command: 'reject', status: 'rejected', label: 'Rejected' },
  ])('records a successful manager decision to $command', async ({ action, command, status, label }) => {
    const path = ordersPath('second')
    const pendingOrder = { ...order, status: 'pending', history: [] }
    let orders = [pendingOrder]
    const fetch = vi.fn(async (url: string) => {
      const workspace = workspaceResponse(url)
      if (workspace) return workspace
      if (url === path + '?status=pending') return Response.json({ orders })
      if (url === path + '/order-1') return Response.json(pendingOrder)
      if (url === path + '/order-1/' + command) {
        orders = []
        return Response.json({ ...order, status, history: [{
          kind: status, actorUserId: 'synthetic-user', fromStatus: 'pending', toStatus: status, createdAt,
        }] })
      }
      throw new Error('Unexpected request')
    })
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/second/orders')} />)
    fireEvent.click(await screen.findByRole('button', { name: 'View order' }))
    fireEvent.click(await screen.findByRole('button', { name: action }))
    await screen.findByText(new RegExp('Pending approval → ' + label))
    await screen.findByText('No orders are awaiting approval.')
    expect(screen.queryByRole('button', { name: action })).toBeNull()
    expect(fetch).toHaveBeenCalledWith(path + '/order-1/' + command, expect.objectContaining({ method: 'POST' }))
  })

  it('discards a late submission when switching organisations', async () => {
    const path = ordersPath('first')
    let previousSignal: AbortSignal | null = null
    let finishPrevious: (value: Response) => void = () => {}
    vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit) => {
      const workspace = workspaceResponse(url)
      if (workspace) return workspace
      if (url === path + '/selectors') return selectors()
      if (url === path && options.method === 'POST') {
        previousSignal = options.signal ?? null
        return new Promise<Response>((resolve) => { finishPrevious = resolve })
      }
      if (url === path || url === ordersPath('second') + '?status=pending') return Response.json({ orders: [] })
      throw new Error('Unexpected request')
    }))
    render(<App session={mockSession('/organisations/first/orders')} />)
    await screen.findByLabelText(/^Customer/)
    fillOrder()
    fireEvent.click(screen.getByRole('button', { name: 'Submit order' }))
    await waitFor(() => expect(previousSignal).not.toBeNull())

    const picker = screen.getByRole('combobox', { name: 'Organisation' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'Enter', code: 'Enter' })
    await screen.findByText('No orders are awaiting approval.')
    expect(window.location.pathname).toBe('/organisations/second/orders')
    expect(previousSignal).toHaveProperty('aborted', true)
    await act(async () => finishPrevious(Response.json(order)))
    expect(screen.queryByText('Total 18.00')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'New order' })).toBeNull()
  })
})
