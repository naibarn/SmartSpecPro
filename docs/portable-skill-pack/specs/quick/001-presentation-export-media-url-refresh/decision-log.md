# Decision log

## Planning depth

- depth: standard
- reason: the change crosses the Node render route, Python worker, and two test
  runtimes, but needs no schema/provider/dependency work.
- no promotion: the existing route already owns media URL resolution and the
  worker loops are small, bounded, and well tested.

## Decisions

1. Refresh managed media at the Node slide-render boundary on every request;
   do not inspect arbitrary external URLs or store refreshed URLs in the DB.
2. Add a small shared Python retry helper for each slide attempt, used by both
   screenshot and record-mode paths.
3. Retry only transient navigation/readiness failures. HTTP 401/403/404,
   structural ready failure, malformed content, and media-degraded terminal
   state remain fail-closed.
4. Keep the retry budget at two additional attempts. Each attempt creates a new
   page, token, navigation, and route-side presigned URL set.
5. Do not modify active `.env`; runtime configuration must be fixed by the
   deployment/operator for the relevant network namespace.

## Risks still requiring verification

- Worker DNS/base URL may prevent any retry from reaching the Node route.
- Current tests use Playwright mocks, so a real worker/browser export remains a
  separate runtime proof gate.
