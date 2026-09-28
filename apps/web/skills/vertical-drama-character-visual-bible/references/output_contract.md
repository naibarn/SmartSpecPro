# Output Contract — Vertical Drama Character Visual Bible

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields for normal output: visual_bible_summary, characters, plain_text_summary, storyboard_attachment_manifest, contract_version.

Candidate-mode exception: when `portrait_candidate_count` is present, require only
`portrait_candidate_batch` and `contract_version` at the top level. `plain_text_summary` is
optional for this lean contract.

Imported-guide parity: upstream snake_case field names and literal constraints (e.g. `layout="3x3"`, `shot_count=9`, `duration_seconds=60`, `handoff_type` constants) are preserved. SmartSpecPro may add fields but must not remove or rename required upstream fields.
