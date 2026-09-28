# Implementation plan

## Objective

Make character prompt generation resilient to incorrect LLM bookkeeping while retaining
strict Character DNA quality and identity validation.

## Approach

In `verticalDramaCharacterImageGeneration.ts`, add a pure helper that accepts unknown raw
output, the requested character key, and authoritative comparison evidence. It clones only
the relevant object path, replaces the four server-observable fields, and changes an adult
lead's `threshold_status` from `pass` to `provisional` whenever authoritative history is
not structured. It returns the normalized payload plus a bounded correction list.

Wrap `characterVisualBibleOutputSchema` with `z.preprocess` for this invocation before the
existing role-tier, approved-DNA, and evidence checks. Keep the evidence checks as a
defense-in-depth assertion over normalized output. Emit one debug event when corrections
occur, without prompt/story content.

## Affected files

- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- `apps/web/server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`

## Risks and mitigations

- Accidental mutation: clone the output and nested requested-character path.
- Over-normalization: use an allowlist of exactly four evidence fields.
- False quality promotion: only downgrade `pass`; never promote any status.
- Hidden schema relaxation: keep candidate count, role, identity, prompt, and score tests.
- Retry regression: assert the production mismatch succeeds on the first response.

## Acceptance

- The captured mismatch becomes `0/partial/provisional` and succeeds.
- No retry occurs solely for deterministic evidence drift.
- `candidate_direction_count != 3` still fails after the bounded retry.
- Existing identity/role/creative failures remain failures.
- Focused tests, TypeScript check, and `git diff --check` pass.
