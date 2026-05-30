# Input Contract

Expected request payload for Camera And Photography Reference Storyboard:

- `reference_product_images`: required product truth source for กล้องและอุปกรณ์ถ่ายภาพ.
- `reference_character_images`: optional identity anchors for people.
- `reference_environment_images`: optional scene, mood, lighting, and usage context only.
- `product_label_text`: optional exact visible product text, markings, labels, package facts, dimensions, or tags to preserve.
- `image_text_mode`: defaults to `no_text` for non-infographic styles. `cinematic_style` = `info_graphics_realistic` or `info_graphics` overrides that default and requires concise large visible infographic text; use `image_text_language` for the text language.
- `storyboard_guide`: optional visual shot-order, timing, camera, action, and continuity contract; use it to drive cinematic photorealistic quality, lighting, lens, depth, camera decisions, and exact Frame 1-N mapping when explicit shots are supplied.
- `voiceover_script`: optional spoken dialogue/narration contract that must align with the Storyboard Guide shots; preserve numbered/timed shot markers and parse them even if whitespace is collapsed.
- `production_concept_details`: optional product concept, audience, problem, hook, selling-point, product-fact, and claim-safety guideline that must not override product-reference fidelity.

Inputs should be explicit, current-run only, and deterministic.
