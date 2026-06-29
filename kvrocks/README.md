# Kvrocks example for OpenTelemetry and Uptrace

This example monitors [Apache Kvrocks](https://kvrocks.apache.org/) (a Redis-compatible
store) with [go-redis](https://github.com/redis/go-redis) and sends traces and metrics to
Uptrace Cloud.

See
[Getting started with Kvrocks and go-redis](https://kvrocks.apache.org/blog/go-redis-kvrocks-opentelemetry)
for details.

**Step 1**. Start a local Kvrocks server using Docker:

```shell
docker compose up -d
```

**Step 2**. [Create an Uptrace project](https://app.uptrace.dev) to obtain a DSN and run
the example:

```shell
UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id> go run .
```

**Step 3**. Open the trace URL from the console output to view traces, and find the
`kvrocks.used_disk_percent` metric in the Uptrace UI.
