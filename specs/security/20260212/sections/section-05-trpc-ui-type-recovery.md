# Section 05: tRPC and UI Type Recovery

## Objective
Recover end-to-end type propagation between server `AppRouter` and client hooks/components to collapse `TS2339` cascades.

## Scope
- `apps/web/client/src/lib/trpc.ts`
- router export/type surfaces consumed by client
- high-error UI pages dependent on recovered types

## Preconditions
- Sections 03 and 04 completed.

## Tests First (Pre-implementation stubs)
1. Confirm pre-fix `TS2339`/property-not-found cascades in admin/media/chat hotspots.
2. Confirm `AppRouter` import path and type visibility are intact after section 02 changes.

## Implementation Steps
1. Validate and fix client tRPC generic wiring to `AppRouter`.
2. Ensure server router exports are type-visible via configured alias.
3. Re-run targeted typecheck for major hotspots:
- `client/src/pages/Admin*.tsx`
- `client/src/pages/MediaStudio.tsx`
- `client/src/components/chat/*`
4. Generate phase report:
- `reports/typescript-phase-3.json`

## Verification (Post-implementation stubs)
1. tRPC-driven property/type cascades are reduced or eliminated.
2. Phase-3 hard-stop gate passes.

## Artifacts
- `specs/security/20260212/reports/typescript-phase-3.json`
- updated `reports/remediation-matrix.md`

## Success Criteria
- Client receives stable typed router contracts for targeted hotspots.

## Failure and Recovery
- If tRPC types still collapse, inspect upstream router export and alias resolution before changing component code.
