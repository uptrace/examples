# Using sentry-python with Uptrace

Uptrace is compatible with the Sentry SDK, so you can use
[sentry-python](https://github.com/getsentry/sentry-python) to send errors to Uptrace by
pointing the Sentry DSN at your Uptrace project.

To run this example, [create an Uptrace project](https://app.uptrace.dev) to obtain a
DSN and run:

```shell
pip install -r requirements.txt
UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id> python3 main.py
```

Then search for `RuntimeError` in your Uptrace project. The reported event
contains the full nested exception chain (`RuntimeError` caused by `KeyError`).
