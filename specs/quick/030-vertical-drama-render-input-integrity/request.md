# Request

## Source

- Approved design: `docs/portable-skill-pack/specs/2026-07-13-vertical-drama-render-input-integrity-design.md`
- User chose Approach A: strict end-to-end render contract.

## Task summary

Fix Vertical Drama start-frame generation so every character required by a shot has an approved primary portrait attached in canonical order and the provider prompt locks face, hair, and wardrobe. Block with an actionable message before credit/provider submission if any portrait is missing or the model cannot accept all required portraits.

Fix native-audio video prompt generation so every canonical dialogue line is present verbatim after every transformation and at the final provider boundary. Preserve the provider-independent Grok model-family native-audio invariant.

## Constraints

- This is the shot/start-frame workflow, not character image generation.
- Support one, two, three, or more required characters subject to model capacity.
- Reuse existing tRPC error-to-toast behavior.
- No schema migration or new dependency.
- Preserve existing dirty work, especially the uncommitted Grok/dialogue fixes.
- Do not stage or modify unrelated files.

## Non-goals

- No character-tab redesign.
- No fallback/generated portrait substitution.
- No provider-specific duplicate logic.

