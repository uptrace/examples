// Import Sentry instrumentation BEFORE anything else so it is initialized
// before React renders.
import './instrument.ts'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'

import { TodosProvider } from './todos-context'
import { TodoList } from './pages/TodoList'
import './index.css'
import './App.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Sentry.ErrorBoundary reports any uncaught render error to Uptrace and
        shows a fallback instead of a blank screen. */}
    <Sentry.ErrorBoundary fallback={<p>Something went wrong — check Uptrace.</p>}>
      <TodosProvider>
        <TodoList />
      </TodosProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
