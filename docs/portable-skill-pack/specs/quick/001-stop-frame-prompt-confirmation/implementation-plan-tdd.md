# Implementation Plan TDD

## Tests first

Add a focused `VerticalDramaStoryboardPanel` test using a shot fixture with a
Stop Frame prompt and callbacks for prompt/image generation. The tests should
first fail because the prompt callback currently fires directly and the image
button is absent in the prompt section.

Required scenarios:

1. Click prompt generation → confirmation appears; click Cancel → prompt
   callback count remains zero.
2. Click Confirm → prompt callback count is one; with the shot in
   `generatingStopFramePromptForShot`, the action is disabled and shows loading
   state.
3. Without `stopFramePrompt`, the prompt-section image button is absent.
4. With `stopFramePrompt`, image button appears; image confirmation Cancel does
   not invoke the image callback and Confirm invokes it once.
5. With the shot in `generatingStopFrameImageForShot`, image button is disabled.

Use the existing credit-confirm dialog DOM/test-id contract rather than mocking
the hook. Keep provider/network calls out of the component tests.

## Implementation order

1. Add the failing panel tests and run the focused file.
2. Add prop/data pass-through and page busy lifecycle.
3. Add prompt confirmation and missing image action.
4. Rerun focused tests, then related tests and build.
5. Run `git diff --check` and inspect only owned hunks.

## Regression checks

- Existing Start Frame confirmation tests/behavior remain unchanged.
- Existing Stop Frame image-slot action remains confirmation-gated and disabled
  during polling.
- The page's existing stop-frame prompt submit/poll mutation contract and
  idempotency key generation remain unchanged.
