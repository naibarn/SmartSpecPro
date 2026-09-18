# Synthesized Specification — Feature 201

## Outcome

SmartAIHub will provide a tenant-scoped Content Protection workspace that lets
users protect final image/video/audio artifacts, inspect technical provenance,
verify suspected copies, and build evidence packages. The system must connect
the protection record to the exact final artifact and, for compound video, to
the ordered input list, trims, source hashes, project revision, and compound
plan digest.

## Product requirements

1. A top-level `/content-protection` workspace is reachable from the shared
   dashboard menu and from Dashboard quick links.
2. Workspace routes cover overview, protected assets, asset detail, Rights &
   Ownership, certificate, verification input/progress/result, cases, and
   settings. All routes require authentication and tenant scoping.
3. Image, video, and audio appear as distinct modalities. Image detail supports
   SHA-256, invisible image watermark, PDQ, crop/resize alignment, C2PA, and
   evidence; video detail supports video watermark/fingerprint and compound
   lineage. No image signal is silently promoted to a video claim.
4. User choice is resolved as `perExportChoice ?? userDefaultChoice`. The UI
   must show `Digital watermark: ON` or `OFF — disabled by user` before the job
   starts and show the creation/self-verification stages while it runs.
5. A final artifact is `PROTECTED` only after final-byte hashing, invisible
   watermark creation, self-detection, required fingerprint/provenance checks,
   and durable manifest persistence pass. OFF produces an explicit
   `UNPROTECTED_BY_USER_CHOICE` outcome.
6. Web editor render and Vertical Drama final assembly must use the same gate.
   Intermediate clips and input images remain ingredients; the final compound
   output is protected after combination and before publish.
7. API/service boundaries validate modality, source ownership, idempotency,
   stale revision/plan identity, provider result shape, and safe storage keys.
8. Technical verification and legal ownership are different claims. UI copy and
   evidence reports must preserve that distinction.

## Quality and safety requirements

- All data and storage references are tenant-scoped and owner/RBAC checked.
- Long-running work enters `worker_jobs` and `worker_job_outbox`; no retired
  workflow/OpenSandbox/Agency system is introduced.
- Provider secrets never enter client payloads, job results, logs, or evidence
  packages.
- Provider outages and stale artifacts fail closed with actionable status and a
  retry path.
- Idempotent repeat requests return the same protection/verification record.
- Tests cover domain contracts, persistence, RBAC/tenant isolation, compound
  binding, worker state transitions, and UI routes/quick links.

## Implementation boundary

Phase 1 implements the complete user-facing and data/control-plane path using
versioned provider adapters. A provider is considered operational only when its
embed and detect capabilities are present and self-verification succeeds. The
code must not claim a production-strength robustness benchmark merely because a
provider adapter is registered; benchmark evidence remains a stored, explicit
capability result.
