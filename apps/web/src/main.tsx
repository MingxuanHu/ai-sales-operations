import { createRoot } from 'react-dom/client'
import { App } from './app/App'

// React renders into the root element declared in index.html.
const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing application root')
}

createRoot(root).render(<App />)
