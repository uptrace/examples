# Using sentry-go with Uptrace

Uptrace is compatible with the Sentry SDK, so you can use [sentry-go](https://github.com/getsentry/sentry-go)
to send errors and traces to Uptrace by pointing the Sentry DSN at your Uptrace project.

To run this example, [create an Uptrace project](https://app.uptrace.dev) to obtain a
DSN and run:

```shell
UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id> go run .
```

Then use the trace id from the CLI output to find the trace in the Uptrace UI.
