---
name: auto_cinematic_image
description: Generate reference-locked cinematic image prompt packages for portraits, contact sheets, angle grids, macro detail packs, and video keyframes.
category: image_prompt_generation
version: 1.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Auto Cinematic Image Generator Skill

## Purpose

This skill converts 1–5 reference images into production-ready prompts for GPT Image 2 style image generation workflows. It is designed for cinematic portraits, products, environments, fashion, beauty, editorial, contact sheets, angle grids, storyboard frames, and video keyframes while preserving the locked reference subject, product, scene, materials, lighting, color grade, and environment with strict continuity.

Use this skill when the user wants any of the following:

- a single cinematic portrait from a reference image
- a product image, product contact sheet, or product angle grid from one or more product references
- an environment, room, set, venue, or background scene shown from multiple consistent viewpoints
- a vertical 9:16 portrait, horizontal 16:9 frame, square 1:1 image, or 2:3 fashion still
- a batch of alternate camera angles generated as separate images
- a 2×3 or 3×3 contact sheet containing multiple poses / camera angles in one image
- macro close-ups of facial features, fabric texture, neckline, hair, makeup, accessories, hands, shoes, or set details
- start frame and stop frame pairs for video generation
- consistent cinematic variations based on 1–5 reference images

## Core rule

The reference image is always the ground truth. For people, preserve identity, body proportions, facial structure, hair, makeup, wardrobe, fabric material, colors, accessories, environment, lighting direction, shadow quality, color grade, and photographic style unless the user explicitly requests a change. For products, preserve product category, silhouette, proportions, materials, colors, visible markings, construction details, packaging state, lighting, and photographic style. For environments, preserve room/set topology, architecture, furniture inventory, fixture placement, material finishes, view relationships, lighting, and color grade.

Do not add props, jewelry, glasses, extra people, objects, logos, text, furniture, scenery, or accessories unless they are visible in the reference or explicitly requested. Text in generated images is disabled by default: avoid captions, panel labels, watermarks, logos, UI text, and random glyphs unless `allow_text_in_image` is true or the text already exists in the reference.

## Reference image roles

The skill supports 1–5 images. Assign roles internally:

1. `primary_identity`: face, body type, hair, makeup, skin tone, expression, subject identity.
2. `product_identity`, `product_front`, `product_side`, `product_back`, `product_detail`: product shape, sides, proportions, finish, materials, markings, packaging, and macro details.
3. `wardrobe_material`: clothing silhouette, textile, stitching, texture, reflectivity, accessories, shoes.
4. `environment_wide`, `environment_detail`, `environment_lighting`, `environment_set`: room/set topology, architecture, furniture inventory, fixtures, surface materials, background, props, spatial depth, and lighting.
5. `lighting_colorgrade`: lighting direction, contrast, film look, grain, exposure, color palette.
6. `pose_composition`: pose, body language, product orientation, camera crop, framing, lens character.

When only one image is provided, infer missing information conservatively and consistently. Never invent fashion-critical details beyond what is needed for the selected shot type.

## Generation modes

### 1. `single_cinematic_portrait`
Generate one image. Best for 9:16, 16:9, 1:1, or 2:3 portraits. Can be close-up, medium, full-body, macro detail, profile, low-angle, high-angle, or editorial fashion portrait.

### 2. `cinematic_variation_pack`
Generate multiple separate prompts for separate images. Each prompt is one alternate camera placement from the same scene. Useful for 2:3 cinematic image sets, pose exploration, and client selects.

### 3. `contact_sheet_2x3`
Generate one image containing exactly six frames in a 2×3 grid. Each frame must share the same subject, wardrobe, lighting, color grade, environment, and style. For environments, the six frames must be different physical camera stations: entry establishing, reverse angle, left-corner diagonal, right-corner diagonal, window/main-light side, and one controlled detail insert. Do not solve environment variation with zoom-in, zoom-out, or crops from the same viewpoint.

### 4. `angle_grid_3x3`
Generate one image containing nine frames in a 3×3 grid. For people, default order is MCU, MS, OS, WS, HA, LA, P, ThreeQ, B. For products, use front, side, back, top, three-quarter, scale/hero, material macro, feature detail, and packaging/context views. For environments, use true multi-position room coverage: entry establishing, reverse angle, left corner, right corner, window-side, opposite-side, low spatial view, elevated corner view, and one controlled material/fixture detail. At least seven environment panels must be wide or medium-wide spatial views from different physical positions, not repeated crops of the same composition.

### 5. `macro_detail_pack`
Generate close-up studies of fabric, eyes, lips, hair, neckline, straps, hands, shoes, jewelry, closures, product materials, product seams, hardware, packaging, labels already present in the reference, room materials, fixtures, texture, stitching, or surface highlights. Do not create details not present in the references.

### 6. `video_start_stop_frames`
Generate a matched start frame and stop frame pair for video workflows. The frames must look like the same subject and scene at two clearly different resting points. Describe only final positions, not motion.

### 7. `storyboard_sequence`
Generate sequential cinematic keyframes with strict continuity. Useful for videos, commercials, fashion campaigns, beauty reels, and scene previsualization.

### 8. `custom_shot_list`
Use a user-defined shot list. Preserve all continuity rules and output either separate prompts or one contact sheet.

## Default cinematic shot vocabulary

- Macro Close-Up: extreme crop on eyes, lips, skin, texture, fabric, hair, strap, or accessory.
- Beauty Close-Up: head-and-shoulders, shallow depth of field, sculptural face lighting.
- Medium Shot: chest-up or waist-up portrait.
- Medium-Wide: hips or upper thighs visible.
- Full Body: complete outfit and posture visible.
- Wide Shot: subject in relationship to environment.
- High Angle: camera physically above, looking down.
- Low Angle: camera physically below, looking up.
- Profile: strict side view, 90 degrees.
- Three-Quarter: subject turned roughly 45 degrees from camera.
- Back View: directly behind the subject.
- Over-Shoulder: a blurred foreground shoulder or edge from the same scene; do not add another person.
- Oblique: diagonal camera placement with dynamic perspective.
- Long Lens Compression: flattened editorial profile or near-profile.
- Detail Insert: close focus on textile, closure, strap, shoe, hair, makeup, or set texture.

## Style presets

### `reference_locked`
Copy lighting, color grade, exposure, lens feel, and retouching from the reference as closely as possible.

### `soft_beauty_studio`
Large diffused key light near camera axis, soft shadows, smooth skin, polished beauty retouch, shallow-to-moderate depth of field.

### `hard_flash_fuji_velvia`
Fuji Velvia-inspired oversaturated color, direct hard flash, concentrated subject illumination, falloff toward edges, overexposed highlights, visible film grain, shiny skin highlights, strong satin or glass reflections when present.

### `cinematic_editorial`
Fashion/editorial composition, controlled contrast, natural lens compression, intentional depth of field, polished but realistic textures.

### `warm_orange_studio`
Warm amber/orange palette, seamless studio backdrop, gold/copper highlights, soft-to-medium contrast, commercial portrait finish.

## Contact sheet rules

For contact sheets, output a single image with clean borders and consistent grading. Every panel must show the same locked person, product, or environment continuity. Do not add panel labels or captions unless `allow_text_in_image` is true or the user explicitly asks for labels. If labels are allowed, keep them concise and purely descriptive.

For environment contact sheets or grids, treat the output as architectural/location coverage. Each panel should move the camera to a different station in the same room or set, changing both camera position and viewing direction while preserving layout, furniture inventory, materials, lighting direction, and color grade. Never make most panels simple zoom levels, center crops, or near-duplicates of the same bed/wall/window angle. Detail or macro panels are supporting inserts only, not the main grid.

## Video start/stop frame rules

A start frame and stop frame must preserve identical subject identity, wardrobe, hair, makeup, materials, lighting, environment, shadow quality, photographic style, and color grade.

The start and stop frames must not be visually identical or near-duplicates. Treat identical keyframes as invalid output. They must differ in at least two visible axes, for example camera angle plus framing distance, camera height plus subject pose, profile versus frontal view, wide full-body versus close portrait, or macro detail versus portrait. Safe difference axes are camera angle, camera height, camera side, framing distance, composition, lens feel, subject resting pose, body orientation, gaze direction, hand position, head angle, focus target, and depth of field.

Never solve video continuity by copying the same still twice. Never describe movement blur unless requested. Describe final resting states only.


## Start/stop frame anti-duplicate checklist

Before finalizing any `video_start_stop_frames` output, verify:

1. Start and Stop have the same identity, wardrobe, hair, makeup, lighting, environment, and color grade.
2. Start and Stop differ in at least two visible axes.
3. The prompt explicitly names the difference, such as “Start: eye-level medium shot, subject facing camera” and “Stop: high-angle close portrait, subject turned three-quarter with gaze slightly off-camera.”
4. The output contains a `start_stop_delta_summary`.
5. If the model still produces duplicates, switch seed strategy from `same_seed_for_continuity` to `paired_seed_for_video_keyframes` or `different_seed_per_variation`, while keeping the same reference image and continuity locks.

## Prompt construction order

1. Reference grounding statement.
2. Continuity lock: identity, wardrobe, hair, makeup, accessories, body proportions, environment, lighting, color grade.
3. Mode description: single image, separate prompts, contact sheet, grid, detail pack, or video frames.
4. Camera and composition instructions.
5. Style and technical rendering instructions.
6. Negative constraints.
7. Output format instructions.

## Negative constraints baseline

Do not add extra people, props, furniture, jewelry, glasses, logos, text, tattoos, hats, bags, scenery, or objects. Do not add captions, labels, watermarks, UI text, or random glyphs unless `allow_text_in_image` is true or the text already exists in the reference. Do not change garment type, fabric, color, silhouette, strap placement, stitching, hair length, makeup, face, body proportions, product shape, product material, product color, product markings, room layout, architecture, furniture inventory, background, lighting direction, or color grade. Do not stylize away from photorealism. Do not reinterpret the wardrobe, product, or environment materials.

## Recommended aspect ratios

- `9:16`: vertical portrait, social video frame, fashion reel keyframe.
- `16:9`: cinematic landscape, storyboard, 3×3 grid, video start/stop frame.
- `1:1`: square portrait, compact contact sheet, profile image, product-style detail set.
- `2:3`: editorial fashion still, portrait campaign, cinematic still set.
- `3:2`: horizontal photo still.
- `4:5`: social editorial portrait.

## Output expectations

The skill can return:

- one final prompt
- multiple prompts for separate generations
- one contact sheet prompt
- a keyframe breakdown
- a start/stop frame pair
- a continuity checklist
- negative prompt constraints

When generating prompts, keep them technically explicit, visually grounded, and concise enough to be usable directly with an image model.
