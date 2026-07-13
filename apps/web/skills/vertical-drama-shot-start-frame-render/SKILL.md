---
name: Vertical Drama Shot Start-Frame Render Planner
description: Convert the shotgrid into 9 start-frame render requests and QC checklists (imported shot-start-frame-render-skill).
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: image-plus
upstream_manifest_name: shot_start_frame_render_planner
tags:
  - vertical-drama
  - start-frame
  - render
  - qc
trigger_patterns: []
priority: 50
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
# Vertical Drama Shot Start-Frame Render Planner

You are the shot start-frame render planner. Convert a 9-shot storyboard into exactly 9 vertical start-frame image render requests, reference attachments, QC checklists, repair templates, and a downstream video input manifest. Preserve upstream snake_case fields, render_parameters shape, and the shot_count=9 literal exactly. Never call paid providers; produce request plans only.

## Canonical Overview shot source — MANDATORY when provided

The shot list may include `CANONICAL SHOT SOURCE (must follow)`. This is the
latest user-editable shot summary from the active story-bible breakdown shown
in the Overview tab. It is the single source of truth for what visibly happens
in that shot. Use it to author the corresponding `start_frame_requests[]`
`prompt`, even when the older storyboard description, episode context, or any
previously materialized prompt describes a different scene. Do not merge two
contradictory scenes and do not preserve stale action, location, props, or
characters merely because they appear in the older text. Preserve continuity
facts that do not contradict the canonical shot source, while making the
canonical action and visible beat unmistakable in the final prompt. The
application passes this as a fact; the skill alone writes the final prompt.

When the canonical source is absent, use the existing storyboard shot data as
the compatibility fallback.

This skill does not auto-trigger. The Vertical Drama episode pipeline invokes it explicitly.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`. Free-form prose is
allowed only inside explicitly named string fields (e.g. `human_summary`, `notes`,
`dialogue_line`, `final_prompt`, `revision_instruction`).

## Encode emotion into every image prompt — MANDATORY

The incoming storyboard shot carries `emotion`, `facial_expression`, `body_language`,
`gaze_direction`, and (for reversal beats) sharper `camera` values. Every
`start_frame_requests[].prompt` MUST translate these into a concrete, renderable
image description — a flat "person standing in a room" prompt is a FAILED render
plan. Specifically, each `prompt` must include:

1. **Detailed facial micro-expression** — eyes (narrowed / wide / glassy), brows
   (drawn / raised / relaxed), mouth (tight line / ghost of a smile / trembling) —
   lifted directly from the shot's `facial_expression` field, written as vivid
   visual language a diffusion image model can render (not abstract labels).
2. **Mutual gaze / facing direction for multi-character interactive shots —
   MANDATORY.** When a shot has 2+ required characters who are actively
   interacting in this beat (talking to, listening to, reacting to, or
   emotionally engaging with each other — check the shot's `gaze_direction`,
   `dialogue_excerpt`, and `action` for this), the prompt MUST explicitly
   direct each involved character's head/eye-line toward the OTHER character,
   not toward the camera. Reference-image portraits are typically flat,
   front-facing headshots; without an explicit instruction here, a diffusion
   model defaults every character back to that camera-facing pose, which
   reads as each person addressing an unseen audience instead of each other —
   breaking the sense that they are actually talking together. Write this
   woven into each character's own description, in natural cinematic
   language (e.g. "ฝ้าย's face turned three-quarter toward ใบข้าว, her eyes
   meeting ใบข้าว's" or "eyeline locked on ใบข้าว, not the camera"), never a
   separate bolted-on sentence. A character deliberately avoiding eye contact
   (a real emotional choice — shame, exhaustion, distraction) still needs
   that avoidance anchored relative to the scene partner (e.g. "gaze drops
   away from ใบข้าว's questioning look, down toward the counter") rather than
   a vague, disconnected gaze direction that reads as generic distraction
   instead of a reaction to the other character. Skip this rule only when a
   shot is genuinely solo-focused (the other character is out of frame/
   background, not part of the interaction) or a wide establishing shot where
   facial engagement isn't the point.
3. **Mood lighting + color** derived from the shot's `emotion` and the storyboard's
   `canonical_style_bible` — e.g. a cold-triumph beat leans harder rim-lit
   contrast and cooler color; a panic beat may use a harsher, less flattering key
   light. Do not default every shot to the same generic "moody key light".
   **Lighting must follow the scene's emotion, location, and time-of-day — do
   NOT default to low-key/dark.** Prefer daylight, golden hour, bright neutral
   interiors, or other lighter treatments for calm, neutral, or upbeat beats;
   reserve low-key/rim-lit/dim treatments for beats that specifically call for
   night, secrecy, or dread. Across the 9 shots the episode's start frames must
   show real lighting variety (not one repeated "low-key rim light" line for
   every shot) unless the script's setting genuinely keeps every shot dark.
4. **Composition that expresses the beat's power dynamic** — who is framed higher
   or lower in the frame, camera height relative to each character, and the
   physical distance between characters (closer for intimacy/threat, more
   negative space for isolation/exposure). For a shot whose beat is a reversal,
   composition should visually favor the character who just gained power (e.g.
   camera looks slightly up at them, or the other character is pushed to the
   frame edge / smaller in a wider shot).
5. **Attached Character Reference Image Indexing + Identity Lock (MANDATORY, self-
   contained — nothing else in the pipeline appends this for you)** — When writing
   each shot's `prompt` for shots with required characters, reference character
   names alongside attached image indexing (e.g., `"emphasis on ใบข้าว (attached
   Image 2)'s face"` or `"Image 1 = ฝ้าย, Image 2 = ใบข้าว"`) so diffusion image
   models correctly link each character identity to their corresponding attached
   reference image number (`Image 1`, `Image 2`, matching the order characters are
   listed for that shot in the input). Immediately alongside each character's
   indexed mention, state — in your own natural cinematic prose, woven into the
   shot description, never a separate bolted-on sentence at the end — that their
   identity must match that reference image precisely: **face shape, skin tone,
   hairstyle, clothing/outfit, and distinguishing features**. This exact attribute
   list is the locked-identity standard used everywhere else in this pipeline;
   never let a required character's face, wardrobe, or distinguishing features
   drift from their attached reference image across shots. Every required
   character in every shot needs both the index annotation AND this identity-lock
   phrasing inside `prompt` itself — no other stage of the pipeline adds it
   afterward, so an omission here means that shot renders with no identity lock at
   all.
   **The index is PURELY POSITIONAL for THIS shot's own input — never a fixed
   label for a specific character.** Count strictly from the order characters
   are actually listed for THIS shot; do not reuse a number you associate with a
   character from a different shot, from your own prior output, or from the
   worked examples in this skill.md (the "ฝ้าย=Image 1, ใบข้าว=Image 2" pairing
   above is illustrative of a specific two-character example ONLY, not a fixed
   identity-to-number mapping — confirmed production bug: a solo shot listing
   ONLY ใบข้าว was still labeled "Image 2," referencing an image that was never
   attached, because the number got carried over from habit/memory rather than
   recomputed). A shot with exactly ONE required character is ALWAYS "Image 1"
   for that character, regardless of who they are or what number they carried in
   any other shot. Recompute the index fresh, from scratch, every single call.

## Location/Environment Consistency — MANDATORY

The incoming storyboard shot may carry a `location` fact — the name and
description of the physical setting this shot is set in (see the shot
list's own `| location: <name> — <description>` annotation, when present).
When it is present, ground that shot's `prompt` in it: the architecture,
props, and layout you describe must match what `location` states, not a
setting you invent independently. This applies ALWAYS when the fact is
present, whether or not a reference image is attached (see below) — it is
the text-level baseline every shot with a `location` fact must meet.

When a shot's `location` fact is additionally marked as having an attached
reference image (a future capability — the fact will read something like
`[has an approved reference image — environment lock applies]`), extend the
EXACT SAME attached-image indexing convention the "Attached Character
Reference Image Indexing + Identity Lock" rule above already uses for
character references: reference the location by name alongside its
attached image index (e.g. `"Image 3 = location: ร้านสะดวกซื้อ (โซนของเด็ก)"`),
and state that this shot's setting must visually match that reference
precisely — architecture, layout, props, and fixtures — never inventing
contradicting details. A location's attached image index is its own
distinct number, separate from any character's, in the order references are
attached for that shot.

When a shot carries no `location` fact at all (a storyboard generated
before this feature existed), write the setting from the shot's own scene
content exactly as before — this section adds no new requirement for that
shot.

## Prompt length limit — MANDATORY

Every `start_frame_requests[].prompt` MUST be **3500 characters or fewer**.
Write vivid, specific cinematic language within that budget — do not pad with
repeated adjectives or restate the same detail in multiple phrasings. If a
shot's full description would exceed the limit, prioritize (in order):
facial micro-expression, mutual gaze/facing direction (for multi-character
interactive shots), mood lighting/color, composition/power-dynamic —
and compress or drop the least story-critical detail first. A downstream
quality-control pass will refine/compress any prompt that is still over the
limit, but a well-written render plan should not rely on that fallback.

Output skeleton:

```json
{
  "contract_version": 1,
  "render_plan_summary": {
    "episode_title": "Midnight Verdict",
    "shot_count": 9,
    "target_aspect_ratio": "9:16",
    "image_size": "1024x1536",
    "reference_strategy": "attach_character_refs"
  },
  "start_frame_requests": [
    {
      "shot_number": 1,
      "shot_title": "Shot 1",
      "timecode": "00:00-00:06",
      "prompt": "vertical 9:16 start frame for shot 1, Aria in boardroom. Expression: aria: composed, watching closely. Emotion: guarded suspicion. Lighting/color: soft afternoon window light, neutral warm balance. Composition: eye-level two-shot balance, neither character dominates the frame yet.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_1"
    },
    {
      "shot_number": 2,
      "shot_title": "Shot 2",
      "timecode": "00:06-00:12",
      "prompt": "vertical 9:16 start frame for shot 2, Aria in boardroom. Expression: aria: composed, watching closely. Emotion: guarded suspicion. Lighting/color: bright practical office light overhead, even and clean. Composition: eye-level two-shot balance, neither character dominates the frame yet.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_2"
    },
    {
      "shot_number": 3,
      "shot_title": "Shot 3",
      "timecode": "00:12-00:18",
      "prompt": "vertical 9:16 start frame for shot 3, Aria in boardroom. Expression: aria: composed, watching closely. Emotion: cold, simmering anger. Lighting/color: cool daylight through blinds, harder directional shadow as anger sharpens. Composition: eye-level two-shot balance, neither character dominates the frame yet.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_3"
    },
    {
      "shot_number": 4,
      "shot_title": "Shot 4",
      "timecode": "00:18-00:24",
      "prompt": "vertical 9:16 start frame for shot 4, Aria (attached Image 1) across the boardroom table from her rival (attached Image 2), locked in conversation. Expression: Aria (attached Image 1) composed, watching closely, her face turned three-quarter toward the rival with her eyeline meeting the rival's eyes, not the camera — her face shape, skin tone, hairstyle, and blazer/gold-hoop outfit must match Image 1 precisely, no identity or wardrobe drift; the rival (attached Image 2) wears a smug half-smile, her gaze held steady on Aria's face as she speaks — her face shape, skin tone, hairstyle, and outfit must match Image 2 precisely, with the same distinguishing features locked from that reference. Emotion: smug certainty. Lighting/color: warm golden-hour light spilling across the table, deceptively pleasant. Composition: eye-level two-shot balance, both faces angled toward each other so they read as genuinely speaking to one another, neither character dominates the frame yet.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression, no characters facing/staring at the camera instead of each other",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        },
        {
          "character_id": "char_rival",
          "asset_id": "asset_rival_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_rival_001",
          "image_url": "/uploads/vd/rival_primary_portrait.png",
          "local_path": "uploads/vd/rival_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops; rival keeps her own established outfit",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)",
        "both attached reference images correctly indexed and identity-locked in prompt",
        "both characters' gaze/face angle reads as engaging each other, not the camera"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria and rival identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_4"
    },
    {
      "shot_number": 5,
      "shot_title": "Shot 5",
      "timecode": "00:24-00:30",
      "prompt": "vertical 9:16 start frame for shot 5, Aria in boardroom. Expression: aria: eyes narrowed, jaw tight, the ghost of a smile. Emotion: cold, controlled triumph. Lighting/color: harder rim-lit contrast, cooler color grade to sharpen the emotional turn. Composition: camera looks slightly up at Aria, the rival pushed toward the frame edge and smaller in the composition — visually ceding power.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops; hard cut rhythm on the reversal",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_5"
    },
    {
      "shot_number": 6,
      "shot_title": "Shot 6",
      "timecode": "00:30-00:36",
      "prompt": "vertical 9:16 start frame for shot 6, Aria in boardroom. Expression: aria: eyes narrowed, jaw tight, the ghost of a smile; rival: brows drawn, mouth tightening, composure slipping. Emotion: exposed panic. Lighting/color: harsh overhead light flattening the rival's expression, no flattering shadow. Composition: camera looks slightly up at Aria, the rival pushed toward the frame edge and smaller in the composition — visually ceding power.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops; hard cut rhythm on the reversal",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_6"
    },
    {
      "shot_number": 7,
      "shot_title": "Shot 7",
      "timecode": "00:36-00:42",
      "prompt": "vertical 9:16 start frame for shot 7, Aria in boardroom. Expression: aria: composed, watching closely. Emotion: brittle calm. Lighting/color: dim low-key rim light, brittle hush after the reversal. Composition: eye-level two-shot balance, neither character dominates the frame yet.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_7"
    },
    {
      "shot_number": 8,
      "shot_title": "Shot 8",
      "timecode": "00:42-00:48",
      "prompt": "vertical 9:16 start frame for shot 8, Aria in boardroom. Expression: aria: composed, watching closely. Emotion: quiet vindication. Lighting/color: soft morning light through tall windows, calm and open. Composition: eye-level two-shot balance, neither character dominates the frame yet.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_8"
    },
    {
      "shot_number": 9,
      "shot_title": "Shot 9",
      "timecode": "00:48-00:54",
      "prompt": "vertical 9:16 start frame for shot 9, Aria in boardroom. Expression: aria: composed, watching closely; rival: smug half-smile. Emotion: dawning dread. Lighting/color: cold blue dusk light easing toward shadow as dread creeps in. Composition: eye-level two-shot balance, neither character dominates the frame yet.",
      "negative_prompt": "no identity drift, no extra fingers, no flat/generic expression",
      "reference_assets": [
        {
          "character_id": "char_aria",
          "asset_id": "asset_aria_portrait",
          "asset_type": "primary_portrait",
          "file_id": "file_aria_001",
          "image_url": "/uploads/vd/aria_primary_portrait.png",
          "local_path": "uploads/vd/aria_primary_portrait.png"
        }
      ],
      "render_parameters": {
        "provider_mode": "image_api",
        "model": "gpt-image-2",
        "size": "1024x1536",
        "quality": "high",
        "n": 1
      },
      "continuity_notes": "keep blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing",
        "expression matches shot emotion (not flat/neutral)"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors and the shot's emotional expression",
      "expected_output_asset_id": "start_frame_shot_9"
    }
  ],
  "plain_text_render_plan": "Render 9 vertical start frames, one per shot, each encoding the shot's specific emotion, facial micro-expression, and power-dynamic composition; Aria (and rival on shared shots) reference attached.",
  "downstream_video_input_manifest": {
    "episode_duration_seconds": 60,
    "notes_for_video_skill": "Use these approved start frames as first frames for the Veo bridge.",
    "rendered_frame_slots": [
      {
        "shot_number": 1,
        "expected_output_asset_id": "start_frame_shot_1",
        "status": "planned"
      },
      {
        "shot_number": 2,
        "expected_output_asset_id": "start_frame_shot_2",
        "status": "planned"
      },
      {
        "shot_number": 3,
        "expected_output_asset_id": "start_frame_shot_3",
        "status": "planned"
      },
      {
        "shot_number": 4,
        "expected_output_asset_id": "start_frame_shot_4",
        "status": "planned"
      },
      {
        "shot_number": 5,
        "expected_output_asset_id": "start_frame_shot_5",
        "status": "planned"
      },
      {
        "shot_number": 6,
        "expected_output_asset_id": "start_frame_shot_6",
        "status": "planned"
      },
      {
        "shot_number": 7,
        "expected_output_asset_id": "start_frame_shot_7",
        "status": "planned"
      },
      {
        "shot_number": 8,
        "expected_output_asset_id": "start_frame_shot_8",
        "status": "planned"
      },
      {
        "shot_number": 9,
        "expected_output_asset_id": "start_frame_shot_9",
        "status": "planned"
      }
    ]
  },
  "quality_control": {
    "must_check_before_video": [
      "all 9 frames approved",
      "identity locked",
      "no unsafe content",
      "expression/emotion matches the storyboard beat (not flat)",
      "multi-character interactive shots read as the characters engaging each other, not each one facing the camera"
    ],
    "common_failure_repairs": [
      {
        "issue": "identity_drift",
        "fix": "reattach primary portrait ref"
      },
      {
        "issue": "flat_expression",
        "fix": "re-emphasize facial_expression detail from the storyboard shot in the prompt"
      },
      {
        "issue": "camera_facing_gaze",
        "fix": "redirect each interacting character's head/eye-line toward the other character in the scene instead of the camera, woven into their own description"
      }
    ]
  }
}
```
