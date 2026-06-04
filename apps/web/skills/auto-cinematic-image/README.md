# Auto Cinematic Image Generator Skill

A reusable prompt-generation skill for GPT Image 2 image workflows using 1–5 reference images. It supports portraits, products, environments, single images, batch variations, 2×3 contact sheets, 3×3 angle grids, macro/detail frames, and video start/stop keyframes.

## Folder structure

```text
auto_cinematic_image_skill/
  SKILL.md
  README.md
  skill.json
  schemas/
    input.schema.json
    ui.schema.json
    output.schema.json
  templates/
    master_prompt.md
    modes/
      single_cinematic_portrait.md
      cinematic_variation_pack.md
      contact_sheet_2x3.md
      angle_grid_3x3.md
      macro_detail_pack.md
      video_start_stop_frames.md
      custom_shot_list.md
  examples/
    single_9x16.json
    six_frame_contact_sheet.json
    nine_angle_grid.json
    cinematic_variation_pack.json
    video_start_stop_frames.json
```

## Quick use

1. Attach 1–5 reference images.
2. Choose the reference type: person, product, environment, or mixed.
3. Choose a mode.
4. Choose aspect ratio: 9:16, 16:9, 1:1, 2:3, 3:2, or 4:5.
5. Choose style preset or keep `reference_locked`.
6. Keep text disabled by default, or explicitly enable text only when labels/captions are needed.
7. Generate either a single image prompt, multiple prompts, or one contact-sheet prompt.

The main schema is `schemas/input.schema.json`.


## v1.1 anti-duplicate update

Video start/stop frames now include a mandatory frame-difference policy. Start and Stop must differ in at least two visible axes, such as camera angle, framing distance, subject pose, gaze, or focus target, while all fashion and scene continuity remains locked.
