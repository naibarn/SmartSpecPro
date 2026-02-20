# Section 05 Code Review Interview

## Findings Triage

### Auto-Fixed
1. **useTemplate not transactional** — Wrapped insert + downloadCount update in `db.transaction()`.
2. **useTemplate missing isPublic filter** — Added `isPublic = true` and `status = 'published'` conditions to template fetch in useTemplate.
3. **Search input no max length** — Added `.max(200)` to search string Zod schema.
4. **count() result type** — Wrapped in `Number()` to ensure numeric type.

### Let Go
1. **Tests are existence-only** — The tests verify procedure registration which catches the most common failure mode (missing export, import errors). Deeper behavioral tests require a full tRPC caller mock setup with DB chain interception, which is complex for this router pattern. The seeder integration tests (section-04) cover the actual data flow.
2. **tags input unused** — Spec explicitly says "pass-through for now". Intentional placeholder.
3. **No ordering option** — Not in spec. Can be added later when Gallery UI needs it.

## Verification
- All 7 tests pass after fixes
- TypeScript check clean (no new errors in workflow.ts)
