# Section 01 — Canonical Contract and Capability Benchmark

## Scope

สร้าง contract กลางของ Story Control Plane โดยยึด `bible.breakdownVersions[].ledgers` และ existing memory events เป็นฐาน ไม่สร้าง ledger namespace ใหม่ และพิสูจน์ความสามารถของ skills ด้วย no-write fixtures ก่อนเปิดใช้จริง

## Owned files/modules

- `apps/web/shared/verticalDramaSeries/qualityLedgers.ts`
- `apps/web/shared/verticalDramaSeries/storyControl.ts` for `storyControl`, `story_control_seed`, thread action, evidence reference and status transitions
- `apps/web/shared/verticalDramaSeries/contentBudget.ts` / breakdown-version schema integration
- targeted shared/service tests and Phase 0 fixtures

## Contract decisions

- New plan fields are optional when reading legacy data but required when creating an approved control plan.
- `sourceBreakdownVersionId` identifies the plan version used for an episode.
- Runtime is derived from a validated duration profile/vector for the 9 logical shots plus explicit render mapping; fixed 60/90-second episode assumptions are not canonical.
- Existing camelCase ledger keys remain unchanged.
- Thread scopes are `moment_hook`, `episode_thread`, `arc_thread`, and `season_thread`; statuses include existing values plus explicit `parked`, `sequel_hook`, and `legacy_unknown`.
- `parked`, `sequel_hook`, and `legacy_unknown` cannot return to `active` through implicit reconciliation. Reopening is an explicit proposal with a new lifecycle or approved policy.
- `open_threads` is derived compatibility text, never the canonical write source.

## Persistence and safety

Keep new fields inside the append-only breakdown version JSONB and use existing `vertical_drama_memory_events` for observed evidence. Do not require a DB migration in this section. Reads tolerate absent/malformed optional fields; new-plan writes fail closed. Persist only after tenant/user ownership, active-version, lock status and schema checks pass.

## Phase 0 benchmark

Prepare no-write fixtures for a 20–30 episode romance mystery, a 6 episode short-form drama, and a snapshot of series 21 at episode 25. Include uniform 8s x 9, mixed shot durations, 30s-capability and legacy 60s assembly profiles. Measure JSON parse/contract success, canonical character match, duplicate/unknown IDs, thread count, prompt size, duration-vector/runtime derivation, romance-phase coherence and advantage continuity. Include truncated output, invented character, seed/outline conflict, missing payoff evidence, invalid state transitions, unsupported shot duration and vector/runtime mismatch. A failed result returns review/retry metadata and never mutates production data.

## TDD stubs

- legacy ledgers round-trip without mutation
- new plan accepts complete fields and rejects invalid episode ranges/duplicate IDs
- status transition table preserves parked/sequel/legacy statuses
- derived open-thread projection equals active canonical IDs
- stale `sourceBreakdownVersionId` and locked episode writes are rejected
- vector length other than 9, unsupported duration, manually inconsistent runtime and logical-shot/render-clip mapping errors are rejected
- benchmark fixtures run with no production DB or credentials

## Acceptance

An implementer can import one shared contract, validate one plan version, and distinguish planned, observed, audit and needs-review states without consulting free text. Focused Vitest tests pass before later sections consume the contract.

## UI/UX Contract

### Target User / JTBD
N/A — shared contract and no-write benchmark; no user-facing surface is changed in this section.

### Existing Pattern Reference
N/A — no UI is created or modified.

### Surface Inventory
N/A — no route, dialog, card or form.

### Component Map
N/A — no browser component.

### State Matrix
N/A — runtime states are service/schema states covered by Vitest.

### Responsive Matrix
N/A — no layout.

### Accessibility Acceptance
N/A — no browser interaction.

### Copy Contract
N/A — no user-facing copy.

### Browser Evidence Required
N/A — browser evidence begins in Section 06.
