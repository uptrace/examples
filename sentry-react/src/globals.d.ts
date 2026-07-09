// Ambient window hooks the app uses to expose what it sent, so end-to-end tests
// can assert on it without reading the network. window.__signals mirrors the
// signals store (src/signals.ts); window.recordedTransactions collects pageload
// and navigation transaction event ids (set in src/instrument.ts).
declare global {
  interface Window {
    __signals?: unknown[]
    recordedTransactions?: string[]
  }
}

export {}
