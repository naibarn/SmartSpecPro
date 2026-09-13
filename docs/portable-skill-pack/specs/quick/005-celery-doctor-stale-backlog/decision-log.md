# Decision log

1. Keep the concurrency limit at three and expose it as a named backend/UI
   contract.
2. Define `inFlightCount` as processing plus claimed pending rows.
3. Define true stale work as old, unclaimed pending rows only when
   `inFlightCount < 3`.
4. Preserve legacy aggregate fields for API compatibility while adding explicit
   claimed/unclaimed/in-flight fields.
5. Keep Celery recovery unchanged; it handles claimed task loss separately.
6. Add bounded affected user IDs and task IDs to auto-report context.
