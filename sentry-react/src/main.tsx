// Import Sentry instrumentation BEFORE anything else so it is initialized
// before React renders.
import './instrument.ts'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from './components/Layout'
import { RoutePage } from './components/RoutePage'
import { Console } from './pages/Console'
import { ProductsPage } from './pages/ProductsPage'
import { CategoriesPage } from './pages/CategoriesPage'
import { NotFound } from './pages/NotFound'
import './index.css'
import './App.css'

// Wrapping Routes lets the router-tracing integration name navigation traces by
// their parameterized path (/products/:id, /categories/*) rather than the URL.
const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sentry.ErrorBoundary reports any uncaught render error to Uptrace and
        shows a fallback instead of a blank screen. */}
    <Sentry.ErrorBoundary fallback={<p>Something went wrong, check Uptrace.</p>}>
      <BrowserRouter>
        <SentryRoutes>
          <Route element={<Layout />}>
            <Route path="/" element={<Console />} />
            <Route path="/products/:id" element={<ProductsPage />} />
            <Route path="/categories/*" element={<CategoriesPage />} />
            <Route
              path="/news"
              element={
                <RoutePage
                  subtitle="News. A static route (/news); it mints its own navigation trace."
                  errors={[{ name: 'NewsLoadFailed', message: 'Failed to load news' }]}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <RoutePage
                  subtitle="Settings. A static route (/settings); it mints its own navigation trace."
                  errors={[{ name: 'SettingsSaveFailed', message: 'Failed to save settings' }]}
                />
              }
            />
            <Route path="/redirect" element={<Navigate to="/" replace />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </SentryRoutes>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
