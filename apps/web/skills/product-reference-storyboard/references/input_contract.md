# Input Contract

Expected request payload for the unified production reference storyboard skill:

- `product_category`: required category selector; use a concrete category when available so the execution layer can append `references/product-categories/<category>.md`. Use `auto` only when uncertain.
- `reference_product_images`: required immutable product evidence; never redesign, recolor, reshape, relabel, re-materialize, or replace the product.
- `reference_character_images`: optional identity anchors for recurring people; preserve the same referenced face and avoid back-of-head/no-face identity frames when the storyboard may become video.
- `reference_environment_images`: optional scene, mood, lighting, and usage context only; never product truth and never competing sellable products.
- `product_label_text`: optional exact visible product text, markings, labels, package facts, dimensions, capacity, model names, or tags to preserve.
- `image_text_mode`: defaults to `no_text` for non-infographic styles. `cinematic_style` = `info_graphics_realistic` or `info_graphics` overrides that default and requires concise large visible infographic text.
- `storyboard_guide`: optional visual shot-order, timing, camera, action, and continuity contract; use it to drive cinematic photorealistic quality, lighting, lens, depth, camera decisions, and exact Frame 1-N mapping.
- `voiceover_script`: optional spoken dialogue/narration contract that must align with the Storyboard Guide shots; preserve numbered/timed shot markers and parse them even if whitespace is collapsed.
- `production_concept_details`: Product Detail / Product Facts; product concept, audience, problem, hook, selling-point, real-use context, product-fact, and claim-safety guideline that must not override reference fidelity.

Inputs should be explicit, current-run only, and deterministic.
