import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { checkApiHealth } from './health'
import './style.css'

// A union lists the allowed state values. Record requires a display label for each value.
type Health = 'checking' | 'healthy' | 'unavailable'

const labels: Record<Health, string> = {
  checking: 'Checking…',
  healthy: 'Operational',
  unavailable: 'Unavailable',
}

function App() {
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
    <main>
      <h1>AI Sales Operations</h1>
      <p role="status">API status · <strong>{labels[health]}</strong></p>
    </main>
  )
}

// React renders into the root element declared in index.html.
const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing application root')
}

createRoot(root).render(<App />)
