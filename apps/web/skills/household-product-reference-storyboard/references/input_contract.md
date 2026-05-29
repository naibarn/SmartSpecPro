# Input Contract

Expected request payload for Household Product Reference Storyboard:

- `reference_product_images`: required product truth source for เครื่องใช้ในบ้าน.
- `reference_character_images`: optional identity anchors for people.
- `reference_environment_images`: optional scene, mood, lighting, and usage context only.
- `product_label_text`: optional exact visible product text, markings, labels, package facts, dimensions, or tags to preserve.
- `image_text_mode`: defaults to `no_text` for non-infographic styles. `cinematic_style` = `info_graphics_realistic` or `info_graphics` overrides that default and requires concise large visible infographic text; use `image_text_language` for the text language.
- `storyboard_guide` and `production_concept_details`: optional creative direction that must not override product-reference fidelity.

Inputs should be explicit, current-run only, and deterministic.
