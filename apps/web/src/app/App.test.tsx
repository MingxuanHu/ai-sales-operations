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
    expect(screen.getByText(/Google sign-in for the demo is limited to allowlisted test accounts/)).toBeTruthy()
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
    expect(await screen.findByRole('heading', { name: /don’t belong/ })).toBeTruthy()
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
    render(<App session={mockSession()} />)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Organisation name' }), { target: { value: first.name } })
    fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
    await screen.findByText('Your request could not be completed. Please try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Create organisation' }))
    expect(await screen.findByRole('heading', { name: first.name })).toBeTruthy()
    expect(requestIds).toEqual([expect.any(String), requestIds[0]])
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
    expect(window.location.pathname).toBe('/organisations/second')
    expect(previousSignal).toHaveProperty('aborted', true)
    // act lets React process any updates from the late response before we check the screen.
    await act(async () => finishPrevious(Response.json(first)))
    expect(screen.queryByRole('heading', { name: first.name })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy()
    expect(session.signOut).toHaveBeenCalledOnce()
    expect(screen.queryByText('manager')).toBeNull()
  })

  it('shows access denied when the API rejects the selected tenant', async () => {
    const fetch = vi.fn(async (url: string) => url === '/api/me'
      ? Response.json({ userId: 'synthetic-user', memberships: [first] })
      : new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    render(<App session={mockSession('/organisations/foreign')} />)
    expect(await screen.findByText('Access denied')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: first.name })).toBeNull()
  })

  it('clears local auth when the API rejects the session', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 401 })))
    const session = mockSession()
    render(<App session={session} />)
    expect(await screen.findByText('Your session has ended. Sign in to continue.')).toBeTruthy()
    expect(session.clear).toHaveBeenCalledOnce()
  })
})
