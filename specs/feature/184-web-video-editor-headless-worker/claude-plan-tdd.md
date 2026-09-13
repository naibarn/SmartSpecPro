# TDD plan — Feature 184

This file mirrors `claude-plan.md`. Test descriptions are stubs for `deep-implement`; they are not implementations.

## Section 01 — Shared contracts, fixtures, and compatibility boundary

- Test canonical envelope accepts valid v1 and rejects unknown major/operation/unsafe fields.
- Test immutable hash excludes attempt/lease context and remains deterministic.
- Test operation/job allowlist, failure category projection, output-role validation, and TypeScript/Rust fixture parity.
- Test compatibility projection from existing `MediaJobSpec` and current job-family payloads.

## Section 02 — Canonical project persistence, revisions, and concurrency

- Test migration shape and compatibility with existing `video_editor_projects` consumers.
- Test tenant/owner authorization, CAS success/conflict, duplicate mutation, stale response ordering, autosave, restore, archive/delete guards, and legacy router behavior.
- Test project-job links and revision pinning.

## Section 03 — Asset ingest, import migration, and proxy artifacts

- Test Worker NLE and legacy Web import round trips, unsupported-field reports, missing/relink assets, idempotent ingest, hash mismatch, and path/URL rejection.
- Test VFR/speed/trim/audio timing golden fixtures and proxy metadata/provenance/dedupe.
- Test authenticated range access and URL refresh without persisted expiring URLs.

## Section 04 — Worker job API, scheduler, leases, and billing

- Test API input/output/error envelopes and project/asset/tenant authorization.
- Test preflight expiry, idempotent submit, queue capacity/fairness, capability freshness, credit lifecycle, claim fencing, allowed transitions, cancellation, retry, and stale callbacks.
- Test all existing worker-job families remain compatible.

## Section 05 — Headless Worker executor, providers, artifacts, and diagnostics

- Test typed argv/operation allowlist, path/resource limits, provider selection, process cancellation, heartbeat renewal, and output probe/QC.
- Test upload resume, checksum/manifest validation, stale completion rejection, duplicate publication, diagnostic redaction, and replay authorization.
- Add Rust Cargo tests for contract/lease/artifact fixtures and real sidecar smoke when available.

## Section 06 — Browser editor extraction and Web platform adapter

- Characterize Worker reducer/time behavior before extraction.
- Test browser editor load/save/import/proxy/overlay/audio/subtitle states, no-Tauri import, autosave/conflict/offline recovery, keyboard/focus, dark/light, responsive states, and stale result review.
- Add authenticated Playwright route proof and screenshots for required viewports.

## Section 07 — Worker Jobs page rename and queue UX

- Test `/worker-jobs` canonical route, `/render-jobs` query-preserving alias, title/copy/operation labels, links, filters, status states, historical jobs, and accessibility.
- Test no API/DB/job ID rename and no accidental replacement of operation-specific render terminology.

## Section 08 — Render submission, result application, replay, and user notifications

- Test save-before-submit, preflight/approval/credit, duplicate submit, status reconnect, cancellation/retry/replay, stale result apply, Library publication, notification dedupe, and localized error copy.

## Section 09 — Rollout, telemetry, retention, and rollback

- Test flag precedence/cache invalidation/cohort routing, canary thresholds, metric redaction/cardinality, retention/delete/tombstone, audit, and rollback behavior.

## Section 10 — Cross-section integration and acceptance proof

- Test full browser → server → existing worker queue → Worker → artifact → Library flow.
- Run chaos cases for worker offline, R2 timeout, low disk, corrupt output, stale lease, duplicate delivery, browser refresh, and rollback.
- Record exact commands, fixtures, artifacts, skipped proof, and residual risk.
