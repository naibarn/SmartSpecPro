# Section 02 — Generator Routing and Plan Preservation

## Ownership

Image/video prompt language call sites in episode router/pipeline and
start-frame plan projection tests.

## Tasks

- Use the effective image-language resolver for whole-plan, single-shot, and
  supplementary reference-frame image prompt generation.
- Leave video-motion prompt consumers on `motionPromptPack.promptLanguage`.
- Carry `imagePromptLanguage` through start-frame plan projection and refresh.
- Keep policy-safe synopsis generation source-language locked and independent
  of both selectors.

## TDD expectations

Add failing call-argument/projection tests before routing changes. Include Thai
image + English video in the same episode and assert each generator receives
the correct value.

## Acceptance checks

- No image generator reads a changed video language once image language exists.
- No video generator reads image language.
- Option 1 receives no translation directive.
- Full plan regeneration preserves the plan-level image-language setting.

## Implementation result

Completed. Whole-plan, single-shot, and supplementary image prompt paths use
the image-language resolver; start-frame projection retains the setting. The
policy-safe synopsis branch remains deterministic and source-language locked.
