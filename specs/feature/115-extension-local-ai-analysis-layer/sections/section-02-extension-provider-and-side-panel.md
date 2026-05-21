# Section 02 - Extension Provider And Side Panel

Status: IMPLEMENTED

## Objective

Implement Prompt API provider detection/generation and expose it through the current side panel UX.

## Scope

- `apps/extension/src/panel/App.tsx`
- provider modules under `apps/extension/src/ai/` or equivalent
- side panel state, status display, and user actions
- optional service worker/offscreen message bridge only if Prompt API is unavailable in side panel

## Implementation Notes

- Detect `globalThis.LanguageModel` at runtime.
- Do not add a hard manifest permission that makes unsupported Chrome profiles fail.
- Do not add expired origin-trial permissions such as `aiLanguageModelOriginTrial`.
- Call `LanguageModel.availability()` with the same expected input/output options used for `LanguageModel.create()` and `prompt()`.
- Create Prompt API sessions only after a user action.
- Show download progress when Chrome reports it.
- Add an explicit provider decision matrix for:
  - API missing
  - unavailable
  - downloadable
  - downloading
  - available
  - thrown detection/generation errors
- Provider priority: `chrome_prompt_api`, `server_ai`, `noop`.
- Existing buttons and flows such as Detect, Scan visible products, Scan & Review, Upload selected, and Analyze capture must remain.
- If `LanguageModel` is not exposed in side panel, test offscreen document before considering service worker execution.
- Add cancel behavior with `AbortController` for active analysis or download/session creation when Chrome supports cancellation.

## Tests First

- Side panel renders Local AI unavailable when `LanguageModel` is undefined.
- Existing scan/capture flow still works when provider detection throws.
- Provider selection falls back to server AI/noop after Prompt API error.
- Downloadable state shows user-facing status and does not auto-download on panel load.
- Downloading state shows progress and supports cancel/fallback.
- Available state can complete local ProductBrief generation.
- Unavailable state keeps raw capture and server Analyze usable.

## Acceptance Criteria

- Prompt API optionality is visible to users.
- Unsupported Chrome has no capture regression.
- Model download cannot start without user action.
- Supported Chrome can analyze locally without changing existing upload/analyze behavior.

## Implementation Result

- Added runtime `LanguageModel` detection and provider decision in `apps/extension/src/shared/localAi.ts`.
- Added side panel Local AI section in `apps/extension/src/panel/App.tsx` with status, provider state, settings, progress, cancel, create brief, sync, and storytelling actions.
- Existing Detect, Scan, Scan & Review, Upload selected, and server Analyze flows remain in place.
- Prompt API session creation happens only from the Create Product Brief action.
