# OpenTelemetry slog example for Uptrace

This example shows how to bridge Go's standard `log/slog` to OpenTelemetry so that
structured log records are correlated with traces and exported to Uptrace.

To run this example, [create an Uptrace project](https://app.uptrace.dev) to obtain a
DSN and run:

```shell
UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id> go run .
```

Then open the URL from the console output to view the trace.

See [OpenTelemetry Slog](https://uptrace.dev/get/instrument/opentelemetry-slog.html) for details.
