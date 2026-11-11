import { HealthStatus } from '../features/health/components/HealthStatus'
import './app.css'

// A parent component composes the page by placing child components in its JSX.
export function App() {
  return (
    <main>
      <h1>AI Sales Operations</h1>
      <HealthStatus />
    </main>
  )
}
