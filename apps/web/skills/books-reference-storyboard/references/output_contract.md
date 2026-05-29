# Output Contract

This skill is primarily used by Media Studio Auto Prompt and must return plain prompt text only.

The output must be directly usable in the Media Studio prompt textarea. Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or `scene_descriptions`.

Required storyboard behavior:
- Respect `storyboard_layout_preset`.
- For `canvas_9_16_grid_3x3_frame_9_16_exact`, describe a 9:16 final canvas with a 3x3 grid and exactly 9 distinct vertical frames.
- Use equal-sized panels and keep the storyboard edge-to-edge unless the user asks for another layout.
- Include `TEXT RENDERING POLICY`, `PRODUCT REFERENCE LOCK`, `PRODUCT PHYSICAL PROPORTION LOCK`, and `PRODUCT SCALE LOCK`.
- If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, `TEXT RENDERING POLICY` must require a readable infographic with one large headline and 2-4 short key points using the attached product/reference image; do not apply the no-added-visible-text policy in this case.
- Preserve exact หนังสือ product category, shape, proportions, material, texture, colorway, markings, package facts, and scale from current references.
- Product references override environment references.
- Reject current-reference contamination from old uploads, previous generations, unrelated people, unrelated rooms, or background objects.

Allowed plain-text shape:

OUTPUT FORMAT LOCK:
...

TEXT RENDERING POLICY:
...

PRODUCT REFERENCE LOCK:
...

PRODUCT PHYSICAL PROPORTION LOCK:
...

PRODUCT SCALE LOCK:
...

STORYBOARD PROMPT:
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
