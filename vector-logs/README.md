# Vector example for Uptrace

This example demonstrates how to send logs to Uptrace using [Vector](https://vector.dev).

Edit `vector.toml` and set `headers.uptrace-dsn` to your project DSN
(`https://<token>@api.uptrace.dev/<project_id>`), which you can obtain by
[creating an Uptrace project](https://app.uptrace.dev).

To run this example, you need Vector **0.49.0+**:

```shell
vector --config vector.toml
```

Then open the **Logs** tab in the Uptrace UI to view the generated logs.

See [Logging](https://uptrace.dev/opentelemetry/structured-logging.html) documentation for details.
