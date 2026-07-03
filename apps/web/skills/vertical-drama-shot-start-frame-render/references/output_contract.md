# Output Contract — Vertical Drama Shot Start-Frame Render Planner

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: render_plan_summary, start_frame_requests, plain_text_render_plan, downstream_video_input_manifest, quality_control, contract_version.

Imported-guide parity: upstream snake_case field names and literal constraints (e.g. `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, `handoff_type` constants) are preserved. SmartSpecPro may add fields but must not remove or rename required upstream fields.
