# Go-zero api example

This example uses [go-zero](https://github.com/zeromicro/go-zero)'s built-in
OpenTelemetry support to export traces to Uptrace.

**Step 1**. [Create an Uptrace project](https://app.uptrace.dev) to obtain a DSN, then
edit `etc/api-api.yaml` and put your DSN into `OtlpHeaders.uptrace-dsn`:

```yaml
Telemetry:
  Name: api-api
  Sampler: 1.0
  Batcher: otlphttp
  Endpoint: api.uptrace.dev
  OtlpHttpPath: /v1/traces
  OtlpHttpSecure: true
  OtlpHeaders:
    uptrace-dsn: https://<token>@api.uptrace.dev/<project_id>
```

> **Note**. We use the `otlphttp` batcher because go-zero's `otlpgrpc` batcher always
> dials insecurely and therefore can't reach Uptrace Cloud over TLS. If you run a local
> Uptrace stack you may instead use `Batcher: otlpgrpc` with `Endpoint: localhost:14317`.

**Step 2**. Start the go-zero server:

```shell
go run api.go -f etc/api-api.yaml
```

**Step 3**. Open http://localhost:8888/from/you to trigger a request.

**Step 4**. Open the [Uptrace UI](https://app.uptrace.dev) to view the trace.

See
[Getting started with Go Zero and OpenTelemetry](https://uptrace.dev/opentelemetry/instrumentations/go-zero.html)
for details.
