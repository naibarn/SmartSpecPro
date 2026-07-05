# Output Contract — Vertical Drama Shot Start-Frame Render Planner

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: render_plan_summary, start_frame_requests, plain_text_render_plan, downstream_video_input_manifest, quality_control, contract_version.

Imported-guide parity: upstream snake_case field names and literal constraints (e.g. `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, `handoff_type` constants) are preserved. SmartSpecPro may add fields but must not remove or rename required upstream fields.

## Emotion-encoded prompts (expected quality bar)

`start_frame_requests[].prompt` is still just a `string` at the schema level (no
shape change), but `skill.md`'s "Encode emotion into every image prompt" section
requires every prompt to weave in facial micro-expression, mood lighting/color, and
power-dynamic composition drawn from the upstream storyboard shot's `emotion`,
`facial_expression`, `body_language`, and `gaze_direction` fields. A prompt that
reads as a flat physical description with no emotional/compositional detail fails
this quality bar even though it still validates as a non-empty string.
