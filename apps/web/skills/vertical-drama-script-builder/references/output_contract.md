# Output Contract — Vertical Drama Script Builder

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: episode_title, hook, structure, scene_dialogue_summary, cliffhanger, character_state_deltas, product_tie_in_plan, continuity_notes, warnings, repair_queue, contract_version.

All outputs are structured JSON; free-form prose only inside named string fields.
