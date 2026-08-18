# Decision log

## Planning depth

`standard` quick-plan: the change spans server JSONB persistence, page task
orchestration, storyboard UI, and focused tests, but remains one bounded
Vertical Drama workflow with no schema migration or new provider contract.

## Decisions

1. Keep status logic Vertical Drama-specific rather than changing all
   `AuthenticatedMediaImage` consumers.
2. Extend `imageTask` with optional `failureStage` values `provider`, `sync`,
   and `admission`; allow a missing task id only for guarded admission failure.
3. Reuse the saved prompt for `สร้างภาพใหม่` by calling the existing render-only
   path with `reauthor = false`.
4. Treat provider result/link failure as terminal sync failure and clear the
   pending marker through the existing persistence mutation.
5. Add browser image load state in the storyboard viewport with `onLoad` and
   `onError`; do not infer successful display from asset metadata alone.

## Review notes

- Avoid storing raw provider diagnostics in new UI-only state; use the existing
  bounded error field and existing error presentation where available.
- Do not use a fake provider task id for admission failures. The server accepts
  an absent task id only for a terminal admission failure and rejects/ignores it
  when a newer pending task exists.
- Keep current row-lock and task-id protections intact.

## Plan stabilization

Five self-review rounds completed. Round 1 added the local fallback when failure
persistence itself fails and made credit confirmation/sync retry behavior
explicit. Rounds 2-5 found no further material gaps across scope, contract,
security/ownership, UI state/copy/accessibility, section interfaces, or required
verification.
