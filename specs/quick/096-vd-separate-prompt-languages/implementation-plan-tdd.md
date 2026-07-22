# TDD Plan

## Red

1. Add resolver tests for explicit image language, legacy shared fallback, and
   English default.
2. Add router tests showing:
   - image language creates/patches a start-frame plan;
   - video-language change snapshots the old image language;
   - locked fresh-row frame data survives;
   - image and video values no longer cross-update.
3. Add projection tests showing `imagePromptLanguage` survives regeneration.
4. Add service/router tests for all three image-language consumers.
5. Add component tests expecting two labels/callbacks and disabled Option 1.

## Green

Implement the smallest contract, resolver, mutation, routing, projection, and
UI changes needed to satisfy each failing test. Do not refactor unrelated
language or model-selection code.

## Refactor

Remove stale “one shared field” comments and centralize repeated effective
image-language resolution. Keep the current language enum and `LanguageSelect`
visual pattern.

## Verification

Run the focused Vitest files for router, pipeline/start-frame generation, and
storyboard UI; then run `npm --workspace @smartspec/web run typecheck --
--pretty false`, `git diff --check`, skill twin comparison if touched, and
responsive browser checks if the local app is available.
