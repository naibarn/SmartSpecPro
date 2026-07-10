# TDD Plan: Vertical Drama Mix-and-Match Presets

## Test First Targets

### Static Presets And Labels

1. Add/extend a seed-script focused test if available, or a lightweight fixture assertion around the exported seed data if the script is refactored for testability.
   - Expected failing condition: six new category slugs are not present for Thai and English.
   - Acceptance: both locale lists include all six slugs with complete preset fields.

2. Add/extend a category label test.
   - Expected failing condition: labels fall back to raw slug.
   - Acceptance: all six slugs return friendly Thai and English labels.

### Skill Package

3. Add skill package metadata/schema verification.
   - Expected failing condition: `vertical-drama-preset-synthesizer` is missing files or pinned metadata.
   - Acceptance: manifest, schemas, examples, fixtures, tests, and `scripts/verify.sh` pass without provider credentials.

4. Add output schema fixture checks.
   - Expected failing condition: fail fixture violates required draft fields.
   - Acceptance: pass fixture validates and fail fixture fails for declared reasons.

### Backend Service

5. Add `verticalDramaPresetSynthesis.test.ts`.
   - Expected failing condition: service does not exist.
   - Cases:
     - rejects fewer than 2 selections;
     - rejects more than 5 selections;
     - performs credit pre-check before LLM call;
     - validates returned JSON;
     - does not deduct credits on schema failure;
     - deducts credits after valid output;
     - includes primary/supporting flavor instructions in prompt.

### tRPC Router

6. Add router test for `synthesizeGenrePreset`.
   - Expected failing condition: procedure does not exist.
   - Cases:
     - returns draft for visible global presets;
     - includes caller-owned private presets;
     - rejects another user's private preset ID;
     - forwards business/product context;
     - maps service validation errors to user-friendly tRPC errors.

### Client UX

7. Add/extend `CreateSeriesWizard` tests.
   - Expected failing condition: no Mix mode control.
   - Cases:
     - single-preset mode still applies one preset unchanged;
     - Mix mode requires 2 selections before enabling generate;
     - loading state communicates that AI is building the draft;
     - draft preview renders core fields and actions;
     - `ใช้ draft นี้` applies values to the same wizard fields as a normal preset;
     - errors are shown in Thai/English copy without technical schema jargon.

## Regression Checks

- Existing Vertical Drama preset picker behavior.
- Existing create flow: create shell -> best-effort `generateStoryBible`.
- Existing save-as-preset ownership flow.
- `cd apps/web && pnpm check`.

## Browser Evidence

Capture at least:

- Desktop wizard step 1 single-preset mode.
- Desktop wizard step 1 Mix mode before selection.
- Desktop Mix mode with selected 2-5 flavors and generated draft preview.
- Mobile wizard Mix mode with draft actions visible and non-overlapping.

No video/image generation evidence is required for this feature.
