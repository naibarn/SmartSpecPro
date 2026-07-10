# Decision Log

## Planning Depth

- Depth: `standard`
- Reason: This is a medium feature touching seed data, shared labels/contracts, a new skill package, a new backend LLM service/mutation, and a UI workflow. It does not require the full Feature 131 deep-plan pipeline because it extends an existing surface and schema.
- Kept in quick-plan because the DB schema already supports the static presets and the Mix and Match output can be a transient draft rather than a new table.

## Product Decisions

1. Preserve the existing single-preset picker.
   - Rationale: Users who want speed should still choose one preset and move on.

2. Add Mix and Match as a second mode inside the same Step 1, not as a new page.
   - Rationale: The user is already in the Create Series Wizard; sending them elsewhere adds friction.

3. Use a dedicated skill package: `vertical-drama-preset-synthesizer`.
   - Rationale: This keeps genre-blending prompt rules, schema, fixtures, and help docs isolated from `generateStoryBible`.

4. The synthesis output is an editable draft, not a saved preset row.
   - Rationale: Lower data risk, simpler permission model, and better user control. Existing save-as-preset can cover durable private/global reuse later.

5. The UX uses user language such as "รสชาติเรื่อง" and "ให้ AI ช่วยผสมแนวเรื่อง" rather than "schema", "payload", or "synthesis".
   - Rationale: The product goal is to help users think, not make them manage prompt engineering.

6. Charge credits only after successful schema-valid synthesis.
   - Rationale: Matches existing Vertical Drama LLM behavior and avoids charging users for malformed output.

## Self-Review Rounds

### Round 1

- Completeness: [AUTO-FIX] Added explicit non-goal that synthesized drafts do not immediately save as DB presets.
- Contradictions: none.
- Security/abuse: [AUTO-FIX] Added credit safety and tenant/user procedure notes.
- Obvious missing improvement: [AUTO-FIX] Added primary/supporting flavor weighting.

### Round 2

- Completeness: [AUTO-FIX] Added static preset locale requirement for Thai and English.
- Contradictions: none.
- Security/abuse: no new auth surface beyond protected tRPC.
- Obvious missing improvement: [AUTO-FIX] Added UI copy guidance to avoid technical terms.

### Round 3

- Completeness: [AUTO-FIX] Added validation and no-charge-on-invalid behavior to backend plan.
- Contradictions: none.
- Security/abuse: [AUTO-FIX] Added malformed input and excessive selection caps.
- Obvious missing improvement: [AUTO-FIX] Added browser evidence for wizard states.

### Round 4

- Completeness: no meaningful gaps.
- Contradictions: none.
- Security/abuse: no additional issue.
- Obvious missing improvement: no meaningful issue.

### Round 5

- Completeness: no meaningful gaps.
- Contradictions: none.
- Security/abuse: no additional issue.
- Obvious missing improvement: no meaningful issue.

## Remaining Implementation Risks

- Existing dirty files overlap likely target files; implementation should inspect current diffs before editing.
- If `generateStoryBible` already changed locally, the new synthesis service should reuse stable helpers carefully rather than assuming main-branch shape.
- Dedicated tests for current `generateStoryBible` and `listGenrePresets` are already backlog; this work should add focused tests for new behavior rather than trying to fix all historical coverage gaps.
