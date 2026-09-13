# Request

Correct Celery media Doctor alerting so a normal backlog caused by the per-user
three-job limit is not reported as an incident. Report only an unclaimed image
task that is older than three minutes while the same user has available in-flight
capacity. Include bounded affected user/task identifiers in the admin feedback
and make the dashboard counters explain the distinction.
