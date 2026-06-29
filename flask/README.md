# Instrumenting Flask with OpenTelemetry example

Install dependencies:

```shell
pip install -r requirements.txt
```

To run this example, [create an Uptrace project](https://app.uptrace.dev) to obtain a
DSN and run:

```shell
UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id> python3 main.py
```

And open http://localhost:8000

See
[Getting started with Flask, SQLAlchemy, and OpenTelemetry](https://uptrace.dev/get/opentelemetry-flask-sqlalchemy.html)
for details.
