import { useEffect, useState } from 'react'
import { checkApiHealth } from '../api/check-api-health'

// A union lists the allowed state values. Record requires a display label for each value.
type Health = 'checking' | 'healthy' | 'unavailable'

const labels: Record<Health, string> = {
  checking: 'Checking…',
  healthy: 'Operational',
  unavailable: 'Unavailable',
}

export function HealthStatus() {
  // useState stores a value between renders. Calling setHealth asks React to render again.
  const [health, setHealth] = useState<Health>('checking')

  // An effect runs after React renders. The empty dependency array below runs it on mount.
  useEffect(() => {
    const controller = new AbortController()

    // then runs when the request finishes. Skip the update if the effect has been cleaned up.
    void checkApiHealth(controller.signal).then((healthy) => {
      if (!controller.signal.aborted) {
        setHealth(healthy ? 'healthy' : 'unavailable')
      }
    })

    // React calls this cleanup when the component is removed.
    return () => controller.abort()
  }, [])

  // JSX describes the UI in markup. Braces insert a JavaScript value such as labels[health].
  return (
    <p role="status">API status · <strong>{labels[health]}</strong></p>
  )
}
