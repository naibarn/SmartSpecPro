# Section 01 — Skill Adapter

## Ownership

Own the new `verticalDramaCharacterReferenceCasting.ts` service and its focused tests. Do not modify UI or candidate persistence in this section.

## Contract

- Load/sync exactly `character-candidate-prompt`.
- Accept authoritative character facts, 1–5 image count, up to 6 resolved reference URLs, lock clothing, pose mode, camera framing and optional additional instructions.
- Build a multimodal system/user message from the skill content and schema-compatible JSON facts.
- Use the shared skill execution policy and LLM fallback; settle the named skill exactly once on success/failure according to existing billing conventions.
- Return one bounded non-empty plain-text prompt; reject empty or oversized output.

## TDD

- Test input normalization and prompt/message shape first.
- Test reference order/deduplication and max limits.
- Test successful text result, empty result and missing skill/provider errors.
- Confirm reference URLs are passed only after server-side resolution and never read from arbitrary browser URLs.

## Acceptance

The adapter can be called by the router without a conversation ID, sees the skill system prompt, includes all selected reference images, and returns text only.
