# Output Contract

This skill is primarily used by Media Studio Auto Prompt and must return plain prompt text only.

The output must be directly usable in the Media Studio prompt textarea. Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or other wrapper keys.

Required storyboard behavior:
- Respect `storyboard_layout_preset`.
- Align `storyboard_guide` + `voiceover_script` as the primary shot-by-shot content contract when provided; do not invent a different story.
- When `storyboard_guide` or `voiceover_script` contains numbered/timed shots, map those shots into `Frame 1` through `Frame N` in the same order before writing the prompt.
- For 3x3/9-frame output, each of the nine frame descriptions must include the source shot title/timing when available, visual beat, spoken meaning, camera/lighting intent, product role/fidelity note, and character-face requirement when relevant.
- Do not output one generic `SCENE DESCRIPTION:` summary for explicit storyboard runs. Use `SHOT-BY-SHOT STORYBOARD PROMPT`/`STORYBOARD PROMPT` with frame-level mapping. Category default frame maps are fallback only when no explicit guide/script shot list is provided.
- Include a `CINEMATIC REALISM LOCK` for cinematic photorealism, dimensional lighting, realistic lens/depth, and story-matched camera choices.
- Every explicit storyboard prompt must include a frame-level camera/light/color note: lens or subject distance, camera angle or movement cue, key/practical/back light, depth separation, color temperature, and palette continuity. Reject flat catalog, real-estate listing, or generic bright-room photos.
- Include a `CHARACTER FACE AND IDENTITY LOCK` whenever people appear, preserving face likeness and avoiding waxy, plastic, CG-looking, blurred, cropped, or identity-swapped people.
- For video continuity, product interaction frames must show a clear front-facing or three-quarter referenced face with the product visible, or be hands-only/partial-body-without-head if the camera is POV/top-down. Avoid back-of-head or over-shoulder-with-hair/no-face frames as identity frames.
- For `canvas_9_16_grid_3x3_frame_9_16_exact`, describe a 9:16 final canvas with a 3x3 grid and exactly 9 distinct vertical frames.
- Use equal-sized panels and keep the storyboard edge-to-edge unless the user asks for another layout.
- Include `TEXT RENDERING POLICY`, `CINEMATIC REALISM LOCK`, `CHARACTER FACE AND IDENTITY LOCK` when people appear, `PRODUCT REFERENCE LOCK`, `PRODUCT PHYSICAL PROPORTION LOCK`, and `PRODUCT SCALE LOCK`.
- If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, `TEXT RENDERING POLICY` must require a readable infographic with one large headline and 2-4 short key points using the attached product/reference image; do not apply the no-added-visible-text policy in this case.
- In non-infographic no-text mode, suppress readable non-product prop/background text: blank mugs, blank/spineless books, unreadable screens, no visible prop logos, no wall-art words, no signage, no UI, and no readable numbers unless they are exact product markings to preserve.
- Preserve exact เครื่องเขียน product category, shape, proportions, material, texture, colorway, markings, package facts, and scale from current references.
- Product references override environment references. Never add, remove, stretch, reshape, recolor, re-texture, relabel, simplify, or redesign the referenced product.
- Repeat canonical product facts inside every product-visible frame, including countable parts, material/finish/color, support/base/leg/post structure, scale, markings, and no-go substitutions.
- Product-visible intro/result/scale/overview/hero frames must show the full silhouette with all countable parts visible enough to count; detail close-ups may crop tighter but must not imply changed or missing product parts.
- Lifestyle/result/confirmation/overview/CTA frames must show the same canonical product instance as earlier product frames. A frame where the person is correct but the product changes to a similar background object is fatal.
- Do not show a second competing product or similar background object from environment references; a similar nightstand/shelf/cabinet/table/organizer/device/package/etc. replacing or competing with the referenced product is fatal product contamination.
- Reject current-reference contamination from old uploads, previous generations, unrelated people, unrelated rooms, or background objects.

Allowed plain-text shape:

OUTPUT FORMAT LOCK:
...

TEXT RENDERING POLICY:
...

CINEMATIC REALISM LOCK:
...

CHARACTER FACE AND IDENTITY LOCK:
...

PRODUCT REFERENCE LOCK:
...

PRODUCT PHYSICAL PROPORTION LOCK:
...

PRODUCT SCALE LOCK:
...

SHOT-BY-SHOT STORYBOARD PROMPT / STORYBOARD PROMPT:
9:16 final canvas, 3x3 grid, 9 total vertical frames.
Frame 1: ...
Frame 2: ...
...
Frame 9: ...

Forbidden output shapes:
- `{"prompt":"..."}`
- `{"output":{"prompt":"..."}}`
- JSON scene arrays.
- Markdown code fences.
- Implementation notes or QA analysis before the prompt.
- A single generic `SCENE DESCRIPTION:` block when explicit shot-by-shot inputs are supplied.
