# Section 03 — Immutable execution snapshot and admission

## Objective

Admit an editor operation only after server revision validation, immutable
snapshot creation, exact asset/source binding, idempotency, billing, job link,
and outbox publication are prepared through one transaction-safe service.

## Files and ownership

- Add `apps/web/server/services/videoEditorExecutionAdmission.ts`.
- Add focused admission tests.
- Update `apps/web/server/routers/editorMediaJobs.ts` to call the service.
- Reuse existing `worker_job_outbox` and Feature 184 project-job tables. Add
  the dedicated immutable `video_editor_execution_snapshots` table with
  tenant/project/revision/hash/source/policy/capability fields, unique
  `(tenantId, idempotencyKey)`, and indexes for project/revision/job lookup;
  add the Drizzle migration and journal metadata in the repository's next
  migration slot.

## Behavior

- Input includes logical operation, project/revision, idempotency key, asset
  refs, capability/locality, policy, and billing envelope.
- Server reloads revision inside the transaction; browser `inputs.project` is
  compatibility-only.
- Snapshot stores canonical document/hash, source fingerprints, policy,
  capability profile, contract version, and tenant binding.
- Duplicate idempotency returns the existing job/snapshot without duplicate
  billing or outbox publication.
- Stale revision, missing asset, unsupported capability, and billing failure
  produce explicit failures with no orphan successful row.

## TDD and acceptance

Cover transaction order, duplicate submission, source/revision staleness,
outbox retry, refund, asset ownership, tenant isolation, and direct-insert
regression. The router does not claim snapshot readiness until all links exist.

## UI/UX Contract

### Target User / JTBD
Editor needs to know why an operation is queued, blocked, or admitted.

### Surface Inventory
AI operation status, job details, billing/asset validation messages.

### Component Map
Admission service owns outcomes; router serializes them; Web status panel
renders them.

### State Matrix
Admitted, duplicate, stale, asset-invalid, capability-blocked, billing-failed,
waiting-agent, and focusable retry.

### Responsive Matrix
Mobile reason-first; tablet/laptop status plus retry; desktop detailed snapshot
metadata.

### Accessibility Acceptance
Status is announced through a live region and includes actionable text and
semantic retry/cancel controls.

### Copy Contract
Never call admission queued/completed; Thai-first reasons with English fallback.

### Browser Evidence Required
Authenticated admission outcomes for valid, stale, blocked, and waiting-agent.
