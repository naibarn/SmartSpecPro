# Section 07 Review - Playback and Export Pipeline

Date: 2026-02-22
Reviewer: Codex (self-review)

## Correctness
- Deterministic slideshow payload generation is enforced with stable ordering (`orderIndex`, then `id`).
- Transition whitelist enforcement (`cut`, `fade`) rejects unsupported values before enqueue.
- Render spec always includes `schemaVersion` and explicitly fails unknown accepted-version sets.
- Export request dedupe suppresses duplicate submissions within the dedupe window.
- Per-user and per-deck throttles return deterministic retry metadata (`retryAfterSeconds`).

## Regression Risk
- Low-to-medium: new router procedures are additive (`getSlideshow`, `triggerExport`, `getExportStatus`) and do not alter existing CRUD routes.
- Frontend change is additive (new play/export controls and status messaging) and does not alter existing slide-edit save flow.

## Security / Tenant Isolation
- Export status retrieval is tenant/user scoped via actor checks in `getPresentationExportStatus`.
- No cross-tenant status reads are permitted.

## Performance
- In-memory dedupe/throttle registries are O(n) per key-window prune and bounded by recent request counts.
- No expensive DB queries added beyond existing deck/detail fetch for export generation.

## Findings
1. Medium: export dedupe/throttle/status registries are in-process only; multi-instance deployments can bypass dedupe and lose status on restart.
   - Recommendation: move export state and dedupe/throttle counters to shared storage (Redis/DB) in hardening phase.

## Missing Tests / Gaps
- Missing queue transport integration test with actual media job dispatch contract.
- Missing long-poll/progress transition tests for `processing`/`done`/`error` state changes.
