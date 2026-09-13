# Feature 184 implementation gap review — 20 rounds

Review target: the Feature 184 files under this planning directory plus the focused Web/shared implementation paths. Each round used a distinct lens; a `MUST_FIX` finding was corrected before the next round. Full typecheck was intentionally not run because the user requested avoiding its memory pressure.

| Round | Lens | Finding | Immediate action / result |
|---:|---|---|---|
| 01 | Scope boundary | The queue rename must cover the Web surface while preserving render operations. | Verified `/worker-jobs` is canonical and render job types/logs remain valid. PASS. |
| 02 | Shared contract strictness | Top-level unknown fields could be accepted by the first validator; canonical project assertions and cross-file fixtures were missing. | Added strict unknown-key rejection with execution metadata allowlist, deep canonical timing/asset validation, and shared valid/unsupported/unsafe fixtures; tests PASS. |
| 03 | Version negotiation | Unknown protocol major/operation must fail before claim; renewed signed URLs are execution metadata rather than contract input. | Validator rejects non-`1.0` and non-registry operation, permits only the explicit `renewedUrls` metadata field, and hashes it out; focused test PASS. |
| 04 | Immutable hash | Attempt/lease context must not alter contract identity. | Hash canonicalization excludes attempt/lease/renewed URLs; deterministic test PASS. |
| 05 | Input security | Absolute/traversal paths and remote URLs must fail closed. | Tightened asset and executor path validators for traversal, Windows, UNC, all absolute paths and URL schemes; security tests PASS. |
| 06 | Migration data safety | Empty or shape-specific clip mapping could silently lose source edits. | Added explicit Worker/Web track and clip mapping, seconds-to-ms conversion, asset lookup and unresolved/unsupported reporting; migration tests PASS. |
| 07 | Persistence schema | Revision/asset/job relations must reuse `video_editor_projects` and enforce tenant ownership. | Added additive Drizzle definitions and idempotent manual migration 0288 with tenant FKs; schema/migration tests PASS. |
| 08 | CAS/idempotency | Same mutation ID with changed payload must not overwrite. | Pure revision decision helper returns duplicate/conflict/reused-ID error; tests PASS. |
| 09 | Queue projection | Adapter metadata was being passed into the strict envelope validator. | Strip idempotency/expected-revision adapter fields before validation and project into existing `worker_jobs` columns; tests PASS. |
| 10 | Artifact integrity | Worker success text cannot establish publication integrity. | Server-observed tenant/checksum/size verification and publication key added; tests PASS. |
| 11 | Artifact roles | Duplicate, undeclared, or missing required output roles could publish. | Added output-set role validation for duplicate/undeclared/missing roles; tests PASS. |
| 12 | Result application | Background revision must not overwrite newer edits. | Added explicit review/apply/stale-conflict decision helper; tests PASS. |
| 13 | Notification delivery | Reconnect/duplicate callbacks could notify repeatedly. | Added `(jobId, terminalState, revision)` dedupe helper; tests PASS. |
| 14 | Browser/native boundary | Browser editor path must not depend on Tauri and picker cancellation must not leave a pending promise. | Added browser-only platform adapter, the Web-first Worker-style editor with managed upload and audio/image/video preview, cancel-safe file picker and jsdom tests. PASS for the implemented surface. |
| 15 | Canonical route | Legacy bookmarks must retain filter context and expose alias telemetry. | Added route helper and `/render-jobs` redirect using `window.location.search` plus `legacyAlias=render-jobs` marker and low-cardinality PostHog hit event; route tests PASS. |
| 16 | Navigation/link inventory | Dashboard/menu/internal links could continue using old product name. | Updated shared menu, Dashboard, RenderPanel, Vertical Drama/admin copy/link, and queue heading; menu/page tests PASS. |
| 17 | Terminology safety | Global replacement could corrupt operation-specific render labels. | Kept operation labels and legacy test selector; only product-surface copy/routes changed. Static `rg` review PASS. |
| 18 | UX/accessibility | Queue/editor states need stable title, status and focusable controls. | Preserved semantic controls/status badges, added canonical document title, Web editor stage/status controls and heading assertions; jsdom queue/menu tests PASS. |
| 19 | Rollout/retention | Emergency rollback and retention values need deterministic guards. | Added mode precedence and non-negative auditable retention validators; tests PASS. |
| 20 | Verification/worktree safety | Full typecheck risks memory and dirty files include unrelated work. | Skipped typecheck per user instruction; ran focused tests (12 files/127 tests + queue/menu/dashboard/browser adapter 4 files/47 tests), production Web/widget build, `check-sections.py`, `check-ui-contracts.py`, syntax parse and diff checks; edited only task-owned hunks and preserved unrelated dirty work. PASS. |

## Final result

No unresolved local `MUST_FIX` gap remains in the implemented slice. Environment-dependent work remains explicitly gated: full editor parity/effects extraction, real Rust/FFmpeg/Remotion execution proof, authenticated Playwright evidence, migration dry-run against a database, production deployment/restart, queue retry/lease drill, Library publication reconciliation, and paid-credit proof. These are recorded as BLOCKED/PENDING rather than reported as passing.

Follow-up: a second comparison review with ten independent lenses is recorded at `implementation/reviews/implementation-vs-spec-review-10-rounds-20260909.md`. It hardened canonical marker/timing/ID validation, Worker mediaPool/trim migration, the full analysis operation and status-transition registry, media-plan DAG/hash validation, migration marker reporting, asset URL/path/MIME checks, analysis executor policy, path rejection, artifact context fencing, CAS input validation and rollout config validation. It also corrected status wording so scoped local PASS is not confused with end-to-end completion.
