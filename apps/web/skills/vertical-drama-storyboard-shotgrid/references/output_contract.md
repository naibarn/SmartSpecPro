# Output Contract — Vertical Drama Storyboard Shotgrid

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: storyboard_summary, canonical_style_bible, shot_grid_plan, shots, plain_text_storyboard, storyboard_handoff_json, contract_version.

Imported-guide parity: upstream snake_case field names and literal constraints (e.g. `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, `handoff_type` constants) are preserved. SmartSpecPro may add fields but must not remove or rename required upstream fields.
