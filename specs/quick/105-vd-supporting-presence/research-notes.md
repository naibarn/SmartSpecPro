# Research notes

## Current flow

- `verticalDramaStoryboardGeneration.ts` validates nine storyboard shots and
  normalizes `characters`, `required_character_refs`, and `screen_caller_refs`.
- `verticalDramaEpisodePipeline.ts` projects storyboard shots into the durable
  `startFramePlan.frames[]` used by image generation.
- `verticalDramaStartFrameGeneration.ts` builds the per-shot start-frame prompt.
- `verticalDramaEpisodes.ts` resolves only `requiredCharacterRefs` into portrait
  attachments and already preserves explicit character/caller role assignments.
- `VerticalDramaStoryboardPanel.tsx` renders physical character chips and caller
  chips and exposes the `setShotCharacterReference` mutation through
  `VerticalDramaEpisodePage.tsx`.

## Root cause

Generic roles absent from the character roster cannot become valid character
refs. The existing fail-closed portrait resolver correctly refuses unknown refs,
but there is no separate text-only shot-local role contract for visible extras.

## Constraints

- Worktree is already dirty with unrelated Vertical Drama and media changes;
  only the new feature's files should be modified for this task.
- `requiredCharacterRefs` remains the authoritative identity-lock list.
- Existing explicit user scene/caller assignments must not be inferred from or
  overwritten by synopsis text.
- Legacy JSON must remain readable.
- Tests use the web app's existing Vitest setup and package manager conventions.

## Chosen approach

Add a bounded `supportingPresence` array plus a `supportingPresenceCustomized`
marker to the storyboard/start-frame contracts. Auto-detection is emitted by the
existing shotgrid generation call, while manual persistence is a direct JSONB
patch mutation. The UI uses a dedicated per-shot section with explicit local
scope copy and full controls.
