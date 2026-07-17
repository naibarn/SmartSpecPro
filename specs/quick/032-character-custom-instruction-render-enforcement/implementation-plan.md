# Implementation Plan

## Objective

Guarantee that the exact character-image prompt submitted to any provider contains the user's bounded per-generation visual requirements unless no instruction was supplied.

## Approach

Add a pure `buildCharacterRenderPrompt(basePrompt, customInstruction)` helper near the character router boundary. It trims the brief, JSON-encodes it, adds an owned requirement block with precedence language, and replaces an existing owned block idempotently. Use it when returning preview prompt text and again immediately before `generateImageAsync`; the second use is the authoritative invariant and safely deduplicates preview-approved prompts.

Retain the skill's natural-language interpretation responsibility and strengthen its compliance wording/tests. Do not mutate canonical Character DNA or change prompt-credit/image-credit behavior.

## Acceptance Criteria

- Thai full-body/light/setting brief is present in the final provider prompt.
- Direct and approved-preview flows enforce the same contract.
- Preview shows the enforceable prompt.
- Same brief never creates duplicate blocks; changed brief replaces the old owned block.
- No brief preserves legacy prompt text.
- Identity/reference/child/provider safety precedence is explicit.
- Focused tests, skill validation and TypeScript check pass.

## Risks

- Prompt injection: brief is JSON-encoded and labelled untrusted visual data.
- Prompt duplication: stable markers and replacement semantics.
- Existing approved prompt: preserve its block when no new brief is supplied.
- Provider differences: enforcement happens before the shared media service, independent of provider.
