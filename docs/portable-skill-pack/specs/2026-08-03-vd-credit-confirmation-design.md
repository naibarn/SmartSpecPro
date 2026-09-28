# Vertical Drama credit-action confirmation design

## Goal

Prevent accidental duplicate credit-consuming jobs in the Vertical Drama
workflow by requiring an explicit confirmation immediately before each paid
action starts.

## Scope

Cover every client action in the Vertical Drama workflow whose server path can
deduct credits:

- Episode/Storyboard: real storyboard/stage generation, prompt generation,
  prompt + image, image renders, video-safe frames, angle grids, reference
  frames, video prompts, video clips, dialogue/audio generation, quality or
  repair generation, and other paid AI generation controls.
- Characters: prompt previews, portraits, candidate batches, sheets, angle
  packs, look renders, and voice previews.
- Locations: prompt previews and image renders.
- Series Trailer: narration audio generation and trailer assembly when the
  existing flow starts them together.

Free edits, copy/download, approvals, asset status changes, deletion, model
selection, and QC checks remain unchanged and do not show this dialog.

## UX and behavior

1. Clicking a paid action opens one shared confirmation dialog and does not call
   the existing handler or mutation.
2. The dialog explains that the action uses AI and may deduct credits. When a
   reliable existing estimate is already available, it is displayed; no new
   pricing request is introduced solely for the dialog.
3. Cancel/escape/backdrop close leaves the existing data and mutation state
   untouched.
4. Confirm invokes the original action exactly once, then closes the dialog.
5. The source action and dialog confirm button are disabled while the relevant
   existing mutation/orchestration is pending. Existing per-shot/per-character
   pending keys remain the source of truth.
6. Existing confirmation flows are migrated to the shared dialog or retained
   where they already represent a multi-step review. No paid action gets a
   second nested confirmation.
7. Existing payloads, mutation names, idempotency keys, polling, cache
   invalidation, toasts, error handling, and credit deduction/refund behavior
   are not changed.

## Implementation shape

- Add a reusable `VerticalDramaCreditConfirmDialog` based on the repository's
  existing Radix `AlertDialog` primitives.
- Keep confirmation state close to each owner component/handler so typed action
  payloads and existing pending state are preserved. Do not add a global click
  interceptor.
- Use action-specific labels and test IDs while sharing the dialog layout and
  warning copy.
- Add focused component tests for cancel, confirm-once, and pending/duplicate
  click behavior across representative image, video, character/location, and
  trailer actions.

## No-duplicate confirmation rules

The new gate is added at the first paid entry point only. The implementation
must use this classification before adding any wrapper:

| Existing UI | Treatment |
| --- | --- |
| Storyboard inline paid confirmations for real storyboard, start-frame plan, video prompt pack, all-image render, single-image render, angle grid, and video regeneration | Retain the existing paid confirmation; do not add another gate around the confirm callback. |
| Storyboard prompt + image mode chooser | Keep the mode chooser first, then open one paid confirmation for the selected mode; only the final confirmation invokes the existing handler. |
| Storyboard video-safe frame, first video render, shot video prompt, reference-frame prompt/image, and other direct paid buttons without a paid confirm | Add one shared confirmation at their click entry point. |
| Quality-review apply/loop and other domain-specific AlertDialogs | Keep their existing dialog as the paid confirmation when the action is already gated there; do not wrap it again. |
| Character portrait prompt preview followed by `MediaPromptPreview` approval | Add a gate before the prompt-preview mutation because that LLM call itself consumes credits. Keep the prompt-review approval because it is a separate approval before the image render and prevents regenerating the prompt. |
| Character sheet, angle pack, candidate batch, look render, and voice preview direct actions | Add one shared confirmation before the existing mutation; do not change the existing preview/poll/finalize chain. |
| Location prompt preview followed by image approval/render | Add a gate before prompt preview only if that path is credit-gated (it is); keep the existing prompt display as content review, not a second duplicate credit gate. Add a separate gate before the later image render. |
| Trailer button that sequentially calls narration audio and trailer assembly | Add one confirmation before the composite handler, not one dialog per internal request. |
| Dialogue/audio batch button that already has an inline paid confirmation in `VerticalDramaDialogueAudioPanel` | Retain that existing confirmation; do not wrap `onGenerateBatch` again at the page handler. |
| Delete/approve/reject/status/QC/model-selection confirmations | Leave unchanged; these are not credit confirmations. |

The shared dialog therefore replaces or is intentionally skipped for existing
paid confirmations, while content-review dialogs remain when they protect a
different downstream charge. Tests must assert that each entry point has one
and only one paid confirmation before its first credit-consuming request.

## Acceptance criteria

- Every identified credit-consuming Vertical Drama button requires an explicit
  confirmation before the first paid request.
- Repeated clicks before confirmation do not enqueue or charge any job.
- Repeated clicks while a confirmed job is pending do not enqueue another job.
- Canceling does not mutate server state.
- Confirming once preserves the exact existing request and successful result
  behavior.
- Existing non-paid controls and already-working preview/review flows behave as
  before.
- Focused tests and the relevant web build/type checks pass.

## Risks and mitigations

- Missing a paid entry point: inventory client handlers against server credit
  deduction paths and add a test checklist for each surface.
- Double confirmation: search every migrated handler and ensure only the
  dialog's confirm callback calls the original handler.
- Changing a multi-step flow: wrap only the first paid entry point; leave
  downstream chained mutations untouched.
- Stale cost text: show estimates only when already present and label the
  dialog as an estimate; never block generation on a new cost lookup.
