# Output Contract

This unified skill is primarily used by Media Studio Auto Prompt and must return plain prompt text only.

Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or other wrapper keys.

Required storyboard behavior:

- Respect `storyboard_layout_preset`.
- Align `storyboard_guide` + `voiceover_script` as the primary shot-by-shot content contract when provided; do not invent a different story.
- Use `production_concept_details` as Product Detail / Product Facts and repeat the relevant product facts inside every product-visible frame.
- Use `product_category` to apply exactly one product-category rule file, but current product references and Product Detail always override category defaults.
- When `storyboard_guide` or `voiceover_script` contains numbered/timed shots, map those shots into `Frame 1` through `Frame N` in the same order before writing the prompt.
- For 3x3/9-frame output, each of the nine frame descriptions must include the source shot title/timing when available, visual beat, spoken meaning, camera/lighting/color intent, product role/fidelity note, and character-face requirement when relevant.
- Use structured frame labels. Every frame must include `VISUAL:`, `CAMERA/LIGHT/DEPTH:`, and `STORY MATCH:`; every product-visible frame must include `PRODUCT VERIFY:`; every visible-human-identity frame must include `HUMAN REALISM:`. 
- Include a `CINEMATIC REALISM LOCK` for cinematic photorealism, dimensional lighting, realistic lens/depth, motivated light, color continuity, and story-matched camera choices.
- Each `CAMERA/LIGHT/DEPTH:` clause must specify subject distance or lens feel, camera height/angle/movement, motivated light direction, exposure/contrast, depth separation, grounded shadows, color temperature/grade, and material-real highlights.
- Include a `CHARACTER FACE AND IDENTITY LOCK` whenever people appear, preserving face likeness and avoiding waxy, plastic, CG-looking, blurred, cropped, hidden, back-of-head, or identity-swapped people.
- Character wardrobe must come from current character reference images or explicit user/product brief only; do not invent a new sweater, blazer, dress, accessory set, hairstyle, or makeup style to fit the room mood. Each `HUMAN REALISM:` clause must require same referenced face, front/three-quarter visibility when face-visible, natural pores, subtle asymmetry, believable anatomy, no waxy/plastic skin, no beauty-filter smoothing, no distorted eyes/teeth/fingers.
- For video continuity, product interaction frames must show a clear front-facing or three-quarter referenced face with the product visible, or be hands-only/partial-body-without-head if the camera is POV/top-down. Avoid back-of-head or over-shoulder-with-hair/no-face frames as identity frames.
- Back-facing, rear-only, over-shoulder-with-hair, side/rear profile, or visible-head/shoulders-without-face frames are invalid by default for video-bound storyboards. The only exception is an explicitly requested rear-only shot with `VIDEO MOTION LOCK: rear-only shot, the person must not turn around, must not reveal a face, must not look back to camera, and must remain non-identifying through the entire video shot.` If the shot may ever turn, react, speak, smile, or reveal a face, start with a clear front-facing or three-quarter referenced face instead.
- Include a `PRODUCT REFERENCE LOCK`: reference_product_images are immutable physical evidence. Never add, remove, stretch, reshape, recolor, re-texture, relabel, simplify, or redesign the referenced product.
- Every product-visible frame must show the same canonical product instance. A frame where the person is correct but the product changes to a similar background object is fatal.
- From the product-introduction frame onward, product solution, proof, use, result, expectation-check, reconfirming-value, overview, confirmation, and CTA frames must visibly include the exact locked product. Frame 8 / reconfirming-value frames are product-critical and must show the same canonical product large enough to verify full silhouette, countable parts, material, colorway, scale, and no wrong nightstand/drawer/table substitution.
- Each post-introduction product frame must include a frame-level `PRODUCT VERIFY:` phrase that repeats the actual current product facts needed to prevent substitution. For a Greenforst 3-tier open bedside shelf, the frame must say: same Greenforst open 3-tier shelf, top surface + middle shelf + bottom shelf visible, open sides/posts visible, light wood finish, compact bedside scale, no drawers, no doors, no alternate nightstand.
- Do not show a second competing product or similar background object from environment references; environment references may provide room mood and architecture only.
- Include `TEXT RENDERING POLICY`. In non-infographic no-text mode, suppress readable non-product prop/background text: blank mugs/cups, blank or unreadable book covers and spines, unreadable screens, no visible prop logos, no wall-art words, no signage, no UI, and no readable numbers unless they are exact product markings to preserve.
- If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, require readable infographic composition with one large headline plus 2-4 short key points using the attached product reference image.
- For `canvas_9_16_grid_3x3_frame_9_16_exact`, describe a 9:16 final canvas with a 3x3 grid and exactly 9 distinct vertical frames, equal-sized panels, borderless edge-to-edge grid, zero white divider lines, zero black lines, zero gutters, zero margins, zero frame outlines, and zero separator lines.

Allowed plain-text shape:

OUTPUT FORMAT LOCK:
...

VIDEO IDENTITY SAFETY LOCK:
...

CINEMATIC REALISM LOCK:
...

PRODUCT REFERENCE LOCK:
...

CHARACTER FACE AND IDENTITY LOCK:
...

TEXT RENDERING POLICY:
...

SHOT-BY-SHOT STORYBOARD PROMPT:
9:16 final canvas, 3x3 grid, 9 total vertical frames.
Frame 1: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ...
Frame 2: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... HUMAN REALISM or hands-only note if relevant.
Frame 3: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... PRODUCT VERIFY: ...
Frame 4: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... PRODUCT VERIFY: ...
Frame 5: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... PRODUCT VERIFY: ... HUMAN REALISM or hands-only note if relevant.
Frame 6: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... PRODUCT VERIFY: ...
Frame 7: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... PRODUCT VERIFY: ... HUMAN REALISM if person appears.
Frame 8: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... PRODUCT VERIFY: ... HUMAN REALISM if person appears.
Frame 9: VISUAL: ... CAMERA/LIGHT/DEPTH: ... STORY MATCH: ... PRODUCT VERIFY: ...

Forbidden output shapes:

- `{"prompt":"..."}`
- `{"output":{"prompt":"..."}}`
- JSON scene arrays.
- Markdown code fences.
- Implementation notes or QA analysis before the prompt.
- A single generic `SCENE DESCRIPTION:` block when explicit shot-by-shot inputs are supplied.
