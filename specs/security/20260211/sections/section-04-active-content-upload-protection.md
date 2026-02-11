# Section 04 - Active-Content Upload Protection

## Objective
Block executable behavior from uploaded active-content while preserving preview usability for safe file types and inline-safe SVG.

## Scope
- Protect upload serving behavior for active-content extensions (HTML/HTM and related script-capable types).
- Keep SVG preview inline only when sanitization/validation succeeds.
- Provide safe fallback for unsafe SVG.

## Files to Add / Modify
- Modify: `apps/web/server/services/libraryService.ts`
- Modify: `apps/web/server/_core/index.ts`
- Add/Modify: `apps/web/server/services/uploadContentSafety.ts`
- Add: `apps/web/server/services/uploadContentSafety.test.ts`
- Add/Modify: route/static middleware tests in `apps/web/server/*test.ts`

## TDD Stubs (Write First)
- Test: HTML/HTM uploads served with attachment/non-executable headers.
- Test: unsafe SVG fails sanitization and is not rendered inline.
- Test: safe SVG passes sanitization and can render inline.
- Test: image/video/pdf safe previews remain unchanged.

## Implementation Tasks
1. Add extension/content classification for active vs safe preview types.
2. Implement SVG sanitization/validation pipeline.
3. Enforce serving headers/disposition for active-content.
4. Ensure preview components continue functioning for safe types.

## Acceptance Criteria
- Executable uploaded content cannot run inline.
- Safe SVG can still preview inline.
- Non-active file previews are unaffected.

## Notes / Risks
- Avoid over-blocking legitimate SVG assets.
- Sanitization rules must be explicit and test-driven.

## As-Built Update
- Actual files changed:
  - `apps/web/server/services/uploadContentSafety.ts` (new)
  - `apps/web/server/services/uploadContentSafety.test.ts` (new)
  - `apps/web/server/services/libraryService.ts`
  - `apps/web/server/services/libraryService.test.ts`
  - `apps/web/server/_core/index.ts`
- Deviations from plan:
  - Route-level static middleware behavior is validated through the extracted `getUploadStaticHeaders` helper unit tests rather than direct express route tests.
- Tests added/updated:
  - `apps/web/server/services/uploadContentSafety.test.ts`
  - `apps/web/server/services/libraryService.test.ts`
- Test run:
  - `bash -lc 'export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" && cd /home/dev/projects/SmartSpecPro/apps/web && npm test -- server/services/uploadContentSafety.test.ts server/services/libraryUrlPolicy.test.ts server/services/libraryService.test.ts server/services/mediaLibraryService.test.ts server/routers/library.test.ts server/routers/media.addToLibrary.test.ts'`
  - Result: pass (51/51)
- Follow-ups:
  - Consider extending SVG sanitization policy with parser-based allowlists for richer SVG support while preserving safety constraints.
