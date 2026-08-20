# TDD Guidance

## Service tests first

- Add a test that canonical `lead_male` plus `variantType="age_stage"` and
  `อายุ 6 ปี` resolves to `child`.
- Add a test that the generated input payload uses `role_tier="child"` and
  includes `variant_type="age_stage"`.
- Add a test that adult age-stage text (for example 30 years) remains the
  parent's lead visual tier.

## Router tests

- Exercise preview/generate entry with an adult base and child custom
  instruction; assert `PRECONDITION_FAILED` and the stable marker.
- Exercise an age-stage variant and assert the prompt service receives its
  variant type.
- Assert no paid prompt call is made before the recoverable precondition.

## UI tests

- Parse the marker and age from the server message.
- Verify the panel's error handler opens age-stage mode with the derived label,
  description, and original instruction.
- Preserve existing error rendering for unrelated errors.

## Commands

- `npm run test -- apps/web/server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`
- Focused vertical-drama character router and panel tests.
- `git diff --check`
- Changed-file TypeScript diagnostics/build as available; full-repo baseline
  diagnostics are reported separately.
