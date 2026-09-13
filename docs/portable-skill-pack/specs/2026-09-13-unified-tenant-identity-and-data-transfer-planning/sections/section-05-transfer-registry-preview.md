# Section 05 — Transfer handlers, preflight, and approval

## Scope

Implement explicit resource-handler registration and a non-mutating preview/approval flow for transfer from `sourceUserId` to `targetUserId` inside one active tenant. The handler registry is the completeness authority for every selected terminal job-linked resource.

## Files and boundaries

- `apps/web/server/services/tenantTransferHandlers.ts`: allowlisted handler registry, versions, ownership/dependency/conflict policy, managed-storage strategy, and terminal-job eligibility.
- `apps/web/server/services/tenantDataTransfer.ts`: preview fingerprint, immutable plan snapshot, approval, and item creation.
- Drizzle transfer preview/plan/item tables from section 01; never add a generic `jobs` table.

## Handler contract

Each registered handler declares resource kind/version, an explicit allowlisted supported-format set where applicable, source ownership query, target-user ownership/access fields, dependency ordering, storage/reference validation, preview metadata, conflict key, copy/link strategy, terminal-job policy, and bounded redaction. Initial coverage includes images, videos, supported-format files, Series, Presentations, Storyboards, projects/workflows, completed artifacts/results, and every terminal job-linked type with a safe handler. Unsupported discovered types/formats must appear explicitly in preview/results.

Successful transfer changes only approved target-user ownership/access fields. It preserves tenant ID, primary keys, original creator/execution actors, canonical job ID, event history, billing/usage references, and immutable managed artifact identity. If authorship and target access cannot be separated safely, return a conflict; never rewrite audit meaning.

## Preview

Accept distinct source and target users, selected resource IDs/categories, and a request idempotency value. Scope that request key to the tenant and canonicalized source/target/selection; reuse with different input returns `IDEMPOTENCY_CONFLICT`. Derive tenant from the authenticated account. Require caller `domain_admin`/Tenant Admin scope and verify source/target users belong to the same active tenant. Validate ownership, handler version, supported format, storage key, foreign keys, parent-child order, composite uniqueness, slugs/names, conflict keys, terminal status, and active job state. Automatically enumerate all source-owned canonical jobs in `pending`, `queued`, and `retry_scheduled` state covered by registered bindings; queue cancellation is mandatory, not an optional selection.

Return a bounded immutable preview containing fingerprint/expiry, counts and a cursor page of items grouped as transferable, excluded financial/security data, `queue_cancelled` candidates, active-work blockers, conflicts, unsupported handlers, and invalid/missing references. Persist the complete snapshot in `tenant_data_transfer_previews` plus `tenant_data_transfer_preview_items`; `listPreviewItems` exposes the remaining pages without exposing secrets. Preview performs no data mutation, queue cancellation, credit charge, provider call, or artifact publication, and approval fingerprints the complete snapshot so it cannot drift from the reviewed selection.

## Approval

Require preview fingerprint, source/target users, same-tenant validation, typed/explicit confirmation, and action idempotency key. Refuse stale preview, changed selection, changed target, unauthorized caller, or changed handler/version. In one transaction create exactly one canonical Feature 186 job (`jobType = tenant_data_transfer`), set `operationId` to that `worker_jobs.id`, create the immutable plan snapshot, item rows, and outbox intent. Duplicate approval returns the original operation.

## Tests before implementation

- Registry allowlist/version/dependency/storage/terminal coverage and explicit unsupported report.
- Source/target user same-tenant and role authorization tests.
- Preview non-mutation, ownership, active-job, conflict, exclusion, bounded-output, and fingerprint-expiry tests.
- Preview request idempotency and `ACTIVE_JOB_BLOCKED` approval tests prove no partial transfer begins around active work.
- Approval immutability, one canonical job/outbox, duplicate request, stale preview, no-overwrite, and no-credit/provider-side-effect tests.

## UI/UX Contract

### Target User / JTBD

Tenant Admin previews source/target user work before approval.

### Existing Pattern Reference

Reuse media/library/project selection and admin confirmation patterns; diverge only for preview-first categories and explicit unsupported/queue-killed reporting. Full details are in section 07.

### Surface Inventory

`TenantDataTransfer.tsx`, `TransferResourceSelector`, and `TransferPreviewPanel`.

### Component Map

The selector chooses users and resources; the preview panel shows fingerprint, categories, counts, blockers, conflicts, and `queue_cancelled` items.

### State Matrix

Loading, empty, preview success/error, stale, conflict, unsupported, and approval-disabled states are required; details are in section 07.

### Responsive Matrix

Support mobile 390x844, tablet 768x1024, desktop 1440x900, and the extended dense-table viewports in section 07.

### Accessibility Acceptance

Use semantic controls, a complete keyboard path, visible focus, sufficient contrast, and reduced-motion behavior; section 07 owns the detailed checks.

### Copy Contract

Provide Thai/English copy for preview, exclusion, `queue_cancelled`, conflict, and unsupported outcomes; section 07 owns the shared wording.

### Browser Evidence Required

Section 07/08 captures fake-adapter preview and approval evidence at the required viewports.
