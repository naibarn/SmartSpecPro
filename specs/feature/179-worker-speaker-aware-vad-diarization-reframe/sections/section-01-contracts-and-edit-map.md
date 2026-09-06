# Section 01 — Contracts and Composed Edit Map

## Goal

Create the stable cross-boundary contracts that every later section consumes. Preserve current media/audio contracts and make the composed edit map the single source for preview, FFmpeg, and Remotion.

## Files owned

- `apps/web/shared/verticalDramaMedia/contracts.ts` or a focused sibling `speakerAwareContracts.ts`.
- `apps/web/shared/verticalDramaMedia/speakerAwareWorkflow.ts`.
- `apps/web/shared/verticalDramaMedia/__tests__/speakerAwareContracts.test.ts`.
- `apps/worker-app/src-tauri/src/speaker_aware_contracts.rs` only if Rust needs a serde mirror; keep names and enums aligned.

## Implementation tasks

1. Add strict schemas/types: `WorkflowRecipeV1`, `EditStageV1`, `AdapterPolicyV1`, `AdapterCapabilityV1`, subtitle evidence, VAD, diarization, visual tracks, active-speaker evidence, scan artifact, condensation proposal, camera action, composed edit map, render approval.
2. Extend media job kinds with `speaker_aware_media_scan` and `speaker_aware_edit_plan` without changing existing job semantics.
3. Add stage graph validation for user-selected order, dependency presence, source/derived artifact refs, and output-stage identity.
4. Add deterministic interval normalization, manual-over-automated precedence, adjacent compatible-range coalescing, source/output time mapping, and canonical hash generation using existing artifact hash helpers.
5. Represent unknown/conflict/unavailable explicitly. Do not make confidence or `speaker_id` mandatory when evidence is ambiguous; require a basis/conflict field instead.
6. Ensure all bounded numeric values reject NaN/infinite/negative durations and all storage refs are traversal-safe.

## TDD first

- Schema accepts subtitle-first 16:9 then 9:16 reframe and custom order.
- Schema rejects missing stage dependency, stale parent hash, invalid interval, and unlisted fallback.
- Deterministic composition gives the same hash for equivalent normalized input.
- Manual cuts win over dead-air suggestions; user-keep restores a suggested cut.
- Output-to-source mapping remains monotonic across multiple removed intervals.

## Exit evidence

Focused Vitest suite for contracts/workflow, Rust serde tests if mirror added, and `git diff --check`. No runtime adapter success is claimed here.

## UI/UX Contract

### Target User / JTBD
N/A for direct UI; this section defines the contract consumed by later UI sections.

### Existing Pattern Reference
Existing media editor and worker job contracts are reused; no new surface is created here.

### Surface Inventory
N/A; shared types only.

### Component Map
N/A; shared schemas/helpers only.

### State Matrix
N/A; states are represented as contract enums for section 07.

### Responsive Matrix
N/A; no visual surface.

### Accessibility Acceptance
N/A; later surfaces must expose all contract states accessibly.

### Copy Contract
N/A; error/message keys are defined by consuming UI sections.

### Browser Evidence Required
N/A for this section; browser evidence is produced in sections 07–08.
