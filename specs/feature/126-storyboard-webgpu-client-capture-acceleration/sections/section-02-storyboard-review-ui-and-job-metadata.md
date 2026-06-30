# Section 02: Storyboard Review UI And Job Metadata

## Objective

Expose WebGPU acceleration as an explicit opt-in option in Storyboard Review and
record what happened for support and rollout analysis.

## Scope

- Add a capture setting labeled `Use WebGPU acceleration`.
- Thai copy: `ใช้ WebGPU ช่วยเร่งการ capture`.
- Default off.
- Disabled state with reason when unsupported.
- Request payload includes acceleration preference and coarse capability report.
- Job projection shows selected preference, actual path, and fallback reason.

## UI Rules

- The option must not replace the `standard` / `high` quality selector.
- The option must not imply server verification is skipped.
- If enabled but unsupported at runtime, status copy must say the system fell
  back to server capture.
- Existing capture CTA remains the primary action.

## Tests

- UI hides or disables option when global or tenant flag is off.
- UI disables option when browser capability report is unsupported.
- Supported Chrome-like test environment can select the option.
- Capture request includes preference only when enabled by the user.
- Status panel displays fallback reason when server capture is used instead.

## Acceptance Criteria

- Users can clearly tell WebGPU is experimental.
- Users can capture normally without knowing WebGPU exists.
- Job metadata can answer: requested WebGPU, actually used WebGPU, or fell back.
