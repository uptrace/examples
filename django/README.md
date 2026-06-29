# Instrumenting Django with OpenTelemetry

Install dependencies:

```shell
pip install -r requirements.txt
```

To run this example, [create an Uptrace project](https://app.uptrace.dev) to obtain a
DSN and run:

```shell
export UPTRACE_DSN=https://<token>@api.uptrace.dev/<project_id>
./manage.py migrate
./manage.py runserver --noreload
```

> **Note**. Use `--noreload`. `manage.py` instruments OpenTelemetry before Django starts,
> and the `runserver` autoreloader would otherwise run that setup twice (once in the
> reloader parent and once in the child process).

And open http://localhost:8000

See
[Getting started with Django and OpenTelemetry](https://uptrace.dev/get/opentelemetry-django.html)
for details.
