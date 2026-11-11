export async function checkApiHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch('/api/health', { signal })
    if (!response.ok) {
      return false
    }

    const health: { status?: unknown } | null = await response.json()
    return health?.status === 'ok'
  } catch {
    return false
  }
}
