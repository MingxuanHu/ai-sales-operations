import { afterEach, expect, it, vi } from 'vitest'
import { checkApiHealth } from './health'

afterEach(() => vi.unstubAllGlobals())

it('requests liveness from the page origin and recognises a healthy API', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ status: 'ok' }))
  vi.stubGlobal('fetch', fetchMock)
  const { signal } = new AbortController()

  await expect(checkApiHealth(signal)).resolves.toBe(true)
  expect(fetchMock).toHaveBeenCalledWith('/api/health', { signal })
})

it.each([
  () => Response.json({ status: 'ok' }, { status: 503 }),
  () => Response.json({ status: 'unexpected' }),
  () => new Response('invalid JSON'),
])('reports an unusable HTTP response as unavailable', async (makeResponse) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse()))

  await expect(checkApiHealth()).resolves.toBe(false)
})

it('reports a network failure as unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))

  await expect(checkApiHealth()).resolves.toBe(false)
})
