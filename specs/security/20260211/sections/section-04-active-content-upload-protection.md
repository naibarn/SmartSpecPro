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
