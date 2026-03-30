# Section 02: Analyzer and Contract Snapshots

## Goal

Build the analysis engine that inspects skills and produces recommendation candidates while capturing compatibility baselines.

## Files to Create

- `apps/web/server/services/skillMaintenanceAnalyzer.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`
- `apps/web/server/services/__tests__/skillMaintenanceAnalyzer.test.ts`
- `apps/web/server/services/__tests__/skillCompatibilityGate.test.ts`

## Files to Modify

- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`

## TDD - Tests to Write First

- analyzer detects missing tests
- analyzer detects missing manifest / weak sandbox config
- analyzer flags strong GenJS candidates
- compatibility snapshot includes input/output schema and test hashes
- compatibility gate blocks required input-field removal
- compatibility gate blocks required output-field removal

## Implementation Guidance

1. Analyzer should inspect:
   - manifest presence
   - entrypoint style
   - schema files
   - test files
   - fixture coverage
   - execution mode and sandbox metadata
   - JSON/pipeline/artifact hints for GenJS suitability
2. Snapshot builder should capture hashes and representative samples.
3. Quality score should be transparent and reproducible.
4. Keep analyzer deterministic where possible; use ISC enrichment later, not as the first dependency.

## Compatibility Constraints

- analyzer must not mutate skills
- snapshot logic must work for both classic and nested bundle layouts
