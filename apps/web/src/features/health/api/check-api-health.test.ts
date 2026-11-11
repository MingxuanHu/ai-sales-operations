import { afterEach, expect, it, vi } from 'vitest'
import { checkApiHealth } from './check-api-health'

// Restore the browser globals after every test so a fake fetch cannot leak into another test.
afterEach(() => vi.unstubAllGlobals())

it('requests health from the page origin and recognises a healthy API', async () => {
  // A mock stands in for fetch, returns a canned response and records how it was called.
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }))
  vi.stubGlobal('fetch', fetchMock)
  const { signal } = new AbortController()

  await expect(checkApiHealth(signal)).resolves.toBe(true)
  expect(fetchMock).toHaveBeenCalledWith('/api/health', { signal })
})

// it.each runs the same assertion once for each kind of invalid response.
it.each([
  () => Response.json({ status: 'ok' }, { status: 503 }),
  () => Response.json({ status: 'unexpected' }),
  () => new Response('invalid JSON'),
])('reports an unusable HTTP response as unavailable', async (makeResponse) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse()))

  await expect(checkApiHealth()).resolves.toBe(false)
})

it('reports a network failure as unavailable', async () => {
  // A rejected Promise simulates a connection failure before any HTTP response arrives.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))

  await expect(checkApiHealth()).resolves.toBe(false)
})
