# Uptrace examples

This repository contains examples that show how to instrument applications with
OpenTelemetry and various SDKs and ship the resulting traces, metrics, and logs to
[Uptrace](https://uptrace.dev).

## Get an Uptrace DSN

Most examples export data to **Uptrace Cloud**. [Create an Uptrace
project](https://app.uptrace.dev) to obtain a DSN and pass it via the `UPTRACE_DSN`
environment variable:

```shell
export UPTRACE_DSN="https://<token>@api.uptrace.dev/<project_id>"
```

The OTLP endpoints used by the examples are:

- OTLP/gRPC: `api.uptrace.dev:4317` (TLS)
- OTLP/HTTP: `https://api.uptrace.dev` with the paths `/v1/traces`, `/v1/logs`, `/v1/metrics`

The DSN is always passed to the exporter through the `uptrace-dsn` header.

> **Note**. The [`kvrocks`](kvrocks) example also starts a local Kvrocks server via
> Docker Compose (the service it monitors); telemetry still goes to Uptrace Cloud.

## Examples

### Go

- [go-slog](go-slog) — bridge Go's `log/slog` to OpenTelemetry.
- [gin-gorm](gin-gorm) — instrument Gin and GORM with OpenTelemetry.
- [go-zero](go-zero) — use go-zero's built-in OpenTelemetry support.
- [kvrocks](kvrocks) — monitor Apache Kvrocks with go-redis.

### Python

- [django](django) — instrument a Django application.
- [flask](flask) — instrument Flask with SQLAlchemy.

### Ruby

- [rails](rails) — instrument a minimal Rails application.

### Node.js

- [express](express) — instrument Express with the OpenTelemetry SDK.

### Sentry-compatible SDKs

Uptrace is compatible with the Sentry SDKs, so you can point a Sentry DSN at your Uptrace
project.

- [sentry-go](sentry-go) — errors and tracing with sentry-go.
- [sentry-python](sentry-python) — nested exception chains with sentry-python.
- [sentry-browser](sentry-browser) — events with @sentry/browser.

### Logs, Collector, and demos

- [vector-logs](vector-logs) — ship logs to Uptrace with Vector.
- [opentelemetry-demo](opentelemetry-demo) — run the OpenTelemetry Demo with Uptrace.

## Running an example

Each example is self-contained and exposes a default `make` target that runs it:

```shell
cd <example>
make
```

See the `README.md` in each directory for prerequisites and details.
