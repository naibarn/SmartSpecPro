# Vertical Drama Unified Shot Prompt and Image Generation

## Goal

Make every start-frame prompt follow the same per-shot authoring path. The
episode-level prompt action and the prompt-plus-image actions must produce
contract-compatible prompt data from the same skill, with the only difference
being whether image rendering is requested.

## Approved behavior

- `สร้างพรอมต์ภาพทุกช็อต` / `Generate image prompts for all shots` authors one
  prompt job per storyboard shot through the existing
  `generateShotStartFramePrompt` path. It does not render images.
- `สร้างพรอมต์และภาพ` / `Generate prompt + image` authors the selected shot
  through that same prompt path, then submits the normal start-frame image
  task.
- `สร้างพรอมต์และภาพทุกช็อต` / `Generate prompts + images for all shots`
  authors and renders every storyboard shot, including shots that already have
  an approved image. Existing images remain in Media History and the normal
  per-shot replacement/finalization path decides the current approved asset.

## Architecture

The existing per-shot prompt queue is the canonical authoring boundary. The
client owns only bounded orchestration and progress presentation:

1. Resolve the current ordered storyboard shot numbers.
2. Enqueue/poll the existing per-shot prompt job for each shot.
3. For image mode, pass the terminal prompt result into the existing image
   admission mutation and task polling/finalization path.
4. Limit concurrent shot chains to the existing safe worker count and keep
   each shot idempotent through fresh keys.

The legacy `runStage(start_frame_render_plan)` batch planner remains available
for unrelated pipeline/recovery callers, but the two user-facing actions in
this workflow no longer use it as the prompt source. This prevents batch and
single-shot authoring from drifting apart.

## UI copy

Use the same nouns and action order in both locales:

| Thai                     | English                                 |
| ------------------------ | --------------------------------------- |
| สร้างพรอมต์ภาพทุกช็อต    | Generate image prompts for all shots    |
| สร้างพรอมต์และภาพ        | Generate prompt + image                 |
| สร้างพรอมต์และภาพทุกช็อต | Generate prompts + images for all shots |

Paid confirmations state whether the action creates prompts only or prompts
and images. Existing model/connection gates remain in force.

## Failure and safety behavior

- A prompt failure is visible for the affected shot and does not silently
  become an image request.
- A render failure stays attached to its shot and preserves the generated
  prompt for retry.
- Existing provider admission, credit, idempotency, ownership, and task
  polling safeguards are reused; no new provider or Cloudflare dependency is
  introduced.
- Re-running the all-shot image action is explicit and paid, including for
  shots that already have an approved image.

## Verification

Focused tests must prove that:

- the episode-level prompt action no longer calls the batch stage;
- the all-shot image action delegates every shot to the same prompt-plus-image
  handler;
- labels and confirmation copy match in Thai and English;
- existing per-shot prompt -> image ordering remains intact;
- no unrelated worktree changes are modified.
