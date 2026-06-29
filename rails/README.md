# Instrumenting Rails with OpenTelemetry example

Install dependencies:

```shell
bundle install
```

To run this example, [create an Uptrace project](https://app.uptrace.dev) to obtain a
DSN and run:

```shell
UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id> rackup main.ru
```

And open http://localhost:9292

## Documentation

See [Getting started with Rails and OpenTelemetry](https://uptrace.dev/get/opentelemetry-rails.html)
for details.
