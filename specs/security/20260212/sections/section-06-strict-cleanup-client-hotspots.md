# Section 06: Strict Cleanup Client Hotspots

## Objective
Eliminate remaining strict typing errors in client hotspots while preserving current UX/runtime behavior.

## Scope
- `apps/web/client/src/pages/Admin*.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/pages/ComponentShowcase.tsx`
- `apps/web/client/src/components/chat/*`

## Preconditions
- Section 05 completed.

## Tests First (Pre-implementation stubs)
1. Snapshot remaining client error families by file:
- `TS7006`, `TS2322`, `TS2345`, `TS2554`, `TS18046`
2. Confirm no unsafe bypass directives are pre-planned.

## Implementation Steps
1. Replace implicit-any parameters with explicit types.
2. Correct mismatched prop/function signatures and argument shapes.
3. Add local runtime guards for `unknown` inputs where required.
4. Keep UI behavior and handler semantics unchanged.
5. Update remediation matrix with each file cluster and fix type family.

## Verification (Post-implementation stubs)
1. Client hotspot files compile without strict errors.
2. No new unapproved `@ts-ignore` / `@ts-nocheck` directives.
3. Any unavoidable `any` is justified via exception protocol.

## Artifacts
- matrix updates in `reports/remediation-matrix.md`

## Success Criteria
- Client strict error families in hotspot group converge to zero.

## Failure and Recovery
- If a fix changes user-facing behavior, revert that change and re-implement using type-safe adapter/guard instead.
