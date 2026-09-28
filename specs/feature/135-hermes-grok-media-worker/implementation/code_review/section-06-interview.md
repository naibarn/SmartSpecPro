# Section-06 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews). Auto-triage by conductor.

| # | Finding | Severity | Decision |
|---|---|---|---|
| 1 | Finalize publish-phase no safety net (stuck publishing + orphans) | MAJOR | AUTO-FIX (fail-closed transition + recovery stamp) |
| 2 | Reconcile no terminal-status guard | MEDIUM | AUTO-FIX |
| 3 | /references/urls missing jobType gate | MEDIUM | AUTO-FIX |
| 4 | libraryFolderId ownership unchecked | MEDIUM | AUTO-FIX in hermes path; systemic library.ts gap → spawn_task task_8d22477a |
| 5 | console.* vs structured logger | MINOR | AUTO-FIX |
| 6 | Dead assignmentAttempt schema field | NIT | AUTO-FIX (parity with /events) |
| — | Foreign vd_portrait extra-param keys hunk | — | ACCEPT AS RIDE-ALONG (feature-134-family session; commit note) |

Implementer deviations accepted: settlePortraitCandidate proof via
stubbed-getTask chain (spec's own framing), content-safety gate built on
the only existing primitives (injectable for a real scanner later),
verifyStoredObject seam for S3/local reads.
