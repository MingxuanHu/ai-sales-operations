// ? makes the cancellation signal optional. Promise<boolean> means the result arrives asynchronously.
export async function checkApiHealth(signal?: AbortSignal): Promise<boolean> {
  try {
    // A path starting with / uses the same scheme, host, and port as the page.
    const response = await fetch('/api/health', { signal })
    // fetch resolves for HTTP errors too. response.ok is true only for 2xx responses.
    if (!response.ok) {
      return false
    }

    // TypeScript types do not validate server data. ?. handles null and === checks the actual status.
    const health: { status?: unknown } | null = await response.json()
    // If health is null or undefined, health?.status evaluates to undefined instead of throwing an exception
    return health?.status === 'ok'
  } catch {
    // Network errors, cancellation and invalid JSON can all throw.
    return false
  }
}
