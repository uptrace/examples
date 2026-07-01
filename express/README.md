# OpenTelemetry Express example for Uptrace

Install dependencies:

```bash
npm install
```

[Create an Uptrace project](https://app.uptrace.dev) to obtain a DSN and start the
Express server:

```bash
UPTRACE_DSN="https://<token>@api.uptrace.dev/<project_id>" node --require ./otel.js main.js
```

Then open http://localhost:9999

See [OpenTelemetry Express.js](https://uptrace.dev/get/instrument/opentelemetry-express.html) for
details.
