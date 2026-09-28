# Character Visual Bible Authoritative Evidence Design

## Status

Approved direction: Approach A — server-owned normalization.

## Incident evidence

- Production route: `/drama-series/7`
- Procedure: `verticalDramaCharacters.previewCharacterPrompt`
- Trace ID: `BnQYyw9P5DCVG8Rk1mCrs`
- Model: `google/gemini-3.1-flash-lite` through OpenRouter
- Server-derived facts:
  - `prior_lead_dna_compared = 0`
  - `history_completeness = "partial"`
- First LLM response reported `5 / "structured"`.
- Retry reported `3 / "structured"`.
- Both otherwise usable responses failed the final schema because factual comparison
  bookkeeping was treated as an LLM-authored assertion.

## Root cause

`comparison_evidence` has conflicting ownership. The server can derive all four
archive/cast fields from the bounded character-design context, but the output schema
requires the LLM to repeat those values exactly. The skill prompt tells the model how to
count them, while the service rejects any disagreement. A probabilistic model therefore
controls whether a deterministic server fact passes validation. The generic schema retry
repeats the same ownership mistake, adding latency and provider cost without guaranteeing
recovery.

## Design

### 1. Normalize server-owned facts before nested DNA validation

Add a pure normalization boundary in
`apps/web/server/services/verticalDramaCharacterImageGeneration.ts`. It receives the raw
parsed output, the requested character key, and the authoritative comparison evidence.
For the requested character only, it returns a cloned payload whose
server-observable fields inside `character_design_dna.comparison_evidence` are replaced
with their server-derived values:

- `current_cast_compared`
- `recent_series_compared`
- `prior_lead_dna_compared`
- `history_completeness`

`candidate_direction_count` remains LLM-owned evidence of the skill's internal selection
process. Its existing literal-3 schema validation remains strict; the server must not claim
that three candidates were evaluated when it cannot observe that internal work.

The normalization runs before the nested `mapCharacterDesignDna` validation so an LLM
claim of `structured` cannot incorrectly activate the stricter structured-history branch.
The raw response object must not be mutated.

### 2. Preserve conservative score semantics

When authoritative history is `partial` or `none`, an LLM-reported
`scores.threshold_status = "pass"` is deterministically changed to `"provisional"`.
`redesign_required` remains `redesign_required`, and an existing `provisional` remains
unchanged. When history is truly `structured`, the server does not promote a lower status
to `pass`; quality approval remains the model's responsibility subject to existing score
validation.

This is a one-way safety rule: the server may prevent an unsupported pass but never invent
a stronger quality result.

### 3. Keep all creative and identity validation strict

No other LLM-authored field is repaired. Existing checks remain authoritative for:

- requested character ID and role tier;
- approved Character DNA fingerprint and identity drift;
- face, hair, body-language, anti-clone and score shapes;
- required portrait/sheet prompts;
- lead thresholds when structured evidence is genuinely available.

Malformed creative output must still use the existing bounded retry and fail closed after
the retry. Only deterministic bookkeeping is removed from the probabilistic failure path.

### 4. Validation and observability

The service should expose the normalizer for focused unit tests or keep it as a pure local
helper tested through `generateCharacterVisualPrompts`. No database or API schema migration
is required. Existing client error handling remains unchanged.

The pure normalizer returns a correction summary alongside the cloned payload. The caller
emits a concise debug/audit signal when reported evidence differs from authoritative facts,
without logging story content or full prompts. The signal includes only field names,
reported values, authoritative values, series ID, and character key. This preserves purity
and the ability to detect model drift without failing the customer action.

## TDD acceptance cases

1. Reproduce the production response: reported `prior=5`, `structured`, `pass`; authoritative
   `prior=0`, `partial`; generation succeeds with `0`, `partial`, `provisional` persisted.
2. Confirm the normalization succeeds on the first LLM response and does not trigger the
   schema retry solely because evidence differs.
3. Normalize all four server-observable evidence fields while continuing to reject a
   `candidate_direction_count` other than 3.
4. Preserve `redesign_required` under partial history.
5. Never promote `provisional` or `redesign_required` to `pass` under structured history.
6. Continue rejecting role-tier mismatch, approved-DNA drift, malformed prompts, and
   genuinely invalid structured-history scores.
7. Confirm credits are deducted once only after the normalized payload passes validation.

## Operational impact

- No schema migration, new dependency, environment variable, or external service.
- Removes an avoidable retry for deterministic evidence mismatch, reducing latency and
  provider cost.
- Deployment remains a normal web-service release. Production verification should repeat
  character prompt generation for series 7 and confirm the prompt preview succeeds before
  image rendering begins.

## Alternatives rejected

- Retrying with a stronger instruction remains probabilistic and already failed in the
  captured incident.
- Relaxing or deleting validation would allow false archive claims into persisted DNA.
- Trusting LLM evidence over the server contradicts the bounded-context security and data
  integrity model.
