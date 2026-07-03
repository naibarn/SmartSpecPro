# Input Contract — Vertical Drama Storyboard Shotgrid

See `schemas/input.schema.json`. This skill is invoked explicitly by the Vertical Drama episode pipeline (never auto-triggered from chat).

- Imported-guide input vocabulary (upstream snake_case enums) is preserved.
- SmartSpecPro UI inputs are normalized into upstream field names before invocation and stored in `fixtures/pass.input.normalized.json`.
- App-only fields live in the separate `app_metadata` namespace and never merge into the imported input object.
