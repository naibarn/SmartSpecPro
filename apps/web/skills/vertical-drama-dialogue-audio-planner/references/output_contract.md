# Output Contract — Vertical Drama Dialogue & Audio Planner

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: dialogue_lines, speaker_mapping, voice_continuity_map, missing_voice_warnings, subtitle_cues, audio_timing_estimate, native_audio_snippets, separate_tts_plan, warnings, repair_queue, contract_version.

All outputs are structured JSON; free-form prose only inside named string fields.
