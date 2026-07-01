import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Minimal Vite config for the React + Sentry example.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
})
