# Section 02 — Full-Story Seed and Existing Ledger Planner

## Scope

ทำให้การคิดเรื่องเต็มตั้งแต่ outline สร้างเจตนา `story_control_seed` แบบสั้น แล้วให้ existing `vertical-drama-ledger-planner` annotate/validate approved breakdown ต่อ โดยไม่สร้างพล็อตใหม่หรือ ledger planner ชุดที่สอง

## Owned files/modules

- `apps/web/skills/vertical-drama-full-story-architect/skill.md`
- `apps/web/skills/vertical-drama-ledger-planner/SKILL.md`
- related skill schemas/references/examples/fixtures
- `apps/web/server/services/verticalDramaLedgerPlanner.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts` only at the orchestration boundary required to carry seed and approved version

## Skill contract

The full-story architect emits a seed containing premise anchor, canonical core cast and relationship anchors, durable-thread candidates, romance phase skeleton and advantage intent. It does not emit full season ledger details in every chunk and does not own persistence.

The ledger planner receives the seed, approved episode breakdown, bible, genre/tone, roster and the selected duration profile when available. It classifies thread scope, assigns payoff window/evidence intent, creates episode slots from existing beat/logline, and adds romance/advantage annotations. It must not replace approved breakdown. A seed/outline conflict becomes a review finding with no outline mutation.

Duration is not a fixed episode assumption: the planner keeps 9 logical storyboard shots, assigns a validated uniform or mixed duration vector when production has selected a profile, and otherwise marks the slot `duration_pending`. Runtime is derived from the vector/assembly mapping; the planner never calculates episode count from 60 or 90 seconds.

Thread policy must be configurable by genre/target episode count. Defaults are bounded and explainable, for example a small number of active arc threads and zero/one new durable thread per episode, but must not become universal storytelling rules. `none`/pause romance beats and shared/unclear advantage are valid when the skill explains the intent.

## Integration behavior

Run this planner after outline approval and before enforced episode drafting. Keep legacy/flag-off behavior unchanged. If seed or planner output is absent, the version stays draft/audit-only rather than silently inventing missing fields.

## TDD stubs

- valid seed maps to the same approved breakdown version
- conflicting seed/outline returns review and leaves outline byte-equivalent
- unknown roster character is rejected/flagged
- moment hook does not become durable arc thread by default
- scope, owner, payoff window and evidence intent are valid
- active/new-thread budgets generate deterministic findings
- duration profile is passed through without being converted to a fixed episode runtime
- romance pause and non-alternating advantage schedule are accepted
- malformed ledger rows follow existing tolerant handling without hiding premise conflict

## Acceptance

New full-story generation thinks about continuity, romance and advantage before deep drafting, yet the creative story remains owned by the full-story skill. The ledger planner only records what the approved narrative supports.

## UI/UX Contract

### Target User / JTBD
N/A — LLM planning/service contract only; no browser surface is changed here.

### Existing Pattern Reference
N/A — no UI is created or modified.

### Surface Inventory
N/A — no route, dialog, card or form.

### Component Map
N/A — no browser component.

### State Matrix
N/A — planner draft/review states are service outputs covered by Vitest.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — no browser interaction.

### Copy Contract
N/A — skill strings are not a user-facing UI surface in this section.

### Browser Evidence Required
N/A — browser evidence begins in Section 06.
