# Implementation Plan

## Objective

Expose one GPT Image 2 selection while selecting the correct Kie upstream model
from the presence of reference images.

## Changes

1. Write focused Python tests for conditional provider-model resolution.
2. Add a small helper in `kie_ai_provider.py` that uses
   `kie_model_id_with_references` only when references are present.
3. Update the Kie seed catalog canonical row with optional `input_urls`, a four
   image limit, merged aliases, and variant metadata. Keep the legacy row disabled.
4. Add migration `0212_kie_gpt_image_2_auto_routing.sql` with the same canonical
   metadata and compatibility aliases.
5. Add focused TypeScript/SQL contract tests only if existing coverage cannot
   prove the seed and migration invariants.

## Risks And Mitigations

- Other Kie models: require explicit metadata; add a non-opt-in regression test.
- Saved selections: preserve the existing canonical ID and alias the old I2I ID.
- Reseeding: update seed state and migration state together.
- Input shape: retain existing configurable reference input key logic and set it
  to `input_urls`.

## Acceptance Criteria

- One enabled GPT Image 2 row is returned to selectors.
- No references submit the text-to-image upstream ID.
- References submit the image-to-image upstream ID and `input_urls`.
- Up to four references are accepted by existing UI/config limits.
- Other models retain their current resolution.
- Focused Python and web tests pass after the final change.

## Rollout

Apply the additive migration, deploy web and Python services together, then verify
one no-reference and one reference request in normal application smoke testing.
