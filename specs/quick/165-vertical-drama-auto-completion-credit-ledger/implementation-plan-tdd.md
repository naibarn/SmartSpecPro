# TDD plan

## Test-first sequence

1. Billing helper tests: required slug, stable idempotency, separate repair keys, exact metadata, actual effective model, and error propagation.
2. Story completion predicate tests: missing episode, empty dialogue, whitespace-only dialogue, malformed shot, valid episode, and mixed complete/incomplete target sets.
3. Deep worker tests: primary output with gaps triggers repair; repair targets only gaps; every call is billed; repair round is persisted; bounded exhaustion is resumable and has no fabricated dialogue.
4. Prompt expansion tests: invalid real response is billed; repair is a new billed attempt; accepted preview is persisted only after quality/schema pass; over-limit input remains locked.
5. QC tests: baseline evaluate and revise calls each create independent usage entries; failed QC triggers automatic repair/re-evaluate; refresh restores complete history.
6. Credit API/UI tests: all representative stages appear with exact skill name/slug, actual model, stage, round, and stable ordering.
7. Regression tests: existing deep-draft dialogue gate, fixed model policy, revenue settlement, prompt expansion migration guard, and story job refresh behavior.

## Test doubles

Unit tests may stub the provider adapter and transaction writer to assert call order and metadata. Production code must continue to call the real LLM path and must not return mock/fallback content.

## Focused commands

```bash
npm --workspace apps/web test -- --environment jsdom <changed server/client test files>
npm --workspace apps/web exec tsc -- --noEmit 2>&1 | <changed-file filter>
git diff --check
```

The full repository typecheck is expected to contain pre-existing baseline noise; report it separately from changed-file diagnostics.
