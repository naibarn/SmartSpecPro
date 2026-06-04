---
name: auto_cinematic_video_promptll
description: Generate Seedance-ready cinematic video prompts for text-to-video, image-to-video, start/stop frames, and storyboard workflows.
category: video_prompt_generation
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
# Auto Cinematic Video Prompt Skill

## Purpose

This skill generates technically structured cinematic video prompts for Seedance 2-style workflows. It does not generate video directly. It produces prompts, shot plans, continuity locks, and storyboard-ready instructions for:

- Text to video
- Image to video
- Reference to video using 1 to 5 reference images
- Start-frame-only video
- Start-frame and stop-frame video
- Multi-shot storyboard video
- Multiple separate video prompts from one reference set

The skill is designed for cinematic portrait, fashion, beauty, editorial, bridal, music-video, commercial, and character continuity workflows.

## Core Rule

The reference image or reference set is the visual ground truth. Preserve the subject identity, wardrobe, materials, colors, hair, makeup, body proportions, lighting direction, color grade, set geometry, props, and atmosphere unless the user explicitly asks to change them.

Camera movement, pose progression, framing, and shot order may change. Identity and styling continuity must not drift.

## Seedance 2 Prompting Philosophy

Prompts should be cinematic but practical. Use language that describes the final video clearly:

1. Subject identity and wardrobe continuity.
2. Environment and lighting.
3. Camera placement and movement.
4. Subject action and emotional progression.
5. Lens and depth of field language.
6. Filmic color, grain, exposure, and texture.
7. Strict negative prompt to prevent flicker, identity drift, wardrobe change, background morphing, or duplicate body parts.

## Input Modes

### text_to_video

Use when there is no reference image. Build a complete cinematic scene from text.

### image_to_video

Use one primary image. Preserve identity, wardrobe, lighting, and environment. Design camera motion and subject movement around the reference.

### ref_to_video

Use 2 to 5 images. Assign roles such as primary character, wardrobe reference, lighting reference, style reference, or environment reference.

### start_frame_to_video

Use a start frame as the first visual state. The video should evolve from that frame through camera movement, body movement, expression change, focus shift, or environmental reveal.

### start_stop_frame_to_video

Use both start and stop frames. The video must transition plausibly from the start state to the stop state.

### storyboard_* modes

Create multiple shots with durations, camera positions, and action descriptions. Each shot should feel like a deliberate film shot within the same scene.

## Anti-Duplicate Start/Stop Rule

Start Frame and Stop Frame must not be the same shot unless the user explicitly requests micro-motion. In normal cinematic mode, the two frames must differ in at least two axes:

- camera angle
- camera distance
- camera height
- subject pose
- gaze direction
- body orientation
- foreground occlusion
- focus target
- composition
- environment reveal

Examples of valid differences:

- Start: wide full-body profile by window. Stop: close front-facing portrait with direct gaze.
- Start: high-angle seated pose looking down. Stop: low-angle standing three-quarter pose looking at camera.
- Start: macro lace detail. Stop: medium portrait revealing face and upper body.
- Start: over-the-shoulder shot. Stop: direct eye-level close-up.

Invalid output:

- Same crop, same pose, same gaze, same camera angle.
- Near-identical facial close-ups with only tiny eye movement.
- Same frame with minor brightness or background changes.

## Cinematic Presets

The skill supports many presets. The most commonly useful are:

- soft_bridal_windowlight
- soft_korean_beauty_drama
- cinematic_wedding_editorial
- warm_orange_studio_beauty
- hard_flash_fashion_editorial
- vintage_fuji_velvia_flash
- neo_noir_reflection
- rain_window_melancholy
- macro_fashion_texture_study
- luxury_perfume_macro
- wide_environmental_editorial
- heroic_low_angle_fashion
- intimate_handheld_closeup

## Storyboard Planning Rules

For multi-shot output:

1. Define the total duration and duration per shot.
2. Give every shot a clear beginning and ending visual state.
3. Avoid repeating the same camera angle in consecutive shots.
4. Alternate scale: wide, medium, close, detail, profile, over-shoulder, high angle, low angle.
5. Maintain the same lighting and wardrobe continuity.
6. Keep motion slow, deliberate, physically plausible, and elegant.
7. Do not introduce new props, new outfits, new characters, or new environments unless explicitly requested.

## Prompt Output Structure

A strong single-shot prompt should follow this structure:

`Create a [duration] cinematic video in [aspect ratio]. Using the reference as the visual ground truth, preserve [identity/wardrobe/hair/makeup/environment/lighting]. The shot begins at [start visual state]. Camera [movement]. Subject [action]. The shot ends at [end visual state]. Use [lens/depth of field/lighting/color grade]. Maintain [continuity locks]. Negative prompt: [negative prompt].`

A strong storyboard prompt should include:

- Master continuity prompt
- Shot table with shot ID and duration
- Shot prompt per shot
- Timing plan
- Negative prompt
- Start/stop delta summary when relevant
- Continuity checklist

## Video Size Guidance

- 9:16: vertical portrait, social reels, fashion beauty, full-height movement, handheld intimacy.
- 16:9: cinematic widescreen, environmental storytelling, window light, room geometry, profile movement.
- 1:1: contact sheet tests, close-up loops, beauty detail studies.

## Recommended Motion Language

Use precise verbs:

- slow push-in
- subtle dolly left
- 15-degree orbit
- crane down into close-up
- low-angle rise
- profile-to-front reveal
- rack focus from lace detail to eyes
- handheld breathing micro-motion
- parallax reveal through foreground fabric
- macro detail pullback to portrait

Avoid vague terms:

- make it cinematic
- add movement
- dynamic camera
- cool transition

## Quality Control Checklist

Before outputting prompts, verify:

- Identity is locked.
- Wardrobe and materials are locked.
- Hair and makeup are locked.
- Environment and props are locked.
- Lighting direction is locked.
- Start and stop frames are not duplicates.
- Storyboard shots have distinct camera placements.
- Shot durations add up to the total duration.
- Negative prompt covers flicker, morphing, wardrobe drift, identity drift, and background changes.