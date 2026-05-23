# Review Findings

## Post-Completion Review - 2026-05-22

### Round 1
- Security review: FAIL.
  - Cross-user same-tenant overwrite risk in new ProductionSpace upsert.
  - Legacy data loss risk from overwriting run projection fields.
  - Optional `expectedVersion` stale-write bypass.
  - Denylist export redaction risk.
  - Space unique key included `userId`.
- Frontend review: FAIL.
  - Provider/settings controls still visible in Production/Video Shot.
  - Audio sub-tabs visible when previous active tab was audio.
  - Video Shot received no `ProductionSpace`.
  - Production inputs needed accessible labels.

### Fixes Applied
- Added owner guards before new and legacy production run upserts.
- Required `expectedVersion` for new mutating ProductionSpace procedures.
- Changed export redaction to allowlist mapping.
- Restored space version uniqueness to `(tenantId, productionRunId, version)`.
- Hid prompt/settings/provider controls and audio subtabs on Production/Video Shot.
- Passed plan/fixture space into Video Shot and preserved empty no-shot state.
- Added labels for Production title/goal controls.

### Final Round
- Security re-review: PASS.
- Frontend re-review: PASS.
- Gates rerun after fixes:
  - `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
  - `npm --prefix apps/web test -- shared/mediaProduction.test.ts shared/geminiOmni.test.ts`
  - planner/verifier/Gemini skill verify scripts
  - `git diff --check`

### Stop Reason
Convergence criteria passed for the implemented Feature 116 MVP/contracts scope. Browser automation remains skipped and recorded in `ui-browser-evidence.md` and `orchestra/backlog.md`.

## Continuation Review - 2026-05-22T13:08:27Z

### Round 1
- Security tRPC review: FAIL.
  - Export redaction still retained `providerPayloadKey`.
  - Export redaction mapped `claimEvidence` wholesale, allowing extra runtime keys from untrusted payloads.
- Frontend review: FAIL.
  - Planning button/copy could imply zero LLM spend and did not disable during planning.
  - Canvas list fallback selected nodes but could not connect nodes with keyboard-accessible controls.
  - Production project thumbnail rendered without URL normalization.
  - Delete Draft lacked a confirmation guard.
- Completeness convergence review: PASS for continuation MVP/contracts scope with documented residual browser/a11y/live-execution risks.

### Fixes Applied
- Removed `providerPayloadKey` from export and deep-allowlisted product `claimEvidence`.
- Added regression assertions for provider payload and raw claim evidence redaction.
- Clarified planner/verifier LLM credits versus generation-provider credits and disabled plan creation while pending.
- Added Start link / Connect here controls to the node list fallback.
- Normalized project thumbnails through `normalizeTaskMediaUrl` before rendering.
- Added `window.confirm` before Delete Draft lifecycle mutation.
- Extended deterministic evidence test to cover list fallback controls, thumbnail normalization source guard, and delete confirmation source guard.

### Final Round
- Security re-review: PASS.
- Frontend re-review: PASS.
- Gates rerun after fixes:
  - `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
  - `npm --prefix apps/web run e2e:production-director`
  - `npm --prefix apps/web test -- server/services/__tests__/productionSpaceService.test.ts shared/mediaProduction.test.ts shared/geminiOmni.test.ts`
  - planner/verifier/Gemini skill verify scripts
  - `git diff --check`

### Stop Reason
Convergence criteria passed for Feature 116 continuation MVP/contracts scope. Remaining risks are documented and limited to missing Playwright/browser screenshots, real console capture, axe/WCAG report, and live provider execution progress/retry/cancel/credit lifecycle.

## Missing Gap Implementation Review - 2026-05-22T14:39:00Z

### Round 1
- Browser/a11y review: PASS after Playwright evidence added.
- Backend/security review: CONDITIONAL.
  - Provider dispatch initially needed terminal task-to-node reconciliation hardening for skipped preview/disabled nodes.
  - Router payload schemas still contained broad untrusted payload acceptance.

### Fixes Applied
- Added task-to-node reconciliation by existing output-ref `mediaTaskId` before index fallback.
- Added regression coverage for skipped preview nodes during reconciliation.
- Tightened Feature 116 router Zod schemas and removed broad `z.any()` usage from the touched router/service/shared surface.
- Refreshed real Chromium evidence artifacts for 390/768/1280/1440 viewports, light/dark, reduced motion, focus/hover/selected, console capture, overflow/overlap checks, and axe reports.

### Final Round
- Browser/a11y re-review: PASS.
- Security re-review: no critical/high findings remaining for the implemented Feature 116 surface; local grep confirms no `z.any()`/`z.record(z.any())` in touched Feature 116 router/service/shared files.
- Gates rerun after fixes:
  - `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check`
  - `npm --prefix apps/web test -- server/services/__tests__/productionSpaceService.test.ts shared/mediaProduction.test.ts shared/geminiOmni.test.ts`
  - `npm --prefix apps/web run e2e:production-director`
  - `npm --prefix apps/web run e2e:production-director-browser`

### Residual Risk
- `npm --prefix apps/web audit --audit-level=high` remains failing due broader dependency-tree vulnerabilities outside this feature slice.
- Browser evidence now includes deterministic Chromium fixture coverage plus authenticated `/media-studio` route screenshots with mocked auth/tRPC data.

## Completeness Audit - 2026-05-22T14:47:33Z

### Verdict
- Overall: READY for Feature 116 implementation scope; high/critical dependency audit blocker is now closed.

### Still Missing / Partial
- No high/critical implementation or release-gate gaps remain for the audited Feature 116 scope. Remaining audit advisories are moderate dev-toolchain maintenance items that require semver-major upgrades.

### Confirmed Implemented
- Provider dispatch path, media/provider task refs, output attach, cancel/reconcile endpoint, and service-level tests exist.
- Provider callback reconciliation, pending execution polling, and credit ledger verification hooks exist with service/router tests.
- Credit reserve/refund bookkeeping exists for dispatch failure, cancellation, terminal reconcile, ledger mismatch metrics, and alert summaries.
- Owner plus collaborator read/write/approve/execute ACL checks exist with regression tests.
- Shared execution state transitions are enforced by scheduler/cancel/reconcile paths.
- DB-backed router integration covers run/cancel/callback reconcile paths.
- Playwright Chromium evidence covers 390/768/1280/1440, light/dark, console/page errors, overflow/overlap, hover/selected/focus, reduced motion on every viewport, advanced states, icon accessible names, axe no-violation reports, and authenticated `/media-studio` route screenshots.
- Production pending-execution reconciliation is wired into startup scheduler with a short-lived media token resolver and in-flight guard.
- Cloud Scheduler / Cloud Tasks reconciliation endpoint and provisioning validation now exist for serverless production deployments.
- Dependency audit high/critical gates now pass for root, apps/web, docker-status, and api-generator.

### Review Evidence
- Superseded reviewer findings from the first audit round were resolved by the later gap-closure implementation below.
- Current spec/plan verdict: PASS for Feature 116 core acceptance, with production rollout checklist and dependency audit handled as release gates.
- Current browser/a11y verdict: PASS with live authenticated `/media-studio` route evidence, required viewport screenshots, axe reports, and console capture.
- Current backend/runtime verdict: PASS for provider callback/pending reconciliation, credit lifecycle bookkeeping, shared ACL, and production reconciliation runtime paths.

## Gap-Closure Implementation Review - 2026-05-22T15:04:46Z

### Fixes Applied
- Added provider callback reconciliation and pending execution reconciliation service paths.
- Added credit ledger verification hooks, mismatch metrics, and alert summaries.
- Enforced shared production state transitions in schedule/cancel/reconcile execution paths.
- Added router integration tests for run/cancel/callback reconcile.
- Expanded Chromium evidence to 12 runs with reduced-motion on all required viewports, advanced state proof, and icon accessible-name proof.

### Gates Rerun
- `npm --prefix apps/web test -- server/services/__tests__/productionSpaceService.test.ts server/routers/__tests__/mediaProduction.execution.test.ts shared/mediaProduction.test.ts shared/geminiOmni.test.ts` — 43/43 passed.
- `npm --prefix apps/web run e2e:production-director` — 12/12 passed.
- `npm --prefix apps/web run e2e:production-director-browser` — 12/12 passed; summary has 0 axe violations, 0 console/page errors, advanced states true, icon labels true.
- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — passed.
- Skill verify scripts and `git diff --check` — passed.

### Remaining External / Rollout Notes
- Provider-backed execution requires production flags, credentials, Cloud Scheduler reconciliation, and a low-cost staging smoke before paid provider dispatch is widened.
- Moderate dev-tool audit items remain and should be handled in a separate semver-major toolchain maintenance pass.

### Post-Fix Reviewer Results
- Backend/runtime/security reviewer: PASS for Feature 116 implementation surface; no Critical or High implementation findings remain.
- Browser/a11y reviewer: PASS for automated evidence; 16/16 browser runs pass with 0 axe violations and 0 console/page errors.

## Completeness Audit - 2026-05-23

### Verdict
- Overall: MVP implementation foundation is strong and current targeted gates pass, but the full Feature 116 spec should not be marked fully complete until backend adapter/capability enforcement and router security matrix gaps are closed.
- Spec/plan state: section manifest is complete (16/16), and MVP vs deferred full-matrix boundary is documented.

### Confirmed Implemented
- Shared ProductionSpace contracts, readiness/validation helpers, feature gates, node catalog with MVP/deferred statuses, planning selection, and downstream result import types.
- Versioned `media_production_spaces` persistence, additive migration, legacy read adapter, archive/restore/delete/export redaction, stale output-ref repair, execution schedule/cancel/reconcile paths, provider callback/pending reconciliation, downstream result import.
- Production Workspace, React Flow canvas/list fallback, Video Shot workspace, Node Config Save-to-Node, Product Evidence Tray, provider/character result surface, planning skill/model/context panel, and deferred node UI.
- Browser evidence artifact records required viewport/a11y/axe/console coverage and mocked authenticated `/media-studio` route coverage.

### Findings
- HIGH: Backend does not yet enforce `PRODUCTION_NODE_CATALOG` adapter status during `saveProductionNodeConfig` or execution scheduling; deferred/preview-only adapters are blocked in UI but not strongly rejected server-side.
- HIGH: Runtime schemas remain broad for security-sensitive ProductionSpace fields (`status`, node/shot `kind`/`status`, `productEvidenceManifest`, `accessPolicy`, downstream records, and `.passthrough()` objects). Shared validation is useful but not yet a strict runtime whitelist.
- MEDIUM: Handoff idempotency uses tenant placeholder `"space"` in `deriveProductionHandoffPayload`; spec should require tenant-scoped idempotency or a server wrapper that injects tenant context before persistence/dispatch.
- MEDIUM: Router security matrix is incomplete for every mutating procedure; strongest new coverage is around downstream import, while save/archive/export/execute/product actions need full unauthenticated/missing tenant/cross-tenant/cross-user/role matrix.
- MEDIUM: Full migration/backcompat acceptance remains partial: additive migration and legacy read adapter exist, but explicit backfill/on-save migration, rollback/read-safe, schema-version upgrade preservation tests are not complete.
- MEDIUM: Full execution UX panels for confirm/progress/failure/retry/reconcile are not complete as first-class UI surfaces; backend paths exist and UI has flag-gated/preview evidence.

### Gates Run
- `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/116-production-director-node-canvas` — complete, 16/16 sections.
- `npm --prefix apps/web test -- server/services/__tests__/productionSpaceService.test.ts server/routers/__tests__/mediaProduction.execution.test.ts server/jobs/__tests__/productionExecutionReconciliationJob.test.ts shared/mediaProduction.test.ts shared/geminiOmni.test.ts client/src/features/media-production/production-director.e2e.test.tsx` — 6 files, 70 tests passed.
- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — passed.

### Recommended Spec Additions
- Add an explicit backend gate: Save-to-Node and execution must reject deferred/preview-only/disabled node kinds and adapter mismatches against `PRODUCTION_NODE_CATALOG`.
- Add runtime schema-hardening acceptance criteria for ProductionSpace router payloads and server sanitizers.
- Add tenant-scoped handoff idempotency and Storyboard Review / Video Edit compatibility fixtures.
- Add a per-procedure router authorization matrix to Section 12/16, not just a generic rule.
- Add a full-spec gap ledger separating MVP complete, release-gated, and explicitly deferred items.

## Gap-Closure Implementation - 2026-05-23

### Fixes Applied
- Added shared catalog validation helpers and server enforcement for Save-to-Node and execution scheduling.
- Tightened Feature 116 router schemas for node kind/status, shot status, product evidence manifest, access policy, and tool binding metadata.
- Scoped handoff idempotency keys by tenant on router/service preview paths.
- Added mutating-procedure missing-tenant and cross-user regression coverage across the ProductionSpace router surface.
- Added collaborator read/write/execute role-boundary tests.
- Added deterministic legacy adapter and schema read-safety tests, including future-schema safe refusal with payload preservation.
- Added Production execution status panel copy for confirm, progress, failure/retry, and reconcile states.
- Updated spec, section packets, implementation plan, browser evidence, backlog, and progress artifacts.

### Gates Rerun
- `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/116-production-director-node-canvas` — complete, 16/16.
- `npm --prefix apps/web test -- server/services/__tests__/productionSpaceService.test.ts server/routers/__tests__/mediaProduction.execution.test.ts server/jobs/__tests__/productionExecutionReconciliationJob.test.ts shared/mediaProduction.test.ts shared/geminiOmni.test.ts client/src/features/media-production/production-director.e2e.test.tsx` — 6 files, 78 tests passed.
- `NODE_OPTIONS='--max-old-space-size=8192' npm --prefix apps/web run check` — passed.

### Verdict
- Previously identified Feature 116 completeness gaps are closed for the current implementation scope.
