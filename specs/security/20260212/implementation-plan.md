# Implementation Plan

Date: 2026-02-12  
Scope: `apps/web` TypeScript remediation to zero errors  
Delivery model: Single batch delivery (`4B`) with mandatory internal phase gates

## 1) Implementation Strategy

งานจะส่งเป็นก้อนเดียว แต่ลำดับแก้ต้องทำตาม dependency chain เพื่อลด regression:

1. Foundation config and resolution
2. Core contract fixes (import/env/dependency/type shape)
3. tRPC/client type recovery
4. Strict cleanup by hotspot clusters
5. Full verification and release gate

หลักการคุมคุณภาพ:
- Fix root cause before symptom cleanup
- No broad unsafe casts
- Keep tenant/auth/url-safety behavior stable
- Add explicit rollback readiness for single-batch rollout

## 2) Detailed Execution Plan

## Phase 0: Baseline Snapshot and Guard Setup

Goals:
- Capture current error baseline and affected file map
- Freeze acceptance target and safety constraints

Actions:
- Run `npm run check -- --pretty false` and store outputs under planning artifacts
- Parse counts by error code and by file
- Record files related to tenant/security (`library`, `media`, `systemSettings`, `trpc`, `env`)
- Create machine-readable baseline JSON report (`reports/typescript-baseline.json`)

Exit criteria:
- Baseline report available and reproducible

## Phase 1: Foundation Resolution Fix

Goals:
- Eliminate global module-resolution breakages driving cascading failures

Actions:
- Update `apps/web/tsconfig.json` to align with base project config
- Ensure compiler target/lib support modern iteration and regex flags used by code
- Add/verify paths for:
  - `@server/*`
  - `@smartspec/ui/src/*`
- Keep existing app aliases (`@`, `@shared`, `@db`) intact
- Re-run typecheck and confirm `TS2307`/downstream `TS2305` drops significantly

Phase error budget gate (must pass before Phase 2):
- `TS2307` must be reduced to near-zero root-cause remnants only
- `TS2305` must show substantial reduction attributable to alias recovery
- Gate result recorded in `reports/typescript-phase-1.json`
- Hard-stop rule: if this gate fails, do not proceed to Phase 2.

Exit criteria:
- Wrapper imports resolve
- `@server/routers` resolves from client type imports
- Phase 1 sign-off recorded

## Phase 2: Contract and Dependency Corrections

Goals:
- Fix hard contract mismatches blocking server typing

Actions:
- Fix `server/routers/factory.ts` import path to current trpc helper location
- Extend `server/_core/env.ts` with required keys used by storage integration:
  - `forgeApiUrl`
  - `forgeApiKey`
- Add missing dependency type packages when required by imports (e.g. `@types/pg`)
- Fix `systemSettings` tenantId input handling to respect varchar tenant schema contract
- Fix insert/update payload shape mismatches in routers where schema fields diverge
- Introduce one canonical tenantId normalization utility for varchar tenant contracts and define allowed boundary usage map (where normalization is mandatory vs forbidden).

Phase error budget gate (must pass before Phase 3):
- no unresolved env contract errors
- no missing declaration error for approved dependencies
- tenantId overload/type mismatch errors reduced to manageable residuals
- Gate result recorded in `reports/typescript-phase-2.json`
- Hard-stop rule: if this gate fails, do not proceed to Phase 3.

Exit criteria:
- No unresolved env field references
- No missing declaration errors for approved dependencies
- TenantId query/update type mismatch errors significantly reduced

## Phase 3: tRPC and UI Type Recovery

Goals:
- Recover end-to-end typing for admin/media/chat UI and API callers

Actions:
- Validate `client/src/lib/trpc.ts` generic typing path and propagated API types
- Recheck UI wrapper exports after alias repair
- Resolve remaining “property does not exist” cascades caused by broken upstream types

Phase error budget gate (must pass before Phase 4):
- no major tRPC unknown-type cascade in admin/media/chat pages
- `TS2339` drop confirms upstream contract recovery
- Gate result recorded in `reports/typescript-phase-3.json`
- Hard-stop rule: if this gate fails, do not proceed to Phase 4.

Exit criteria:
- tRPC hook typings compile in affected pages
- major `TS2339` cascade from unknown modules resolved

## Phase 4: Strict Cleanup (Hotspot-driven)

Goals:
- Remove remaining strict errors without weakening type safety

Execution order:
1. `client/src/pages/Admin*`, `MediaStudio.tsx`, `ComponentShowcase.tsx`
2. `client/src/components/chat/*`
3. `server/services/*` and high-churn routers

Actions:
- Replace implicit-any parameters with exact types
- Add runtime guards where input is `unknown`
- Correct overloaded function calls by aligning argument shapes
- Normalize tenantId typing at boundaries (string contract where schema is varchar)
- Apply canonical tenantId normalization utility only at approved boundaries and prohibit ad-hoc per-file normalization logic.
- Avoid `as any` except tightly justified boundary cases

Unsafe-bypass hard gate (U1):
- No new `@ts-ignore`, `@ts-nocheck`, or blanket lint-disable directives unless fully justified inline with issue reference.
- Any newly introduced `any` must be counted and justified in remediation report.

Phase error budget gate (must pass before Phase 5):
- residual strict-error families (`TS7006`, `TS2322`, `TS2345`, `TS2554`, `TS18046`, `TS18047`) converge to zero
- Gate result recorded in `reports/typescript-phase-4.json`
- Hard-stop rule: if this gate fails, do not proceed to Phase 5.

Exit criteria:
- Strict error families converge to zero
- Unsafe bypass gate passes

## Phase 5: Final Verification and Release Gate

Goals:
- Prove zero-error result and no security/tenant regression

Actions:
- Run full `apps/web` typecheck gate
- Run deterministic sensitive test subset:
  - `vitest run server/routers/library.test.ts`
  - `vitest run server/routers/media.addToLibrary.test.ts`
  - `vitest run server/services/libraryOpsTenantAttributionService.test.ts`
  - `vitest run server/services/libraryUrlPolicy.test.ts`
  - `vitest run server/services/securityRegressionReleaseGate.test.ts`
- Compare final metrics against baseline
- Produce final remediation report:
  - `reports/typescript-final.json`
  - `reports/remediation-matrix.md`
- Add CI assertion rule:
  - pipeline must parse `reports/typescript-final.json`
  - fail build when `total_errors > 0`

Exit criteria:
- `npm run check` == pass (0 errors)
- required sensitive tests pass
- no unresolved high severity security/tenant concerns

## 3) Impact and Regression Map

Likely impacted surfaces:
- Frontend UI wrappers and all pages importing `@/components/ui/*`
- tRPC client/server contracts across admin, media, chat
- Server configuration/env access in storage and integration paths
- Router query/update typing where tenantId schema contracts are strict

Primary regression vectors:
- alias change causing runtime-vs-type mismatch
- tenantId normalization mistakes leading to query behavior changes
- over-aggressive type narrowing dropping valid runtime paths

Regression prevention:
- Gate each phase with focused typecheck deltas
- Run deterministic tests for tenant/library/media/security-critical routes
- Keep behavior-preserving fixes first; defer optional refactors

## 4) Data Safety and Migration Strategy

Data risk classification: `none` (planned scope)

Why `none`:
- Plan does not require schema migration
- Plan does not require data backfill or destructive DB writes
- Scope is TypeScript/config/dependency/code contract remediation

Backup/restore requirement for current scope:
- DB backup/restore is not mandatory for this plan because no DB mutation is planned.

Safety trigger rule:
- If execution discovers required schema/data mutation, stop and reclassify to `low/high` risk before proceeding.
- At that point, require:
  - pre-migration backup
  - migration runbook
  - rollback verification steps

## 5) Backward Compatibility Plan

Compatibility commitments:
- Keep auth/session behavior unchanged
- Keep tenant attribution behavior unchanged except for type correctness enforcement
- Keep URL safety policy behavior intact (including external URL rules)
- Keep current API contracts unless explicit incompatibility is reviewed and approved

If a boundary coercion is needed (e.g., tenantId from mixed input types):
- normalize at boundary only
- keep downstream domain/service contracts stable

## 6) Post-Change Validation

Required validation checklist:
1. Full typecheck pass (`npm run check`)
2. Baseline-vs-final error report attached
3. Targeted tests for tenant/media/library/security paths pass
4. Manual smoke checks on key UI pages with previous high error density:
   - Media Studio
   - Admin Settings
   - Admin Skills
   - Component Showcase
5. Remediation matrix complete (`file cluster -> error classes -> verification result`)
6. Sensitive route behavior parity checklist completed:
   - `library` create/open/rename/search flows behave unchanged
   - `media add-to-library` tenant attribution behavior unchanged
   - `systemSettings` tenant-scoped read/write behavior unchanged
   - `tenant` route authorization behavior unchanged

Acceptance for closeout:
- No TypeScript errors remaining in `apps/web`
- No high-severity regression signals in protected flows

## 7) Rollback and Incident Response (Single-Batch)

Rollback playbook (U2):
1. Trigger condition:
   - post-deploy type/runtime regression in auth/tenant/library/security path
2. Immediate action:
   - revert the single remediation batch commit
   - redeploy previous known-good revision
3. Verification after rollback:
   - auth login/logout smoke
   - media/library critical actions
   - tenant-scoped access checks
4. Ownership:
   - remediation owner + designated on-call reviewer
5. Response window:
   - acknowledge within 15 minutes
   - rollback complete target within 45 minutes

## 8) Artifacts and Traceability

Artifacts to produce:
- `reports/typescript-baseline.json`
- `reports/typescript-phase-1.json`
- `reports/typescript-phase-2.json`
- `reports/typescript-phase-3.json`
- `reports/typescript-phase-4.json`
- `reports/typescript-final.json`
- `reports/remediation-matrix.md`

`reports/remediation-matrix.md` minimum columns:
- file cluster
- dominant error codes
- fixes applied
- validation command
- status

## 9) Sensitive Route Behavior Parity Checklist

For each sensitive route family (`library`, `media`, `systemSettings`, `tenant`), capture:
- representative request/response path before change
- representative request/response path after change
- behavior parity result (`unchanged` / `intentional-change`)
- reviewer and timestamp

## 10) Temporary Unsafe-Type Exception Protocol

If an unavoidable temporary unsafe construct is introduced, it must include:
- explicit reason it is temporarily required
- blast-radius statement (which files/paths are affected)
- owner and removal due date
- follow-up task reference

Without all four fields, the exception is considered invalid and must be rejected in review.

## 11) Ownership and Execution Notes

- Implementation owner: Web platform remediation track
- Review mode: self-review (credential fallback)
- Decision mode: smart_auto
- Release mode: single batch delivery with internal gates
