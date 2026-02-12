# Section 03: Contract Fixes (Import, ENV, Dependencies)

## Objective
Resolve server-side contract breakages: invalid imports, missing ENV fields, and missing type declarations.

## Scope
- `apps/web/server/routers/factory.ts`
- `apps/web/server/_core/env.ts`
- dependency/type declarations in `apps/web/package.json` (or workspace equivalent)
- targeted router/service files with contract mismatches discovered in phase reports

## Preconditions
- Section 02 completed and phase-1 gate passed.

## Tests First (Pre-implementation stubs)
1. Confirm pre-fix errors exist:
- `TS2307` for `server/routers/factory.ts` (`../trpc`)
- `TS2339` for missing `ENV.forgeApiUrl` / `ENV.forgeApiKey`
- `TS7016` for missing declarations (e.g., `pg`)

2. Confirm no runtime behavior change requirement for auth/tenant logic.

## Implementation Steps
1. Fix factory router import path to the actual tRPC helper location (`../_core/trpc`).
2. Extend ENV contract in `server/_core/env.ts` with required forge fields and safe fallback chain.
3. Add required declaration/dependency packages (example: `@types/pg`) when truly missing.
4. Resolve remaining schema-contract drift errors in targeted files (without bypass directives).
5. Generate phase report:
- `reports/typescript-phase-2.json`

## Verification (Post-implementation stubs)
1. No unresolved env-field errors for forge fields.
2. No missing declaration errors for approved dependencies.
3. Contract mismatch family reduced as expected.
4. Phase-2 hard-stop gate passes.

## Artifacts
- `specs/security/20260212/reports/typescript-phase-2.json`
- updated `reports/remediation-matrix.md`

## Success Criteria
- Import/env/dependency contract blockers removed.

## Failure and Recovery
- If dependency addition causes lockfile conflicts, resolve deterministically and re-run gate.
- If env additions create behavior ambiguity, keep values optional with safe defaults and document precedence.
