# Research notes

## Production evidence

- Audit trace `BnQYyw9P5DCVG8Rk1mCrs` in
  `apps/web/logs/audit/audit-2026-07-13.jsonl` shows two successful OpenRouter responses.
- Authoritative context yields `priorLeadDnaCompared=0` and
  `historyCompleteness="partial"`.
- The first model response reported `5/structured`; the retry reported `3/structured`.
- The reported creative payloads were otherwise usable, so the generic schema retry could
  not resolve the deterministic bookkeeping mismatch.

## Current code

- `deriveAuthoritativeComparisonEvidence` already computes the authoritative evidence.
- `generateCharacterVisualPrompts` constructs a `superRefine` schema that rejects four
  mismatched server-observable fields.
- `characterVisualBibleCharacterSchema` runs `mapCharacterDesignDna` during nested parsing.
  Therefore normalization must happen before this nested schema, not in the later
  `superRefine` callback.
- `candidate_direction_count` is a literal `3` in the output schema and is not included in
  the authoritative mismatch loop. It must remain strict because the server cannot observe
  the model's internal candidate generation.
- Shared `verticalDramaCharacterDesignDnaSchema` rejects an adult lead marked `pass` when
  history is not `structured`; a conservative pre-validation downgrade is required.

## Test surface

- Primary: `apps/web/server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts`
- Existing tests cover mismatch rejection, exact-match acceptance, provisional history,
  role-tier mismatch, approved identity drift, and credit deduction.
- The mismatch-rejection expectation must become normalization-success coverage while
  preserving separate negative tests for non-server-owned fields.

## Boundaries

- No auth, tenant, DB, API, or client contract changes.
- The raw LLM object must be cloned rather than mutated.
- Logging must exclude story content and full prompts.
- SocratiCode transport was unavailable; discovery used the production trace and targeted
  source/test reads.
