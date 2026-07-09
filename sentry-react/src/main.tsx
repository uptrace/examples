// Import Sentry instrumentation BEFORE anything else so it is initialized
// before React renders.
import './instrument.ts'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { Console } from './pages/Console'
import { ItemRoute } from './pages/ItemRoute'
import './index.css'
import './App.css'

// Wrapping Routes lets the router-tracing integration name navigation traces by
// their parameterized path (/item/:id) rather than the concrete URL (/item/42).
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sentry.ErrorBoundary reports any uncaught render error to Uptrace and
        shows a fallback instead of a blank screen. */}
    <Sentry.ErrorBoundary fallback={<p>Something went wrong — check Uptrace.</p>}>
      <BrowserRouter>
        <SentryRoutes>
          <Route element={<Layout />}>
            <Route path="/" element={<Console />} />
            <Route path="/item/:id" element={<ItemRoute />} />
          </Route>
        </SentryRoutes>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
