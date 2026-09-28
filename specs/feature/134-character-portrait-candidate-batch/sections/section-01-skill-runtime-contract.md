# Section 01 — Skill and Runtime Contract

## Ownership

- `apps/web/skills/vertical-drama-character-visual-bible/**`
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`
- corresponding image-generation and Skill-content tests

Do not modify router, stock, shared asset, or UI files in this section.

## Implementation

Add input `portrait_candidate_count: 1..5` and a mutually exclusive lean
`portrait_candidate_batch` output. Keep normal output unchanged. Update both Skill markdown
mirrors and only the references/fixtures required for bundle consistency.

Add a candidate generator beside the normal generator. Reuse existing facts, model, retry,
credit, lead QC, authoritative evidence, and snapshot mapping. Validate exact count/IDs/role,
all-candidate evidence, and pairwise face/hair/signature diversity. Scale max tokens only for
candidate mode and deduct actual LLM usage once.

## TDD

Write the Section 01 tests from `claude-plan-tdd.md` before implementation. Use pure exported
validators where possible so malformed candidate sets are tested without live LLM calls.

## Acceptance

- Counts 1-5 work; 0/6 and hybrid outputs fail.
- Five candidates do not require five copies of sheet prompts.
- Every lead candidate passes existing star/role-drift QC.
- Pairwise insufficient face diversity causes the bounded retry path.
- Existing normal runtime tests and Skill verifier remain green.

## Risk

Preserve current dirty role-quality changes and do not replace Skill prose wholesale.

## UI/UX Contract

### Target User / JTBD
N/A — this section produces server/Skill contracts consumed by Section 03.
### Surface Inventory
N/A — no browser file changes.
### Component Map
N/A — no UI components.
### State Matrix
N/A — runtime validation states are covered by service tests.
### Responsive Matrix
N/A — no layout.
### Accessibility Acceptance
N/A — no interactive browser surface.
### Copy Contract
Skill prose is internal; no user-facing UI copy is added here.
### Browser Evidence Required
N/A — Section 03/04 own browser evidence.
