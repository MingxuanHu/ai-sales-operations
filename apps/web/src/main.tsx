import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { checkApiHealth } from './health'
import './style.css'

type Health = 'checking' | 'healthy' | 'unavailable'

const labels: Record<Health, string> = {
  checking: 'Checking…',
  healthy: 'Operational',
  unavailable: 'Unavailable',
}

function App() {
  const [health, setHealth] = useState<Health>('checking')

  useEffect(() => {
    const controller = new AbortController()

    void checkApiHealth(controller.signal).then((healthy) => {
      if (!controller.signal.aborted) {
        setHealth(healthy ? 'healthy' : 'unavailable')
      }
    })

    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>AI Sales Operations</h1>
      <p role="status">API status · <strong>{labels[health]}</strong></p>
    </main>
  )
}

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing application root')
}

createRoot(root).render(<App />)
