'use strict'

const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base')
const { resourceFromAttributes } = require('@opentelemetry/resources')
const {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} = require('@opentelemetry/semantic-conventions')
const { NodeSDK } = require('@opentelemetry/sdk-node')
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http')
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http')
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express')

const dsn = process.env.UPTRACE_DSN
if (!dsn) {
  console.error('UPTRACE_DSN is empty, set it to https://<token>@api.uptrace.dev/<project_id>')
  process.exit(1)
}
console.log('using dsn:', dsn)

const exporter = new OTLPTraceExporter({
  url: 'https://api.uptrace.dev/v1/traces',
  headers: { 'uptrace-dsn': dsn },
  compression: 'gzip',
})
const bsp = new BatchSpanProcessor(exporter, {
  maxExportBatchSize: 1000,
  maxQueueSize: 1000,
})

const sdk = new NodeSDK({
  spanProcessors: [bsp],
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'myservice',
    [ATTR_SERVICE_VERSION]: '1.0.0',
  }),
  instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()],
})
sdk.start()
