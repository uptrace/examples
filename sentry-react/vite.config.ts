import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// The slow endpoint's delay, long enough to show as a visibly slow span.
const SLOW_MS = 5000

// devApi serves /api/ok|slow|fail from the Vite dev server so the app can make
// real requests (producing http.client spans) with no separate backend. These
// exist only under `npm run dev`, not in a static `vite preview` build.
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        if (url === '/api/ok') {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
          return
        }
        if (url === '/api/fail') {
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'intentional failure' }))
          return
        }
        if (url === '/api/slow') {
          setTimeout(() => {
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ ok: true, slow: true }))
          }, SLOW_MS)
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devApi()],
})
