# Section 02 completeness review

## Result

PASS.

## Coverage

- Mirrored skill files now contain the Feature 144 Human Realism contract,
  rich/compact profile guidance, contextual inline avoidance, and shot-aware
  optics.
- Normal and candidate generation calls pass only bounded capability facts.
- Target QC covers skin/reflectance, face/hair detail, grounded anatomy/contact,
  and inline anti-model avoidance without requiring `negative_prompt`.
- Target negative fragments are not merged; legacy negative behavior remains.
- Target prompt caps are checked before prompt-generation credits are deducted.
- The target contract marker is returned on normal and candidate outputs.
- Target callers fail closed before credit checks when capability facts are
  missing or invalid; target QC is limited to one corrective schema retry.
- Final selected prompts, including deterministic region normalization, are
  length-checked before credit deduction. Stale snapshot decisions are
  exported for Section 03 router enforcement.

## Verification

- `verticalDramaCharacterVisualBible.skillContent.test.ts`: 60 passed.
- `verticalDramaCharacterImageGeneration.test.ts`: 184 passed.
- Combined Section 01–02 focused suite: 289 passed.
- Full typecheck attempted; the only matching diagnostic is the pre-existing
  dirty-worktree `mediaGenerationService.ts(2573)` `defaultInputParams` error.
