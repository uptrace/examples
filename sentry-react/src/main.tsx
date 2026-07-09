// Import Sentry instrumentation BEFORE anything else so it is initialized
// before React renders.
import './instrument.ts'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { TodosProvider } from './todos-context'
import { TodoList } from './pages/TodoList'
import { TodoDetail } from './pages/TodoDetail'
import './index.css'
import './App.css'

// withSentryReactRouterV6Routing lets the tracing integration name each
// navigation trace by the matched route pattern instead of the raw URL.
const SentryRoutes = Sentry.withSentryReactRouterV6Routing(Routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sentry.ErrorBoundary reports any uncaught render error to Uptrace and
        shows a fallback instead of a blank screen. */}
    <Sentry.ErrorBoundary fallback={<p>Something went wrong — check Uptrace.</p>}>
      <BrowserRouter>
        <TodosProvider>
          <SentryRoutes>
            <Route path="/" element={<TodoList />} />
            <Route path="/todo/:id" element={<TodoDetail />} />
          </SentryRoutes>
        </TodosProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
