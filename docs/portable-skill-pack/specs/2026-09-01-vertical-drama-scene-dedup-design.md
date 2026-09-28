# Vertical Drama Scene Identity and Near-Duplicate Prevention

## Objective

Prevent Marketplace/Special Tie-in flows from creating multiple location-roster rows for the same physical scene when AI-generated labels vary, while preserving genuinely distinct sub-locations and approved media.

## Design

The system keeps exact `locationKey` identity authoritative and adds a shared, deterministic name-similarity layer. Exact normalized matches are reused automatically. Approximate matches are returned as review candidates and are never silently merged. Special Tie-in scene provisioning uses the same identity lookup before creating a new hashed slot.

When a candidate is returned, the user chooses an existing scene or explicitly creates a new one. The selected canonical location key is persisted in the Special Tie-in input so later worker/recovery paths cannot create another scene from the original wording.

Existing duplicate rows are not deleted in this change. A later merge action can be added with explicit source/target selection, asset preservation, storyboard rebinds, and auditability.

## Safety and boundaries

- All lookup and mutation operations remain tenant/user/series scoped.
- Approximate matching is advisory only; no fuzzy auto-merge.
- Existing approved assets remain attached to their current location until an explicit merge workflow exists.
- No paid generation, provider call, or automatic database cleanup is introduced.

## Acceptance criteria

- Same scene labels differing only in case, whitespace, Unicode normalization, or punctuation reuse one roster row.
- Special Tie-in selection exposes near-match candidates and pauses scene-slot creation until the user chooses reuse or create-new.
- A chosen existing scene key is carried through episode creation, execution, recovery, and storyboard materialization.
- Candidate scoring is deterministic, bounded, and covered by false-positive tests.
- Existing duplicate rows remain recoverable and are not silently removed.
