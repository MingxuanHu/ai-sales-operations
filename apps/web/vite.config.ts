import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // The React plugin transforms JSX and enables fast updates while editing.
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true, // Fail if port 5173 is taken so the documented URL stays predictable.
    proxy: {
      // The browser calls Vite on port 5173. Vite forwards /api/ requests to Nest on port 3000.
      '/api/': 'http://127.0.0.1:3000',
    },
  },
})
