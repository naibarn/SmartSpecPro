# Section 02 - Legacy URL Migration

## Objective
Migrate existing `library_items.source_url` and `thumbnail_url` data to comply with the new policy without breaking valid content.

## Scope
- Build migration pipeline with three modes:
  - dry-run audit
  - normalization
  - enforcement (quarantine blocked values)
- Ensure migration is reversible and auditable.

## Files to Add / Modify
- Add: `apps/web/server/services/libraryUrlMigrationService.ts`
- Add: `apps/web/server/services/libraryUrlMigrationService.test.ts`
- Add: `apps/web/scripts/migrate-library-urls.ts`
- Add: `apps/web/scripts/migrate-library-urls.test.ts` (or service-level coverage if script thin)
- Optional add: `specs/security/20260211/migration-report-template.md`

## TDD Stubs (Write First)
- Test: dry-run returns classified counts with no DB writes.
- Test: normalization updates only `needs_normalization` records.
- Test: enforcement quarantines only `blocked` records.
- Test: valid external `https://` image URLs remain unchanged.
- Test: migration writes rollback snapshot metadata.

## Implementation Tasks
1. Implement classification job over existing rows using section 01 policy.
2. Implement dry-run reporting output (JSON/CSV summary).
3. Implement normalization update pass.
4. Implement enforcement pass with explicit quarantine behavior.
5. Add rollback snapshot/export mechanism before mutating rows.

## Acceptance Criteria
- Dry-run and execution modes are deterministic.
- Post-migration report shows zero unclassified rows.
- Rollback metadata is available and verified.

## Notes / Risks
- Large tenant tables may need batching/throttling.
- Run dry-run in staging with sampled production-like data before enforcement.

## As-Built Update
- Actual files changed:
  - `apps/web/server/services/libraryUrlMigrationService.ts` (new)
  - `apps/web/server/services/libraryUrlMigrationService.test.ts` (new)
  - `apps/web/scripts/migrate-library-urls.ts` (new)
- Deviations from plan:
  - Script-level tests were skipped; service-level tests cover migration logic directly.
- Tests added/updated:
  - `apps/web/server/services/libraryUrlMigrationService.test.ts`
- Test run:
  - `bash -lc 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && cd /home/dev/projects/SmartSpecPro/apps/web && npm test -- server/services/libraryUrlPolicy.test.ts server/services/libraryUrlMigrationService.test.ts'`
  - Result: pass (12/12)
- Follow-ups:
  - Execute script in staging with production-like dataset before applying normalization/enforcement in production.
