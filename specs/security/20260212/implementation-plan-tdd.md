# Implementation Plan (TDD Companion)

Date: 2026-02-12
Scope: `apps/web` TypeScript remediation
Purpose: Define tests/checks to run before and after each implementation phase.

## Test Environment

- Runtime: `typescript-npm`
- Primary gate: `cd apps/web && npm run check -- --pretty false`
- Sensitive regression subset:
  - `cd apps/web && npx vitest run server/routers/library.test.ts`
  - `cd apps/web && npx vitest run server/routers/media.addToLibrary.test.ts`
  - `cd apps/web && npx vitest run server/services/libraryOpsTenantAttributionService.test.ts`
  - `cd apps/web && npx vitest run server/services/libraryUrlPolicy.test.ts`
  - `cd apps/web && npx vitest run server/services/securityRegressionReleaseGate.test.ts`

## Phase 0: Baseline Snapshot and Guard Setup

### Test stubs (before changes)
- Test: run full typecheck and capture baseline counts by error code and file.
- Test: verify baseline parser generates JSON report (`typescript-baseline.json`) with `total_errors` and top categories.
- Test: verify guard policy checklist exists (unsafe bypass rules + tenant/auth safety constraints).

### Verification stubs (after phase)
- Test: rerun baseline parser to ensure report generation is deterministic.
- Test: confirm report files are readable and machine-parseable JSON.

## Phase 1: Foundation Resolution Fix

### Test stubs (before changes)
- Test: assert `TS2307` appears for `@smartspec/ui/src/*`, `@server/routers`, and `../trpc`.
- Test: assert `TS2305` cascade exists in UI components due to unresolved wrappers.

### Verification stubs (after phase)
- Test: confirm `@smartspec/ui/src/*` module resolution errors are removed.
- Test: confirm `@server/routers` resolution error is removed.
- Test: verify phase-1 report file exists with reduced `TS2307`/`TS2305` counts.
- Test: enforce phase-1 gate before moving to phase 2.

## Phase 2: Contract and Dependency Corrections

### Test stubs (before changes)
- Test: assert `server/routers/factory.ts` invalid trpc import error exists.
- Test: assert `ENV.forgeApiUrl` / `ENV.forgeApiKey` missing field errors exist.
- Test: assert missing declaration/type mismatch errors in `systemSettings` and related router paths.

### Verification stubs (after phase)
- Test: verify factory router import compiles.
- Test: verify env contract errors are resolved.
- Test: verify dependency declaration errors (e.g. `pg`) are resolved.
- Test: verify canonical tenantId normalization utility exists and is used at approved boundaries.
- Test: enforce phase-2 gate before moving to phase 3.

## Phase 3: tRPC and UI Type Recovery

### Test stubs (before changes)
- Test: assert client pages still show tRPC-derived unknown/property errors from upstream breakages.

### Verification stubs (after phase)
- Test: verify tRPC client typing resolves in major admin/media/chat pages.
- Test: verify `TS2339` cascade from unknown APIs is significantly reduced.
- Test: enforce phase-3 gate before moving to phase 4.

## Phase 4: Strict Cleanup (Hotspot-driven)

### Test stubs (before changes)
- Test: capture remaining strict errors (`TS7006`, `TS2322`, `TS2345`, `TS2554`, `TS18046`, `TS18047`).

### Verification stubs (after phase)
- Test: verify strict-error families reduce to zero.
- Test: verify no unapproved `@ts-ignore` / `@ts-nocheck` introduced.
- Test: verify new `any` usage count and justification report exists.
- Test: enforce phase-4 gate before moving to phase 5.

## Phase 5: Final Verification and Release Gate

### Test stubs (pre-final)
- Test: run deterministic sensitive regression subset for library/media/tenant/security routes.

### Verification stubs (final)
- Test: full typecheck returns success (`0` errors).
- Test: sensitive regression subset passes.
- Test: final JSON report (`typescript-final.json`) contains `total_errors = 0`.
- Test: remediation matrix maps each major file cluster to validation status.
- Test: behavior parity checklist is complete for `library`, `media`, `systemSettings`, `tenant`.

## CI/Release Assertions

- Test: CI consumes `typescript-final.json` and fails when `total_errors > 0`.
- Test: CI blocks release if required sensitive tests or parity checklist are missing.

## Exception Protocol Validation

- Test: if temporary unsafe construct exists, verify required metadata:
  - reason
  - blast radius
  - owner + due date
  - follow-up task reference
