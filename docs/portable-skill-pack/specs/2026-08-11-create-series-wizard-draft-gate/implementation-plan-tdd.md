# TDD Guidance

## Red tests first

- Resolver: one preset with no premise must return `synthesize_single_preset`.
- Wizard: generated mutation data alone must not enable Next; applying the draft must enable
  it only after a title candidate or manual title is present.
- Wizard: single preset must show the AI CTA and not the direct preset CTA.
- Wizard: source change and regenerate must disable Next again.
- Wizard: missing/duplicate/empty automatic title options must block apply.
- Service: single-preset prompt must contain reinterpretation rules and a per-call variation
  nonce; two calls must not reuse the nonce.

## Test setup

Reuse the existing tRPC mocks and `renderWizard()` helpers in
`CreateSeriesWizard.test.tsx`. Ensure mutation `data` is not interpreted as confirmation;
tests must click the actual draft-apply and title-selection controls.

For service tests, mock the planning/LLM call at the existing service boundary and inspect
the constructed user prompt or request context. Keep credit/auth behavior covered by the
existing router tests.

## Regression checks

- Existing multi-preset/premise draft apply tests continue to pass.
- `applyPresetDraft` still preserves manual title and clears transient preset identity.
- No changed files outside the scoped client/server/skill paths.
- Run skill verifier after changing `skill.md` or its fixtures.
