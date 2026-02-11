# Implementation Plan - Security Hardening (Library / Document Management / Admin Gallery)

## Objective
Implement security hardening for library/document/media preview surfaces without breaking external image workflows. External `https://` image usage must keep working in preview, markdown rendering, and library/media thumbnail scenarios.

## Non-Negotiable Constraints
- Preserve safe external image behavior.
- Enforce security at server trust boundaries (mutation + proxy + file serving).
- Avoid cross-tenant side effects for ops in tenant-admin context.
- Enforce strict tenant attribution for operational entities after migration cutover (no tenant-admin global fallback).
- Ship with security regression tests before release.

## Workstream 1: Shared URL Policy Contract
Create one server-side URL policy module used by all library URL write paths.

### Policy contexts
- Library source URL (`sourceUrl`)
- Library thumbnail URL (`thumbnailUrl`)
- Markdown image/link insertion validation (server-side guard where applicable)
- Preview/office-embed eligibility classification

### Policy matrix
Allowed:
- Relative local app path (for example `/uploads/...`)
- Public external `https://...`

Blocked:
- `javascript:`, `vbscript:`, `file:`
- Unapproved `data:` forms
- Malformed URLs / unsupported protocols
- Internal/private/local host targets for contexts that must be public-only

### Integration points
- `library.createItem`
- `library.updateItem`
- media-to-library insertion path
- any future API path storing source/thumbnail URLs

### Output behavior
- Consistent validation errors (client-safe error message + audit signal).

## Workstream 1.1: Legacy URL Data Migration (`library_items`)
Apply migration and cleanup for existing `source_url` / `thumbnail_url` rows so pre-existing unsafe values are remediated.

### Migration phases
- Dry-run audit report:
  - classify rows as `valid`, `needs_normalization`, `blocked`.
  - summarize by tenant and item type.
- Normalization pass:
  - normalize URL formats where safe (for example trimming, canonicalization).
- Enforcement pass:
  - quarantine blocked values (`source_url`/`thumbnail_url` nullification or controlled replacement marker).
  - write migration metadata/audit trail for rollback and forensics.

### Safety constraints
- Migration must be reversible (snapshot/export before write).
- Migration must not break valid external `https://` image URLs.

## Workstream 2: Active-Content Upload Protection
Neutralize executable upload types while preserving normal media/document upload behavior.

### Target classes
- Active-content file types (for example HTML/HTM and equivalent script-capable payloads).
- SVG requires dedicated handling because inline preview is required.

### Mitigation behavior
- Force non-executable delivery for active-content uploads (attachment/download semantics and restrictive headers).
- Keep safe preview types inline where appropriate.
- Keep SVG preview inline by default, with strict sanitization/validation pipeline for uploaded SVG content.
- If SVG fails sanitization/validation, block inline rendering and fall back to safe download behavior.
- Preserve external image URL behavior unchanged.

### Deferred enhancement
- Optional future migration to isolated asset domain for stronger origin separation.

## Workstream 3: Tenant-Safe Feature Gating
Harden allowlist behavior.

### Required change
- When tenant allowlist is configured and tenant context is missing, deny by default.

### Compatibility
- Explicitly allowlisted tenants continue working.
- Existing same-tenant flows remain unaffected.

## Workstream 4: Tenant-Scoped Ops (Phased)

### Phase 1 (Immediate hardening)
- Pass tenant scope through ops service interfaces.
- Apply tenant filters for all entities that already have tenant fields (especially library index jobs).
- For callback tables lacking tenant field, enforce restricted pathway:
  - explicit elevated role requirement for global actions
  - explicit audit markers that operation is global-scoped
  - tenant-admin routes deny operations when tenant scope cannot be established

### Phase 2 (Schema evolution)
- Add required tenant attribution to callback event/DLQ records (`tenant_id` required for tenant-facing ops).
- Backfill safely from linked entities when possible, with reconciliation report for unresolved rows.
- Quarantine unresolved rows from tenant-admin retries/reprocess until attributed.
- Remove global fallback paths from tenant-admin operations once cutover is complete.
- Keep intentionally global operations only on explicit super-admin routes with mandatory audit fields.

### Phase 2 implementation mechanics (required)
- DB migration must follow phased constraint enforcement:
  1. add nullable `tenant_id` + supporting index
  2. backfill in batches
  3. run reconciliation validation queries
  4. enforce `NOT NULL`/FK constraints for tenant-facing rows
- Backfill execution must be idempotent and lock-protected:
  - migration advisory lock (or equivalent)
  - rerunnable batch cursoring/checkpoints
  - safe resume after interruption
- Quarantine playbook must be explicit:
  - unresolved rows moved/marked for quarantine queue
  - excluded from tenant-admin operations by default
  - ownership + SLA for remediation documented

### API contract split (required)
- Separate service/router contracts for:
  - tenant-admin operations (strict tenant scope only)
  - super-admin global operations (explicit endpoint + elevated role + audit fields)
- Remove mixed behavior in a single endpoint to reduce privilege ambiguity.

### Delivery requirement
- Phase 2 is required in this implementation cycle (not deferred).
- Phase 2 cutover requires explicit readiness checklist: migration complete, reconciliation report reviewed, tenant-admin fallback removed.

## Workstream 5: Safer Office Preview Decision Logic
Tighten preview host checks before forwarding URLs to external office viewer.

### Required behavior
- Block private/local/internal targets comprehensively (not only localhost variants).
- Permit safe public URLs.
- Provide deterministic fallback UI to open file directly when blocked.

## Workstream 6: External Image Proxy Hardening (Feature Preserved)
Keep proxy available but safer.

### Hardening controls
- Request timeout
- Maximum response size
- Redirect safety validation with destination re-check
- Image-only content-type enforcement
- Private/internal host blocking

### Compatibility
- Media Studio and preview flows using external `https://` images remain functional.

## Workstream 7: Security Regression Test Plan
Add tests across server + UI utility boundaries.

### Test ownership map
- URL policy unit tests (policy module)
- Router/service mutation tests for `createItem` / `updateItem` URL validation
- Upload behavior tests for active-content response handling
- Feature-flag tests for missing tenant in allowlist mode
- Ops service/router tests for tenant scoping and global-action restrictions
- Tenant attribution cutover tests (deny on missing tenant attribution in tenant-admin paths)
- Office preview host classification tests
- Image proxy tests for timeout/size/redirect/content-type/host-blocking

### Required positive regressions
- External `https://` image URL still accepted and previewable.
- External markdown image link still renders.

### Required negative regressions
- Unsafe schemes rejected.
- Active-content execution path blocked.
- Missing tenant denied in allowlist mode.
- Cross-tenant ops side effects prevented in tenant-admin mode.
- Tenant-admin retry/reprocess denies rows lacking tenant attribution after cutover.

## Workstream 8: Security Observability and Canary Release Checks
Add production-grade observability and rollout checks for attribution hardening.

### Observability baseline
- Emit structured events/metrics for:
  - missing-attribution deny decisions
  - cross-tenant deny decisions
  - quarantine queue size and remediation latency
  - explicit global-route invocations (super-admin only)
- Define quarantine retention and purge policy:
  - retention window for unresolved rows and audit records
  - scheduled purge/archive process with compliance-safe audit trail
  - alert thresholds for abnormal quarantine growth

### Canary checks
- Add pre-release and canary smoke checks for representative tenants:
  - tenant-admin retries succeed only for same-tenant attributed rows
  - unresolved rows remain blocked/quarantined
  - super-admin global route remains explicit and audited

## Execution Order
1. Implement shared URL policy contract.
2. Run legacy URL migration dry-run, then normalization/enforcement migration for `library_items`.
3. Wire policy into library/media mutation paths.
4. Apply active-content upload protection (including SVG inline-safe path).
5. Fix tenant allowlist missing-context behavior.
6. Implement tenant-ops phase 1 safeguards.
7. Implement tenant-ops phase 2 schema evolution and backfill.
8. Execute tenant attribution cutover checklist and disable tenant-admin global fallback.
9. Harden office preview host logic.
10. Harden image proxy runtime controls.
11. Add full security regression tests.
12. Run observability + canary checks and capture rollout evidence.

## Verification and Release Gate
Release only when all are true:
- Security regression suite passes.
- Existing baseline tests for library/document/media still pass.
- Manual checks confirm external image behavior is intact.
- Audit logs show expected blocked/denied events for security negatives.
- Legacy URL migration report is complete and post-migration verification passes.
- Tenant-ops Phase 2 migration/backfill is complete and validated.
- Tenant attribution reconciliation report has no unresolved rows in tenant-admin scope (or unresolved rows are quarantined with explicit sign-off).
- Tenant-admin operational paths confirmed to have no global fallback.
- Observability dashboard/metrics for attribution enforcement are active and reviewed.
- Canary validation report passes for representative tenants before full rollout.
- Quarantine growth/retention alerts are configured and verified in pre-release checks.

## Rollback Strategy
- Keep hardening changes behind granular toggles where practical (policy strictness, ops global restrictions).
- If production regressions appear, rollback by feature toggle or revert scoped module changes while preserving logging for forensic review.
- Document exact rollback path in release notes before deploy.
- For DB constraints, rollback plan must be phased (disable strict reads -> relax constraint -> restore from snapshot if needed).

## Out of Scope
- Full media platform redesign.
- Removing external media URL support.
- Unrelated UI refactor beyond security-driven preview decision updates.
