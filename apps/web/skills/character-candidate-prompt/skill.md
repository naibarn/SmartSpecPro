---
name: character-candidate-prompt
description: Imported from shared skill bundle (character-candidate-prompt.zip)
category: other
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
# Character Candidate Prompt Builder

## Purpose
Create a single, production-ready image-generation prompt for casting or character exploration from one or more reference images.

The reference images are used only according to the user's selected locks. The skill must never split the result into a separate negative prompt. The final output is plain text: one complete prompt ready to send to an image-generation model.

## Core behavior

1. Use reference images as visual guidance for facial structure and overall hair length/style direction.
2. Preserve demographic consistency across all requested candidates:
   - lock ethnicity exactly as provided;
   - lock apparent age to the requested age range;
   - keep gender/presentation as provided.
3. Generate the requested number of candidate images, from 1 to 10. When more than one image is requested, the prompt must explicitly require separate independent image outputs: one candidate per image file. Never request or permit a collage, grid, contact sheet, split screen, multi-panel composition, storyboard sheet, or multiple candidates inside one image.
4. If `lock_clothing` is true, preserve the clothing design, color family, silhouette, and visible accessories from the reference image as closely as practical while still creating a new character identity.
5. If `lock_clothing` is false, do not copy the reference clothing; use simple contemporary neutral clothing appropriate for the character.
6. Pose behavior:
   - `auto_natural`: invent relaxed, believable, everyday body language. Avoid fashion-model posing, glamour posing, runway/editorial posture, or staged hand placement.
   - `lock_reference`: preserve the broad body pose, head angle, body orientation, and major limb placement from the reference image, while allowing small natural corrections for anatomy.
7. Hair behavior:
   - use the reference only as a guide for overall length, density, and broad style category;
   - do not copy exact flyaway strands, fringe direction, face-covering strand placement, or exact parting unless the user explicitly requests it in `additional_instructions`.
8. Facial attractiveness should be high enough for a film/series lead actor or leading-lady role, but remain believable and natural. Avoid fashion-model styling, influencer glamour, beauty-ad perfection, or synthetic AI beauty.
9. Skin must look genuinely human: natural pores, fine texture, slight tonal variation, subtle under-eye detail, lip texture, peach fuzz where visible, and tiny real-world imperfections. Avoid plastic, waxy, porcelain, over-smoothed, over-retouched, or glossy AI-looking skin.
10. Cinematic image quality must include dimensional lighting, foreground/background separation, realistic perspective, layered depth, natural contrast, and intentional depth of field appropriate to the selected framing.
11. Use realistic camera/lens language in the prompt. Do not over-specify technical camera settings if they conflict with the requested composition.
12. The final output must contain only the finished prompt text. Do not add explanations, headings, JSON, bullet metadata, or a separate negative prompt.

## Candidate consistency rules

When `image_count` is greater than 1:
- request exactly `image_count` separate image outputs, one candidate per image;
- explicitly state: no collage, no grid, no contact sheet, no multi-panel layout, no split screen, no labels or candidate numbers rendered into the image;
- all candidates must remain within the same locked ethnicity and apparent age range;
- all candidates should share the same overall role archetype and hair-length direction;
- vary only subtle facial identity details unless the user asks for broader variation;
- keep camera framing consistent unless `additional_instructions` says otherwise;
- if clothing is locked, keep it consistent across candidates;
- if pose mode is `auto_natural`, allow small pose variations, but keep them candid and non-model-like;
- if pose mode is `lock_reference`, keep pose consistent with the reference across all candidates.

The candidates should feel like different plausible actors being considered for the same role, not different demographics or age groups.

## Camera framing behavior

Map `camera_framing` to composition language:
- `full_body`: head-to-toe, natural stance or movement, environmental context, 35–50mm feel, moderate depth of field.
- `three_quarter`: approximately knees/thighs upward, balanced subject/environment, 50–70mm feel.
- `half_body`: waist/chest upward, cinematic portrait, 50–85mm feel.
- `medium_close_up`: chest/shoulders upward, strong facial readability, 70–100mm feel.
- `close_up`: head and shoulders / face dominant, realistic facial texture, 85–105mm feel, shallow but not artificial depth of field.
- `extreme_close_up`: face detail or eyes/face crop, highly realistic skin microtexture, restrained depth of field.
- `wide_environmental`: full or near-full figure within a stronger environment, 24–35mm feel, layered foreground/midground/background.
- `custom`: follow `custom_framing` exactly.

## Depth and cinematic quality

Always include language that produces:
- clear foreground, midground, and background separation when composition allows;
- realistic optical depth rather than flat AI compositing;
- dimensional key/fill/rim or motivated natural light;
- subtle cinematic contrast;
- realistic falloff and lens perspective;
- subject separation without excessive background blur;
- believable film-still quality rather than polished fashion photography.

## Reference limits

Unless explicitly locked by the user, do not copy from references:
- exact identity;
- exact hairstyle arrangement;
- exact expression;
- clothing;
- pose;
- camera angle;
- environment;
- lighting;
- color grading;
- background people;
- composition.

## Prompt construction order

Construct the final prompt in this order, as natural prose:
1. number of requested images/candidates, including an explicit requirement that multiple candidates are returned as separate image outputs rather than a collage/grid;
2. new fictional character requirement;
3. locked gender/presentation, ethnicity, and age range;
4. facial reference scope;
5. hair reference scope;
6. clothing lock behavior;
7. pose behavior;
8. camera framing and lens perspective;
9. natural attractiveness / lead-actor quality;
10. human skin realism;
11. cinematic depth, dimensional lighting, and depth of field;
12. consistency requirements across multiple candidates;
13. reference restrictions;
14. any user-supplied additional instructions.

## Output
Return one plain-text prompt only.
