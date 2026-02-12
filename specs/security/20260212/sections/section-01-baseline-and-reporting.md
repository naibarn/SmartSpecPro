# Section 01: Baseline and Reporting

## Objective
Create a deterministic TypeScript baseline and reporting scaffolding that every later phase uses as gate evidence.

## Scope
- `apps/web` typecheck baseline capture
- report generator script or command workflow
- planning artifacts under `specs/security/20260212/reports/`

## Preconditions
- Repository dependencies are installed.
- `apps/web` can run `npm run check`.

## Tests First (Pre-implementation stubs)
1. Run:
```bash
cd apps/web && npm run check -- --pretty false
```
Expected: fails with current baseline errors.

2. Validate baseline parser/report command can output JSON with keys:
- `total_errors`
- `codes`
- `top_files`

3. Validate output path writable:
```bash
mkdir -p specs/security/20260212/reports
```

## Implementation Steps
1. Add/update a lightweight reporting utility (script or documented command) to parse `tsc` output into JSON.
2. Generate baseline artifact:
- `specs/security/20260212/reports/typescript-baseline.json`
3. Record phase-0 summary note in `reports/remediation-matrix.md` initial row.
4. Ensure command is repeatable without manual edits.

## Verification (Post-implementation stubs)
1. Re-run baseline generation twice; confirm consistent schema.
2. Confirm JSON parses correctly and contains non-zero `total_errors`.
3. Confirm artifacts are committed in planning path.

## Artifacts
- `specs/security/20260212/reports/typescript-baseline.json`
- `specs/security/20260212/reports/remediation-matrix.md` (initialized)

## Success Criteria
- Baseline report exists and is machine-readable.
- Later sections can consume report format unchanged.

## Failure and Recovery
- If typecheck command is unavailable, stop and restore local Node/npm toolchain first.
- If parser fails on edge lines, adjust parser without mutating source code behavior.
