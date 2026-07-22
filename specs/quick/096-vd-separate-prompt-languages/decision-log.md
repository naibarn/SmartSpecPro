# Decision Log

## Planning depth

- Depth: standard
- Reason: medium cross-domain change spanning shared contracts, backend JSONB
  persistence/routing, frontend props/copy, and targeted tests. No migration or
  new architecture warrants full deep-plan promotion.

## Decisions

1. Store image language in `startFramePlan.imagePromptLanguage`; retain
   `motionPromptPack.promptLanguage` as video language.
2. Use one pure effective-image-language resolver with legacy fallback:
   image field, then old shared field, then English.
3. Option 1 ignores the selected image language and preserves the synopsis
   language. The UI shows a disabled automatic value.
4. Snapshot legacy image language during video-language mutation using a
   locked fresh-row transaction.
5. Preserve the image language through whole-plan projection/regeneration.

## Stabilization review

- Round 1: `[AUTO-FIX]` Added explicit whole-plan projection preservation.
- Round 2: `[AUTO-FIX]` Clarified that Option 1 preserves, but does not delete,
  the stored Option 2 image-language preference.
- Round 3: `[AUTO-FIX]` Added row-lock/fresh-read requirement to prevent JSONB
  lost updates.
- Round 4: `[AUTO-FIX]` Expanded tests to cover single-shot, reference-frame,
  whole-plan, and video isolation paths.
- Round 5: Clean — completeness, contradictions, security, and obvious gaps.
- Round 6: Clean — second consecutive clean review; plan stabilized.

## Promotion triggers

Promote only if implementation discovers a required DB migration, a new
cross-service contract, or more than five independently owned implementation
sections. None is currently expected.
