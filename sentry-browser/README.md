# Using sentry-browser with Uptrace

Uptrace is compatible with the Sentry SDK, so you can use
[@sentry/browser](https://github.com/getsentry/sentry-javascript) to send events to
Uptrace by pointing the Sentry DSN at your Uptrace project.

Install dependencies:

```shell
npm install
```

To run this example, [create an Uptrace project](https://app.uptrace.dev) to obtain a
DSN and run:

```shell
UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id> node main.mjs
```

Then use the event id from the CLI output to find the event in the Uptrace UI.
