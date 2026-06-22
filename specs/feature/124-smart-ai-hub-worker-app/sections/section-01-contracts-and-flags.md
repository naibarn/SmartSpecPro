# Section 01: Contracts And Flags

## Goal

Add the shared contracts and fail-closed feature flags that make HyperFrames
final composite a first-class desktop worker job type without changing runtime
behavior yet.

## Dependencies

None.

## In Scope

- Shared job type and schemas for `hyperframes_final_composite`.
- Progress stages, failure codes, capability families.
- Worker runtime schema exports.
- Feature flag for worker-backed HyperFrames final composite.
- Status mapping primitives used by later sections.

## Files To Review

- `apps/web/shared/workerRuntime.ts`
- `apps/web/shared/featureFlags.ts`
- `apps/web/shared/hyperframes/contracts.ts`
- `apps/web/shared/hyperframes/runtimeApiSchemas.ts`
- `apps/web/shared/hyperframes/limits.ts`
- `apps/web/shared/__tests__/featureFlags.test.ts`
- `apps/web/shared/__tests__/workerRuntime.test.ts`
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`

## Files To Change

- `apps/web/shared/workerRuntime.ts`
- optional `apps/web/shared/workerRuntimeHyperframes.ts`
- `apps/web/shared/featureFlags.ts`
- shared tests listed above

## Test First

- Test: schema accepts `hyperframes_final_composite`.
- Test: invalid HyperFrames progress stage fails schema validation.
- Test: invalid HyperFrames failure code fails schema validation.
- Test: capability hints include `hyperframes-final-composite`,
  `official-hyperframes-runtime`, `browser-render`, `thai-fonts`,
  `ffmpeg-probe`.
- Test: worker input requires composition hash, timeline hash, template/version,
  asset manifest, and output requirements.
- Test: feature flag defaults fail-closed.
- Test: final composite 300s max and 30s shot max remain enforced.

## Implementation Steps

1. Add constants for HyperFrames final composite progress and failure vocabularies.
2. Add a Zod contract for `HyperframesFinalCompositeWorkerInput`.
3. Add a Zod contract for asset manifest and output requirements.
4. Extend worker job type validation so `hyperframes_final_composite` is
   recognized for `desktop_zeroclaw_managed`.
5. Add capability-family helpers used by scheduler and worker heartbeat.
6. Add fail-closed feature flag such as `hyperframesWorkerFinalComposite`.
7. Add minimal status mapping helpers that later sections can use to map worker
   state to HyperFrames projection state.

## Important Constraints

- Do not enable runtime behavior in this section.
- Do not migrate existing outbox jobs here.
- Keep schemas backward-compatible for existing job types.
- Prefer a focused companion shared file if `workerRuntime.ts` becomes too large.

## Acceptance Criteria

- Shared contract tests pass.
- Existing worker runtime tests still pass.
- TypeScript consumers can import the HyperFrames job contract.
- Feature flag is present and disabled by default.

## UI/UX Contract

### Target User / JTBD

This section has no direct visual surface. Its user impact is indirect: creators,
operators, admins, and the desktop app must all see the same job state labels,
failure categories, and capability requirements once later sections expose them.

### Surface Inventory

- Storyboard Review final composite status panel, populated later by section 05.
- User job monitor, populated later by section 09.
- Admin worker monitor, populated later by section 10.
- Smart AI Hub Worker App capability/status surfaces, populated later by
  section 07.

### Component Map

- No React/Tauri components are implemented in this section.
- Shared exported contracts must provide stable labels/codes consumed by later
  UI components without each UI inventing its own vocabulary.

### State Matrix

- Feature flag off: UI consumers must be able to show a clear disabled/blocker
  state.
- Unsupported worker capability: UI consumers must be able to name the missing
  capability family.
- Invalid job input/progress/failure code: UI consumers must receive a safe,
  user-readable fallback category and preserve detailed diagnostics for support.

### Responsive Matrix

No layout changes in this section. Later surfaces must treat these contract
values as short labels that fit mobile and desktop cards without wrapping into
unusable text.

### Accessibility Acceptance

Shared labels must be plain text, not icon-only state. Error and progress codes
must map to screen-reader-friendly copy in later sections.

### Copy Contract

Use consistent Thai/English-ready concepts: waiting in queue, claimed by worker,
rendering, verifying, completed, canceled, failed, needs user action, and missing
capability. Do not expose internal enum names directly to normal users.

### Browser Evidence Required

No browser evidence is required for this section alone. Evidence is required in
sections 05, 09, and 10 when these contracts appear on screen.
