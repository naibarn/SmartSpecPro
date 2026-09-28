# Spec 203 implementation review

## Closed findings

1. Feature 184 had no revision ancestry field. Added additive `parentRevisionId` and index.
2. The active editor could write the legacy JSON row without immutable revision evidence. Save/autosave now append a canonical revision and return revision metadata.
3. Editor job admission could insert a worker row without an editor snapshot/outbox link. The editor submit transaction now writes snapshot, project-job link, and canonical outbox record together.
4. Composition output marked `degraded` could reach promotion. Promotion now requires `status=available` and a non-empty evidence reference.
5. Browser-generated project IDs did not map to the server project domain. Phase 3 now uses explicit `project-<serial>` mapping; Video Studio IDs are not joined.
6. Missing exact capability and unavailable agents were conflated. The capability service exposes `capability_blocked` and `waiting_agent` separately, with Web labels `capability-blocked` and `waiting-agent`.
7. Legacy/canonical malformed input could be silently migrated. Canonical-versioned malformed input now fails instead of falling through to legacy conversion.
8. Phase 3 and legacy Web Worker handoff could generate a non-persisted revision or use `video-project-*`. Both paths now persist first when required, use `project-<id>`, and dispatch with the server revision ID.
9. Rough-cut `cut` changes were emitted but not applicable. The change-set service now performs ripple cuts across tracks and provides a validated snapshot inverse.
10. Project CRUD/revision append did not consistently reject cross-tenant revision ownership. Canonical projects now fail closed while unrevisioned legacy projects remain migration-readable.
11. Duplicate editor admission did not expose whether the existing job had an execution snapshot. The duplicate response now includes a redacted snapshot summary and `snapshotReady`.
12. Active generic composition-scan submission could be labeled as Desktop Worker even though its executor is the PostgreSQL Node lane. Runtime routing is now shared by the contract and router, records `node_job_worker`, and fails closed before billing/job creation when the Node lane is disabled.

## Residual external gates

- Browser conflict dialog, responsive/a11y evidence, real Worker execution, Windows installer/runtime parity, deployment migration rehearsal, and production rollback need an authenticated target environment.
- Artifact storage upload and Library linking are represented by the verified commit gate, but target storage integration still needs environment-backed proof before rollout.

No unresolved local MUST_FIX or MUST_DO_NOW finding remains in the reviewed implementation boundary.
