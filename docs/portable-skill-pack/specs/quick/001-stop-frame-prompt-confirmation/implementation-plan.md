# Implementation Plan

## Objective

Make Stop Frame prompt creation safe against accidental duplicate clicks and
complete the visible prompt workflow with a paid, confirmation-gated image
generation action.

## Current-codebase fit

Keep `VerticalDramaStoryboardPanel` presentational. Reuse its existing
`requestConfirmation`/`creditConfirmDialog` pattern and the image polling props
already used by the Stop Frame slot. Keep lifecycle state in
`VerticalDramaEpisodePage`, which already owns prompt submission and polling.

## Work items

1. Add `generatingStopFramePromptForShot?: ReadonlySet<number>` to the panel
   prop contract and the workspace pass-through contract/calls.
2. Add a page-owned prompt-generation set. In
   `handleGenerateStopFramePrompt`, reject/return if the shot is already in the
   set, add it before the async flow, and remove it in `finally`.
3. Replace the visible prompt section's direct callback with a confirmation
   request. Use bilingual copy, a shot-specific test id, and disable the action
   while that shot is busy. Show a spinner/"Generating" label while busy.
4. Add a compact image button beside/below the prompt action only when
   `frame.stopFramePrompt.trim()` is truthy. Its click opens the existing paid
   confirmation and its confirm callback invokes `onGenerateStopFrameImage`.
   Reuse `generatingStopFrameImageForShot` for disabled/loading behavior and
   also disable it while the prompt is being regenerated to avoid rendering
   from a prompt that is about to be replaced.
5. Add or extend a focused panel test file for confirmation cancel/confirm,
   prompt busy state, prompt-gated image visibility, image cancel/confirm, and
   image busy state.

## Risks and mitigations

- Async prompt polling may fail or time out: `finally` clears the local set.
- Existing persisted in-flight tasks may resume after reload: leave existing
  durable task recovery untouched; the UI's current task marker remains the
  source for image polling.
- Two panel render paths may expose similar controls: change only the visible
  prompt section missing the image action and preserve the existing slot action.
- Long bilingual labels may compress on mobile: use the existing compact flex
  layout, accessible button names, and responsive wrapping already used in the
  card.

## Acceptance criteria

- First-time and regeneration Stop Frame prompt clicks open confirmation.
- Cancel never invokes prompt generation.
- Confirm invokes generation once and disables that shot's prompt action until
  the async flow settles.
- Prompt generation busy state clears on success, failure, and timeout.
- Stop Frame image button is absent without a prompt and present with one.
- Image action uses confirmation, invokes the existing callback only on Confirm,
  and is disabled while image generation is active.
- Existing Stop Frame image-slot behavior remains intact.
- Focused tests and web build pass; browser evidence is recorded as skipped if
  authenticated browser tooling is unavailable.

## Rollout and verification

No migration or deployment step. Run the focused Vitest file, related Vertical
Drama page/prompt tests, `git diff --check`, and the web build. Review the final
diff to ensure unrelated dirty files are unchanged.
