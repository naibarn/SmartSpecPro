# Section 05 - LLM Extraction

## Objective

Extract structured product JSON from capture evidence using server-side LLM infrastructure with prompt-injection hardening and schema validation.

## Scope

- `marketplaceExtractionService`
- `marketplacePromptService`
- `marketplaceValidationService`
- analyze REST endpoint

## Implementation Notes

- Extension never calls LLM providers directly.
- Prompt must clearly separate trusted system instructions from untrusted marketplace DOM/HTML/OCR/screenshot data.
- Do not send huge raw HTML blindly; summarize and cap blocks.
- Expected output is strict JSON only.
- Validate result with shared Zod schema.
- Retry one repair prompt for invalid JSON/schema.
- Cross-check DOM parser fields against LLM fields:
  - price mismatch creates warning
  - sold count fallback derives from DOM when LLM misses it
  - image candidate fallback applies when LLM returns no main images
- Analyze updates capture session only. It must not create or mutate product records.
- Optional variant/SKU fields should be extracted when evidence exists.
- Store extraction run metadata: provider/model, prompt version, schema version, input evidence asset IDs, repair count, and token/cost metadata where existing accounting exposes it.
- Provide deterministic fallback extraction for core DOM fields when LLM is disabled, unavailable, or rate-limited.
- Enforce per-user and per-tenant LLM budget/quota before analysis starts.
- Add model policy config for text extraction, vision extraction, and JSON repair.
- Add PII/minimization prefilter for obvious account/contact/header noise before DOM text reaches the LLM.

## Tests First

- Prompt builder labels evidence as untrusted.
- Valid LLM result stores normalized JSON.
- Invalid JSON retries once.
- Persistent invalid JSON sets capture failed.
- Prompt injection fixture cannot alter schema or trigger side effects.
- DOM/LLM mismatch produces warnings.
- LLM-disabled fallback marks extraction mode and fills core DOM fields.
- Extraction ledger stores prompt/schema version and repair count.
- Analyze fails safely when quota/budget is exceeded.
- Model selection follows configured policy rather than hardcoded model names.

## Acceptance Criteria

- Analyze produces validated extraction with confidence/evidence/warnings.
- Low-confidence or conflicting fields are visible to preview.
- Analyze is idempotent or guarded by `forceRerun`.
