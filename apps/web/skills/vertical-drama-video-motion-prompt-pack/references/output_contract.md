# Output Contract — Vertical Drama Video Motion Prompt Pack

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: video_plan_summary, provider_feasibility, video_clip_requests, plain_text_video_plan, final_episode_assembly_manifest, repair_loop, contract_version.

Imported-guide parity: upstream snake_case field names and literal constraints (e.g. `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, `handoff_type` constants) are preserved. SmartSpecPro may add fields but must not remove or rename required upstream fields.
