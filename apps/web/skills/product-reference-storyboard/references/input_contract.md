# Input Contract

Expected request payload for the unified production reference storyboard skill:

- `product_category`: required category selector; use a concrete category when available so the execution layer can append `references/product-categories/<category>.md`. Use `auto` only when uncertain.
- `reference_product_images`: required immutable product evidence; never redesign, recolor, reshape, relabel, re-materialize, or replace the product.
- `reference_character_images`: optional identity anchors for recurring people; preserve the same referenced face and avoid back-of-head/no-face identity frames when the storyboard may become video.
- `reference_environment_images`: optional scene, mood, lighting, and usage context only; never product truth and never competing sellable products.
- `product_label_text`: optional exact visible product text, markings, labels, package facts, dimensions, capacity, model names, or tags to preserve.
- `image_text_mode`: defaults to `no_text` for non-infographic styles. In `no_text`, do not render added camera-shot abbreviations, technical labels, frame labels, panel labels, corner labels, `storyboard_grid`, captions, subtitles, random glyphs, or shorthand such as `ECU`, `CU`, `MCU`, `MS`, `WS`, `ELS`, `LS`, `OS`, `HA`, or `LA`. `cinematic_style` = `info_graphics_realistic` or `info_graphics` overrides that default and requires concise large visible infographic text.
- `storyboard_layout_preset`: single source of truth for final canvas ratio, grid columns, grid rows, panel/cell count, and per-cell shape. Decode this field before writing the final prompt. Do not let `aspect_ratio`, `required_frame_count`, `storyboard_guide`, `voiceover_script`, or prose instructions override it. For `canvas_9_16_grid_3x3_frame_9_16_exact`, the final prompt must use one single 9:16 image, strict 3x3 grid, EXACTLY 9 PANELS / 9 CELLS ONLY, exactly 3 equal-width columns, exactly 3 equal-height rows, clean narrow gutters between panels, no collage/masonry layout, no labels, no numbers, and no text. Each panel occupies exactly one cell. Never split one panel into two cells. Wide shot means a wide field of view inside a vertical portrait panel, not a horizontal panel.
- `storyboard_guide`: optional visual shot-order, timing, camera, action, and continuity contract; use it to drive cinematic photorealistic quality, lighting, lens, depth, camera decisions, and exact Frame 1-N mapping.
- `voiceover_script`: optional spoken dialogue/narration contract that must align with the Storyboard Guide shots; preserve numbered/timed shot markers and parse them even if whitespace is collapsed.
- `production_concept_details`: Product Detail / Product Facts; product concept, audience, problem, hook, selling-point, real-use context, product-fact, and claim-safety guideline that must not override reference fidelity.
- `image_attempt_number`: Marketplace Auto Review image attempt number. Use it for audit and attempt-specific prompt diversity.
- `image_attempt_story_lens_id`, `image_attempt_story_lens_title`, `image_attempt_story_lens`: attempt-specific customer-journey direction. Use this lens to create a fresh prompt for every image attempt while preserving product truth, reference images, shot order, voiceover meaning, and the decoded storyboard layout preset. Vary hook situation, proof emphasis, scene rhythm, camera palette, human presence plan, and frame composition instead of copying the prior attempt.

Inputs should be explicit, current-run only, and deterministic.
