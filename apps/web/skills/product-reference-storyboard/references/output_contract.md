# Output Contract

This unified skill is primarily used by Media Studio Auto Prompt and must return plain prompt text only.

Do not return JSON, YAML, Markdown fences, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or other wrapper keys. Section labels are prompt instructions only and must not appear as visible text in the generated image. Do not replace the prompt with a source-shot label or summary.

Required storyboard behavior:

- Respect `storyboard_layout_preset`.
- Align `storyboard_guide` + `voiceover_script` as the primary shot-by-shot content contract when provided; do not invent a different story.
- Use `production_concept_details` as Product Detail / Product Facts and put the canonical product facts in one shared `PRODUCT VERIFY:` block.
- Use `product_category` to apply exactly one product-category rule file, but current product references and Product Detail always override category defaults.
- When `storyboard_guide` or `voiceover_script` contains numbered/timed shots, map those shots into `Frame 1` through `Frame N` in the same order before writing the prompt.
- For 3x3/9-frame output, each of the nine frame descriptions must include the source shot title/timing when available, visual beat, spoken meaning, product role/use cue, and character-face requirement when relevant.
- Completeness is mandatory: return all nine frames with non-empty visual-only prose before ending. Never stop mid-frame or return a bare label.
- Brevity must never remove frames or required global locks. A single source storyboard bullet such as `*: 33.3-40s. Visual: ...`, only the final shot, or any answer with fewer than nine `Frame N:` lines is invalid.
- Use compact visual-only frame prose. Every frame must begin with `Frame N:` and then describe only what should be seen in that panel, including the matched story meaning as visible action or emotion. Do not write `VISUAL:`, `STORY MATCH:`, `HUMAN REALISM:`, quoted voiceover lines, timecodes, subtitles, captions, or any other label inside frame text. Use one shared `CAMERA/LIGHT/DEPTH:` block for the full storyboard and one shared `PRODUCT VERIFY:` block for canonical product facts instead of repeating those labels in every frame.
- Include a `CINEMATIC REALISM LOCK` for cinematic photorealism, dimensional lighting, realistic lens/depth, motivated light, color continuity, and story-matched camera choices.
- The shared `CAMERA/LIGHT/DEPTH:` block must be one compact line specifying subject distance or lens feel, camera height/angle/movement, motivated light direction, exposure/contrast, depth separation, grounded shadows, color temperature/grade, and material-real highlights.
- Include a `CHARACTER FACE AND 95 PERCENT IDENTITY LOCK` whenever people appear, preserving face likeness without implying a 100 percent face clone, and avoiding waxy, plastic, CG-looking, blurred, cropped, hidden, back-of-head, or identity-swapped people.
- Character wardrobe must come from current character reference images or explicit user/product brief only; do not invent a new sweater, blazer, dress, accessory set, hairstyle, or makeup style to fit the room mood. Face-visible frame prose must require same referenced face, front/three-quarter visibility when face-visible, natural pores, subtle asymmetry, believable anatomy, no waxy/plastic skin, no beauty-filter smoothing, no distorted eyes/teeth/fingers.
- For video continuity, product interaction frames must show a clear front-facing or three-quarter referenced face with the product visible, or be hands-only/partial-body-without-head if the camera is POV/top-down. Avoid back-of-head or over-shoulder-with-hair/no-face frames as identity frames.
- Back-facing, rear-only, over-shoulder-with-hair, side/rear profile, or visible-head/shoulders-without-face frames are invalid by default for video-bound storyboards. The only exception is an explicitly requested rear-only shot with `VIDEO MOTION LOCK: rear-only shot, the person must not turn around, must not reveal a face, must not look back to camera, and must remain non-identifying through the entire video shot.` If the shot may ever turn, react, speak, smile, or reveal a face, start with a clear front-facing or three-quarter referenced face instead.
- Include a `PRODUCT REFERENCE LOCK`: explicitly state that `@Image1` / the first attached product reference image is the strict product visual lock and source of truth, and that the generated sellable product must match that reference exactly for appearance, proportions, construction, material, color, countable parts, and scale. Character/environment references may guide only character or room context, never product shape. Never add, remove, stretch, reshape, recolor, re-texture, relabel, simplify, or redesign the referenced product.
- Every product-visible frame must show the same canonical product instance. A frame where the person is correct but the product changes to a similar background object is fatal.
- From the product-introduction frame onward, product solution, proof, use, result, expectation-check, reconfirming-value, overview, confirmation, and CTA frames must visibly include the exact locked product. Frame 8 / reconfirming-value frames are product-critical and must show the same canonical product large enough to verify full silhouette, countable parts, material, colorway, scale, and no wrong nightstand/drawer/table substitution.
- Include one shared `PRODUCT VERIFY:` block that starts with a clear product visual lock from `@Image1` / first attached product reference image, then repeats the actual current product facts needed to prevent substitution. For a Greenforst 3-tier open bedside shelf, the block should say: product visual lock from @Image1 / first attached product reference image; Greenforst 3-tier open bedside shelf; 3 levels; 4 vertical posts; light wood finish; compact bedside scale; no drawers; no doors; no alternate nightstand.
- Do not show a second competing product or similar background object from environment references; environment references may provide room mood and architecture only.
- Include `TEXT RENDERING POLICY`. In non-infographic no-text mode, suppress readable non-product prop/background text: blank mugs/cups, blank or unreadable book covers and spines, unreadable screens, no visible prop logos, no wall-art words, no signage, no UI, and no readable numbers unless they are exact product markings to preserve. Explicitly forbid visible prompt labels, frame labels, timecodes, spoken-script text, or any instruction text from being rendered in the image.
- If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, require readable infographic composition with one large headline plus 2-4 short key points using the attached product reference image.
- For `canvas_9_16_grid_3x3_frame_9_16_exact`, describe a 9:16 final canvas with a 3x3 grid and exactly 9 distinct vertical frames storyboard panel, equal-sized panels, borderless edge-to-edge grid, zero white divider lines, zero black lines, zero gutters, zero margins, zero frame outlines, and zero separator lines.

Allowed plain-text shape:

OUTPUT FORMAT LOCK:
...

VIDEO IDENTITY SAFETY LOCK:
...

CINEMATIC REALISM LOCK:
...

PRODUCT REFERENCE LOCK:
Use @Image1 / the first attached product reference image as the strict product visual lock; the generated sellable product must match that actual reference exactly for appearance, proportions, construction, material, color, countable parts, and scale. Other reference images may guide character or environment only, never product shape.

CHARACTER FACE AND 95 PERCENT IDENTITY LOCK:
...

TEXT RENDERING POLICY:
...

CAMERA/LIGHT/DEPTH:
One shared concrete camera, light, depth, color, lens, and material-realism direction for the full grid.

PRODUCT VERIFY:
Product visual lock from @Image1 / first attached product reference image; then one concise canonical product fact list, e.g. product name/category, exact levels/posts/parts/material/color/scale, and no wrong substitutions.

SHOT-BY-SHOT STORYBOARD PROMPT:
9:16 final canvas, 3x3 grid, exactly 9 equal vertical frames storyboard panel.
Frame 1: Visual-only description of the first panel and the matched story meaning as visible action, with no rendered text.
Frame 2: Visual-only description of the second panel and the matched story meaning as visible action, with no rendered text.
Frame 3: Visual-only description of the third panel and the matched story meaning as visible action, with natural human-realism wording if a person appears.
Frame 4: Visual-only description of the fourth panel and the matched story meaning as visible action, with no rendered text.
Frame 5: Visual-only description of the fifth panel and the matched story meaning as visible action, with hands-only or natural human-realism wording if relevant.
Frame 6: Visual-only description of the sixth panel and the matched story meaning as visible action, with no rendered text.
Frame 7: Visual-only description of the seventh panel and the matched story meaning as visible action, with natural human-realism wording if a person appears.
Frame 8: Visual-only description of the eighth panel and the matched story meaning as visible action, with natural human-realism wording if a person appears.
Frame 9: Visual-only description of the ninth panel and the matched story meaning as visible action, with no rendered text.

Forbidden output shapes:

- `{"prompt":"..."}`
- `{"output":{"prompt":"..."}}`
- JSON scene arrays.
- Markdown code fences.
- Implementation notes or QA analysis before the prompt.
- A single generic `SCENE DESCRIPTION:` block when explicit shot-by-shot inputs are supplied.
- Frame text containing `STORY MATCH:`, `HUMAN REALISM:`, `VISUAL:`, quoted voiceover lines, timecodes, subtitles, or captions.
