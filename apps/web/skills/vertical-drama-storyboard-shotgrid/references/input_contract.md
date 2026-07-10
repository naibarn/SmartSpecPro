# Input Contract — Vertical Drama Storyboard Shotgrid

See `schemas/input.schema.json`. This skill is invoked explicitly by the Vertical Drama episode pipeline (never auto-triggered from chat).

- Imported-guide input vocabulary (upstream snake_case enums) is preserved.
- SmartSpecPro UI inputs are normalized into upstream field names before invocation and stored in `fixtures/pass.input.normalized.json`.
- App-only fields live in the separate `app_metadata` namespace and never merge into the imported input object.
- `story_source.drama_skill_json` (added 2026-07-07, story-density reform) may be the dialogue-complete `vertical-drama-script-builder` output — beats carrying `dialogue_lines[]`, per-beat `estimated_speech_seconds`, and a top-level `speech_budget`. When it is, `skill.md`'s "Shot-to-beat attribution and silence budget" section applies. When it is not (legacy/summary-only script), shot-to-beat attribution fields remain optional.
