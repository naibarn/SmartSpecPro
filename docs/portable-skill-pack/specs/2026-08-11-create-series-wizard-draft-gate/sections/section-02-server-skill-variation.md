# Section 02 — Server Skill Variation

## Ownership

Own `verticalDramaPresetSynthesis.ts`, the related skill prompt/contract, and focused server
tests. Do not change the router shape unless a test proves it is required.

## TDD expectations

Mock the existing LLM/planning call and assert that one-preset requests include the
reinterpretation instruction and a fresh variation nonce. Preserve existing credit and auth
tests.

## Implementation

- Create a server-side nonce for each synthesis call.
- Add the nonce and single-preset rules only when exactly one preset is selected.
- Keep the skill-first loading/execution path and existing response schema compatibility.
- Let the wizard/client enforce the stricter automatic-title requirement without breaking
  other service callers.
- Add a shared partial-input completion block to both v1 and v2 prompts: non-empty inputs are
  constraints, omitted fields are filled coherently, and the model must not ask for missing
  optional inputs.

## Acceptance

One-preset synthesis cannot be mistaken for verbatim preset application; retries have distinct
request context; sparse input produces a complete draft without clarification questions; existing
procedure behavior remains authorized, credited, and schema-safe.
