# Output Contract

Return plain prompt text only.

Do not return JSON, Markdown fences, wrapper keys, analysis, diff notes, character counts, or alternatives.

For product-reference storyboard prompts, preserve:

- one single 9:16 image / strict 3x3 grid / exactly 9 frames / exactly 9 vertical frames / exactly 3 equal-width columns / exactly 3 equal-height rows / no collage/masonry layout / no separator lines when present;
- the exact first `SHOT-BY-SHOT STORYBOARD PROMPT:` contract line when present; do not paraphrase it shorter;
- `Frame 1` through `Frame 9`;
- non-empty visual-only prose per frame;
- no `STORY MATCH:`, `HUMAN REALISM:`, `VISUAL:`, quoted voiceover lines, timecodes, subtitles, or captions inside frame text;
- one shared `CAMERA/LIGHT/DEPTH:` block;
- one shared `PRODUCT VERIFY:` block;
- explicit wording that the attached product reference image is the primary visual source of truth, the written product description is secondary and must never override the attached product image, and the product must match that reference exactly;
- core product reference, text rendering, and cinematic realism locks.

The output must not exceed `target_max_chars` and should prefer `preferred_target_chars`. It must not end mid-frame or at a bare label.
