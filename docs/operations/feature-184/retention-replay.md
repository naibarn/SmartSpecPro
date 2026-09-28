# Feature 184 retention and replay

Retention values are deployment configuration and must be recorded with an owner and data-residency/legal override. The required keys are `sourceRetention`, `artifactRetention`, `diagnosticRetention`, `replayWindow`, and `orphanUploadTtl`.

## Cleanup rules

- Keep source media, immutable project revisions, exact render plans, approved overlays, runtime references, and verified artifacts through the declared replay window.
- After a terminal job reaches its retention boundary, remove only eligible caches, orphan multipart uploads, and intermediates. Do not remove project originals or referenced outputs.
- A project delete/archive request is blocked while an active job exists unless the explicit cancel policy wins and the server writes a tombstone plus authorization audit.
- Tombstones prevent a late Worker callback from recreating an asset, publication, or Library link.

## Replay rules

- Replay creates a new linked `worker_jobs` record with `replayOfJobId`, a new attempt, and the original contract/plan hash retained for audit.
- Label the result `exact` only when input hashes, runtime/tool versions, provider, and authorized storage locality match. Otherwise label it `equivalent` and state why bit-identical output is unavailable.
- If an input, runtime, or storage pool is expired or unavailable, return an explicit blocked reason; never silently substitute a public URL or an unapproved worker.
- Paid replay repeats preflight, authorization, estimate, and credit approval. Infrastructure retry and duplicate callbacks never create another reservation.

## Evidence

Each cleanup or replay drill records tenant scope, project/job/replay IDs, revision and plan hashes, retention values, authorization decision, tombstone result, artifact publication key, and redacted diagnostics. Production execution remains blocked until the database dry-run, eligible Worker fixture, and billing/provider evidence are attached.
