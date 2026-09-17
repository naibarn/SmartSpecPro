# Section 2 — Storyboard prompt projection

## Ownership

Files: `apps/web/server/routes/marketplaceCapture.ts` and its focused test.

Expose bounded `imagePrompt` independently from `videoPrompt` using current task
and context fields. Do not add schema/database changes.

## TDD/acceptance

- Both prompt fields are exposed when both exist.
- Image-only input does not populate videoPrompt.
- Existing media URL projection tests remain green.

