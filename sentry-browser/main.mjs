'use strict'

import { init, captureMessage } from '@sentry/browser'

const dsn = process.env.UPTRACE_DSN
if (!dsn) {
  console.error('UPTRACE_DSN is empty, set it to https://<token>@api.uptrace.dev/<project_id>')
  process.exit(1)
}
console.log('using dsn:', dsn)

init({
  dsn: dsn,
  tracesSampleRate: 1.0,
})

const eventId = captureMessage('Hello, world!')
console.log('event id:', eventId)
