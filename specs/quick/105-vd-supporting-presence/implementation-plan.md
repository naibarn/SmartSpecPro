# Implementation plan

## Objective

Implement a backward-compatible, shot-local generic-person contract that is
auto-populated from structured storyboard output and fully editable by the user.

## Files and boundaries

### Shared contract

- `apps/web/shared/verticalDramaSeries/supportingPresence.ts` — types,
  normalization, count/status helpers, and prompt rendering.
- `apps/web/shared/verticalDramaSeries/contracts.ts` — additive fields on
  storyboard/start-frame frame shapes.

### Storyboard generation

- `apps/web/server/services/verticalDramaStoryboardGeneration.ts` — schema,
  prompt instructions, and server-side normalization of per-shot entries.
- `apps/web/skills/vertical-drama-storyboard-shotgrid/SKILL.md` — structured
  output and visibility rules.

### Start-frame planning/prompting

- `apps/web/server/services/verticalDramaEpisodePipeline.ts` — carry the field
  from storyboard to start-frame plan and preserve manual frame values.
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts` — accept and
  render supporting presence as text facts.
- `apps/web/server/routers/verticalDramaEpisodes.ts` — add a direct per-shot
  mutation for full replacement and preserve the field in relevant generation
  paths; keep portrait attachment resolution unchanged.

### UI

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
  — render the shot-local section and full custom controls.
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` — mutation wiring,
  invalidation, and localized toast/error handling.

## Behavior

1. A generated storyboard may include `supporting_presence` entries.
2. The server normalizes valid entries and keeps them only on their shot.
3. A start-frame plan copies them unless the frame is marked customized.
4. The user mutation replaces the entire array and marks it customized, allowing
   an empty array to intentionally suppress auto-detection.
5. Start-frame prompt generation receives only the effective shot-local array.
6. The image attachment manifest resolves only physical character portraits;
   supporting presence is never treated as a character key.

## Acceptance criteria

- Police example yields one visible generic police role on only the source shot.
- Villager/building-member group examples support bounded counts.
- Mention-only and off-screen/device-mediated references do not become visible
  supporting presence.
- User can add/edit/remove/suppress roles and changes survive regeneration.
- Other shots remain unchanged.
- Legacy payloads remain valid.

## Verification

- Shared pure helper tests.
- Storyboard schema/normalization tests.
- Start-frame prompt contract tests.
- Router mutation tests for replace/empty/customized behavior.
- Focused UI tests for display and controls.
- `git diff --check` and changed-surface TypeScript diagnostics.
