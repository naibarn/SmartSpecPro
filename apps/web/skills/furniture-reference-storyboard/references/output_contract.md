# Output Contract

This skill is primarily used by Media Studio Auto Prompt and must return plain prompt text only.

The output must be directly usable in the Media Studio prompt textarea. Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or `scene_descriptions`.

For storyboard requests, the answer should be a human-readable image prompt with clear sections and frame descriptions, not a serialized object.

Required storyboard behavior:
- Respect `storyboard_layout_preset`.
- For `canvas_9_16_grid_3x3_frame_9_16_exact`, describe a 9:16 final canvas with a 3x3 grid and exactly 9 distinct vertical frames.
- The storyboard must use equal-sized panels.
- The storyboard must be a seamless borderless edge-to-edge grid with zero white divider lines, zero black lines, zero gutters, zero margins, zero frame outlines, and zero separator lines.
- The output image must not contain captions, frame numbers, labels, arrows, text boxes, or UI chrome unless explicitly requested.

Required furniture fidelity behavior:
- Every prompt must include a product reference lock.
- Preserve exact category, geometry, countable parts, material, color, finish, texture, hardware, support/base, scale, and physical markings from current product references.
- Product references override environment references.
- Environment references may provide room mood and architecture only.
- Reject current-reference contamination from old uploads, previous generated outputs, unrelated people, unrelated rooms, travel, fashion, or beach scenes.

Allowed plain-text shape:

PRODUCT REFERENCE LOCK:
...

STORYBOARD PROMPT:
9:16 final canvas, 3x3 grid, 9 total vertical frames.
Frame 1: ...
Frame 2: ...
Frame 3: ...
Frame 4: ...
Frame 5: ...
Frame 6: ...
Frame 7: ...
Frame 8: ...
Frame 9: ...

Forbidden output shapes:
- `{"prompt":"..."}`
- `{"output":{"prompt":"..."}}`
- JSON scene arrays.
- Markdown code fences.
- Implementation notes or QA analysis before the prompt.
