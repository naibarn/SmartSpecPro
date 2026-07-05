# Output Contract — Vertical Drama Video Motion Prompt Pack

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: video_plan_summary, provider_feasibility, video_clip_requests, plain_text_video_plan, final_episode_assembly_manifest, repair_loop, contract_version.

Imported-guide parity: upstream snake_case field names and literal constraints (e.g. `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, `handoff_type` constants) are preserved. SmartSpecPro may add fields but must not remove or rename required upstream fields.

## Delivery-aware prompts + provider variants (optional superset)

`video_clip_requests[].prompt` remains a plain string, but `skill.md`'s "Weave
delivery + acting direction into every clip prompt" section requires every prompt
with dialogue to fold in the dialogue-audio-planner's per-line `delivery`/`subtext`
and the storyboard's `facial_expression`/`body_language`/`gaze_direction` as
continuous performance direction — not just camera movement.

`video_clip_requests[].provider_request` MAY additionally carry `grok_request`,
`seedance_request`, and `generic_request` sibling objects alongside the required
`veo31_request`, one per applicable provider family for the episode's selected
video model. These are optional objects (schema: `additionalProperties: true`, no
required shape) so existing callers that only read `veo31_request` are unaffected.
