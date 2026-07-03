# Output Contract — Vertical Drama Product Tie-In Planner

Every output must validate against `schemas/output.schema.json` before it is persisted or handed to the next stage. A failed validation creates a repair request (`VerticalDramaValidationErrorReport`), never a silent continue.

Required top-level fields: tie_ins, claims_warnings, fatigue_history, warnings, repair_queue, contract_version.

All outputs are structured JSON; free-form prose only inside named string fields.
