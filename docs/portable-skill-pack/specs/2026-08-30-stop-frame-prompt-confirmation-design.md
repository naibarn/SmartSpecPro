# Stop Frame Prompt Confirmation and Image Generation Design

## Goal

Prevent accidental duplicate Stop Frame prompt-generation submissions and make
the generated Stop Frame image action available in the prompt section of the
Vertical Drama episode storyboard.

## Scope

- Add a confirmation step before creating a Stop Frame prompt for a shot,
  including regeneration when a prompt already exists.
- Track manually requested Stop Frame prompt generation per shot while the
  submit-and-poll flow is active; disable the prompt action for that shot.
- Add a `Generate stop-frame image` action below the Stop Frame prompt when a
  prompt exists. Reuse the existing image callback and credit confirmation.
- Keep the existing image-slot action unchanged unless the shared handler or
  tests require a consistency adjustment.
- No database, API contract, migration, provider, or credit-accounting changes.

## UI and component design

`VerticalDramaStoryboardPanel` remains the UI owner. Its prompt action will
open the existing `useVerticalDramaCreditConfirmation` dialog. The dialog copy
will explain that AI prompt generation may consume credits, with explicit
Cancel and Confirm actions. The Confirm callback invokes the page callback only
once, then the per-shot busy state prevents another submission until the page
flow settles.

The prompt section will render a compact image-generation button only when
`frame.stopFramePrompt` is non-empty. It will use the same confirmation hook,
existing `onGenerateStopFrameImage` callback, and
`generatingStopFrameImageForShot` state already used by the image-slot view.

## Data flow and busy state

The page owns a `Set<number>` for Stop Frame prompt generations started from
the UI. The page adds the shot before calling the existing async
`submitAndWaitForShotStopFramePrompt` flow and removes it in `finally`, covering
submit errors, polling errors, timeout, and success. The set is passed through
the existing storyboard panel/workspace props. This is a presentation guard;
the server's existing idempotency and task handling remain authoritative.

The image action continues to use the existing image-generation polling set and
error path. It must not appear before a prompt exists, and it must be disabled
while that shot's image is being submitted or polled.

## Failure and safety behavior

- Cancel closes the confirmation without invoking a callback.
- Confirm invokes exactly one callback and disables the prompt action for that
  shot immediately.
- Prompt-generation errors continue to surface through the existing toast
  path, and the busy state is cleared in all terminal paths.
- Image-generation errors continue to use the existing per-shot error display.
- No user input, authorization, tenant boundary, persisted data, or provider
  policy behavior changes.

## Verification

Add focused component/page tests for:

1. Prompt button opens confirmation and Cancel does not call the callback.
2. Confirm calls the prompt callback once and the prompt action is disabled
   while the shot is busy.
3. The image button is absent without a Stop Frame prompt and present with one.
4. Image confirmation Cancel does not call the image callback; Confirm does.
5. Existing image busy state disables the image button.

Run the focused Vertical Drama storyboard tests, the relevant episode prompt
flow tests, `git diff --check`, and the web build if available. Browser-level
authenticated verification is desirable but is not assumed available in the
local shell; skipped browser evidence must be reported explicitly.

## Alternatives considered

- UI-only confirmation: smaller diff, but it leaves a duplicate-submit window
  after confirmation while the async flow is still running.
- Native `window.confirm`: simple but inconsistent with the existing credit
  confirmation UX and harder to test/accessibly integrate.

