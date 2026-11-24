// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
        return Response.json({ invitations: [{ ...first, invitationId: 'invite', expiresAt: '2026-11-30' }] })
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
    expect(await screen.findByRole('heading', { name: 'Invitations' })).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation to Cedar Wholesale' }))
    expect(await screen.findByRole('heading', { name: first.name })).toBeTruthy()
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

  it('aborts a pending acceptance when leaving Invitations and ignores its late response', async () => {
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
    fireEvent.click(await screen.findByRole('button', { name: 'Accept invitation to Cedar Wholesale' }))
    await waitFor(() => expect(pendingSignal).not.toBeNull())
    fireEvent.click(screen.getByRole('link', { name: 'Create organisation' }))
    await screen.findByRole('heading', { name: 'Create organisation' })
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
    fireEvent.click(screen.getByRole('link', { name: 'Invitations' }))
    await screen.findByRole('heading', { name: 'Received invitations' })
    expect(screen.queryByRole('button', { name: 'Send invitation' })).toBeNull()

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
      if (url === '/api/me') return Response.json({ userId: 'synthetic-user', memberships: [first] })
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
    const invitations = screen.getByRole('link', { name: 'Invitations' })
    fireEvent.click(invitations)
    expect(await screen.findByRole('heading', { name: 'Received invitations' })).toBeTruthy()
    expect(invitations.getAttribute('aria-current')).toBe('page')
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
    render(<App session={mockSession('/organisations/first/invitations')} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Recipient user ID' }), { target: { value: 'abcc5d8a-ead7-4f6a-a7ce-d149103edd80' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value: 'salesperson' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(previousSignal).not.toBeNull())
    const picker = screen.getByRole('combobox', { name: 'Organisation' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'ArrowDown', code: 'ArrowDown' })
    fireEvent.keyDown(picker, { key: 'Enter', code: 'Enter' })
    await screen.findByText(second.name)
    expect(window.location.pathname).toBe('/organisations/second/invitations')
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
    render(<App session={mockSession('/organisations/foreign/invitations')} />)
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
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/me', '/api/organisations/second'])
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
    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['/api/me', '/api/organisations/second'])
  })
})
