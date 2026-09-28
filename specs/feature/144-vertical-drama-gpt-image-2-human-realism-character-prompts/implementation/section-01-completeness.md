# Section 01 completeness review

## Result

PASS after three review passes and targeted fixes.

## Plan coverage

- Added the explicit capability types and contract version.
- Added DB/config-first and static fallback resolution.
- Added GPT Image 2, Nano Banana, and Seedream limits/profiles.
- Added fail-closed target behavior and explicit legacy behavior.
- Added shared `string.length` prompt-limit assertion and typed error names.
- Updated static parity for every currently enabled target row, including the
  legacy `google-nano-banana-pro` entry and Seedream 3/4/4.5/5 Pro variants.
- Updated all currently enabled Kie seed target rows covered by the section,
  including an exact idempotent legacy Pro row.
- Canonical selected model authority is tested against a conflicting reference
  route.

## Test coverage

- `verticalDramaCharacterPromptContract.test.ts`: 16 tests for target/legacy
  resolution, malformed metadata, exact boundaries, and Unicode semantics.
- `verticalDramaCharacterPromptCatalogParity.test.ts`: 4 tests for static
  entries and Kie seed-source rows.
- Existing `modelPromptBudget.test.ts`: 17 tests remain green.

## Verification

- Focused contract/catalog/budget tests: 37 passed.
- `npm --workspace @smartspec/web run check`: attempted; only unrelated
  pre-existing dirty-file diagnostics remained.
- No UI work is in scope.

## Notes

No must-fix gap remains for this section. The seed parity test intentionally
checks the static seed source because the seed script performs its database
side effect at process entry and is not imported by runtime code.
