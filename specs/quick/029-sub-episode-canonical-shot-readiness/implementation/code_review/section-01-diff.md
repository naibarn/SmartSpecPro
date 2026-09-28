# Section 01 staged diff manifest

Review the staged changes for these paths with `git diff --cached -- <paths>`:

- `apps/web/shared/verticalDramaSeries/assemblyReadiness.ts` (new pure resolver)
- `apps/web/shared/verticalDramaSeries/__tests__/assemblyReadiness.test.ts` (8 tests)
- `apps/web/shared/verticalDramaSeries/index.ts` (barrel export)
- `specs/quick/029-sub-episode-canonical-shot-readiness/sections/section-01-shared-canonical-readiness.md`

Focused verification completed:

- `npm test -- shared/verticalDramaSeries/__tests__/assemblyReadiness.test.ts`
- Result: 1 file passed, 8 tests passed.
