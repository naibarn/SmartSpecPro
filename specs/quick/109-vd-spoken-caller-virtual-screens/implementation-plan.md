# Implementation plan

## Objective

Make spoken phone callers a deterministic visual contract: screen-only,
vertical virtual phone screen, visible caller face for the whole shot, and one
separate screen per spoken caller.

## Affected modules

1. `apps/web/shared/verticalDramaSeries/spokenCallerVirtualScreen.ts`
   - Add normalized input/output types and pure derivation/rendering helpers.
   - Keep explicit caller roles authoritative and preserve dialogue order.
2. `apps/web/shared/verticalDramaSeries/index.ts`
   - Export the shared helper.
3. `apps/web/server/services/verticalDramaStartFrameGeneration.ts`
   - Add spoken-caller inputs to the start-frame prompt contract.
   - Render the shared virtual-screen directive and ensure caller portraits do
     not enter the physical-scene reference list.
4. `apps/web/server/services/verticalDramaEpisodePipeline.ts`
   - Derive spoken caller data from the canonical shot speaker order and pass it
     into each start-frame shot request without changing authoritative arrays.
5. `apps/web/server/services/verticalDramaVideoMotionPromptGeneration.ts`
   - Add per-shot caller refs and dialogue speaker keys to the motion prompt
     input and render an equivalent directive in bulk and single-shot prompts.
6. Focused tests beside the shared helper, start-frame generation, and video
   prompt generation.

## Implementation approach

First write failing pure-policy tests for one caller, multiple callers, silent
caller, unmatched speaker, and duplicate speaker order. Implement the helper
with stable first-appearance ordering and no mutation. Then thread the result
through start-frame planning and motion-prompt generation. Keep legacy prompt
output unchanged when no spoken caller is present, except for the new explicit
contract when the derived list is non-empty.

The policy should return:

- `physicalSceneCharacterRefs`: the input scene refs with spoken callers
  removed;
- `screenCallerCharacterRefs`: all explicit screen callers;
- `spokenScreenCallerCharacterRefs`: explicit callers found in dialogue order;
- `virtualScreens`: `{ callerCharacterRef, screenIndex, orientation,
  visibleFaceRequired }[]`.

The prompt text must say that each virtual screen is vertical, visible for the
entire shot, contains the corresponding caller's face, and is the only place
that caller appears. It must also say that multiple screens remain separate and
must not be fused or replaced by a shared group call.

## Risks and mitigations

- Character labels may differ between dialogue and refs: use the same canonical
  key matching already used by the current caller contracts; do not broaden to
  synopsis inference.
- Dual-view/barrier logic may intentionally change physical composition: spoken
  caller policy runs only for explicit phone callers and must not rewrite
  barrier assignments.
- Prompt snapshots may change only for shots with spoken callers: update or add
  focused assertions rather than broad snapshots.
- Dirty worktree overlap: inspect diffs before editing and use only targeted
  patches.

## Acceptance criteria

- Shared helper tests pass for all policy cases.
- Start-frame prompt includes separate vertical screen directives and keeps
  spoken callers out of physical refs.
- Video-motion prompt includes the same directives and preserves speaker order.
- Pipeline passes canonical dialogue order into start-frame policy.
- No-caller/silent-caller focused regressions pass.
- `git diff --check` passes.

## Rollout and verification

No migration or deployment step is required. Regeneration automatically derives
the policy from current shot data. Run the focused Vitest suites and changed
file diagnostics; record unrelated baseline failures separately.
