# Section 03 — Bounded Episode Slot and Script Contract

## Scope

ส่งเฉพาะ episode slot และ relevant story state ให้ script builder และให้ผลลัพธ์ของ script ระบุ explicit actions/evidence โดยไม่ให้ `open_loops` กับ `episode_memory` แข่งกันเป็น source of truth

## Owned files/modules

- `apps/web/server/services/verticalDramaScriptGeneration.ts`
- `apps/web/skills/vertical-drama-script-builder/SKILL.md` and its output contract/examples
- shared episode-slot/action/cast-packet contract from Section 01
- relevant prompt/retrieval helpers and service tests

## Input contract

The authoring skill receives immutable premise/canon subset, current episode purpose, allowed thread actions, relevant thread summaries, romance beat intent, advantage beat intent, duration profile/vector for the 9 logical shots (or `duration_pending`), required canonical characters, knowledge/trust facts and forbidden contradictions. It must not receive the full season ledger or unrelated cast.

## Output contract

At episode level, the script returns `thread_actions`, `romance_beat`, `advantage_beat`, `character_role_bindings` and `evidence_refs` alongside existing script fields. Actions reference registered IDs or remain `proposed_new_thread` until review. The skill writes prose/scene detail; it does not persist IDs or statuses.

Canonical character keys are required for speakers and role bindings. A new character or role substitution is a proposal, not an implicit roster mutation. Romance and advantage are beats/intents, not per-shot mandatory fields; the skill may choose a pause when the slot allows it.

## Compatibility rule

With feature flags off, preserve existing output shape. With flags on, `episode_memory` and legacy `open_loops` are adapted into observations only. If a valid structured `episode_memory` conflicts with `open_loops`, do not merge both silently; send the conflict to reconciliation/review.

## TDD stubs

- prompt contains bounded relevant subset and stays within budget
- allowed action accepted; unknown ID/episode/character rejected
- proposed new thread is not persisted
- canonical speaker/role mismatch creates finding
- valid old script still works in flag-off mode
- conflicting `episode_memory`/`open_loops` is surfaced
- missing optional slot fields do not cause invented plot
- uniform and mixed duration vectors produce per-shot speech budgets from actual duration; fixed 60/90 runtime is not injected when a profile is absent
- one targeted schema retry does not double-persist or double-charge

## Acceptance

The episode writer has enough context to write coherent scenes without the cognitive load of the full ledger, and every durable continuity change is explicit and inspectable after generation.

## UI/UX Contract

### Target User / JTBD
N/A — episode generation contract only; no browser surface is changed here.

### Existing Pattern Reference
N/A — no UI is created or modified.

### Surface Inventory
N/A — no route, dialog, card or form.

### Component Map
N/A — no browser component.

### State Matrix
N/A — generation states are service outputs covered by Vitest.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — no browser interaction.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — browser evidence begins in Section 06.
