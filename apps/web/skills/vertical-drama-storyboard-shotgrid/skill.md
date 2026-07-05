---
name: Vertical Drama Storyboard Shotgrid
description: Convert an episode script into exactly 9 key vertical storyboard shots in a 3x3 grid (imported storyboard-shotgrid-skill).
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: grid-3x3
upstream_manifest_name: storyboard_shotgrid_generator
tags:
  - vertical-drama
  - storyboard
  - shotgrid
  - 3x3
---
# Vertical Drama Storyboard Shotgrid

You are the storyboard shotgrid generator. Convert an episode script into exactly 9 vertical 9:16 storyboard shots laid out as a 3x3 contact sheet. Preserve upstream snake_case output fields, camera object shape, and literal grid constraints exactly.

This skill does not auto-trigger. The Vertical Drama episode pipeline invokes it explicitly.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`. Free-form prose is
allowed only inside explicitly named string fields (e.g. `human_summary`, `notes`,
`dialogue_line`, `final_prompt`, `revision_instruction`).

## Emotional & acting direction — MANDATORY

The input script (from `vertical-drama-script-builder`) carries `power_shift` and
`is_reversal` markers per beat, and per-character `emotional_arc` data. Translate
these into concrete, varied visual direction per shot:

1. **`emotion` must be specific and MUST NOT repeat more than 2 consecutive shots.**
   Never label every shot "tension" — that is a FAILED storyboard. Pick precise
   emotional states (e.g. "guarded suspicion", "cold satisfaction", "humiliated
   fury", "brittle calm", "dawning panic") that track the beat's actual power
   dynamic and the character's `emotional_arc`. If shots 1-2 share an emotion,
   shot 3 must use a different one.
2. **Per-character acting detail — add three new fields per shot**:
   `facial_expression` (eyes, brows, mouth — e.g. "eyes narrowed, jaw tight, the
   ghost of a smile"), `body_language` (posture/gesture — e.g. "leans back,
   arms loosely crossed, unhurried"), `gaze_direction` (where/who they look at
   and why — e.g. "locks eyes with the rival across the table, does not blink").
   These may be objects keyed by `character_id` when a shot has multiple
   characters, or a single description when there is one focal character.
3. **Reversal shots get stronger camera language.** For any shot whose
   `narrative_purpose`/`action` corresponds to a script beat marked
   `is_reversal: true`, use sharper camera treatment in the `camera` object and
   `visual_description`: fast push-in (`movement: "fast_push_in"` or
   "whip_push"), tighter framing (prefer `close_up`/`extreme_close_up` on the
   eyes), and note an accelerated cut rhythm in `continuity_notes` or
   `visual_description` (e.g. "cut lands hard on the beat — no lingering").
   Do not give reversal beats the same slow, deliberate camera as calm beats.

Output skeleton:

```json
{
  "contract_version": 1,
  "storyboard_summary": {
    "episode_title": "Midnight Verdict",
    "episode_number": 1,
    "duration_seconds": 60,
    "core_emotion": "betrayal turning to triumph",
    "visual_promise": "a quiet power struggle in a dark boardroom that flips mid-episode"
  },
  "canonical_style_bible": {
    "overall_style": "premium vertical cinema",
    "lighting_language": "low-key, rim-lit, harder contrast on reversal beats",
    "camera_language": "slow deliberate pushes that snap into fast push-ins on reversals",
    "color_language": "teal and amber",
    "continuity_rules": [
      "lock Aria identity",
      "keep gold hoops"
    ]
  },
  "shot_grid_plan": {
    "layout": "3x3",
    "aspect_ratio": "9:16",
    "contact_sheet_instruction": "render one 3x3 contact sheet, 9 vertical cells reading left-to-right top-to-bottom",
    "grid_reading_order": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9
    ]
  },
  "shots": [
    {
      "shot_number": 1,
      "timecode": "00:00-00:06",
      "duration_seconds": 6,
      "narrative_purpose": "beat 1",
      "emotion": "guarded suspicion",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria signs the merger, phone lighting up with the collateral clause",
      "visual_description": "vertical cinematic frame, moody key light, guarded suspicion.",
      "camera": {
        "shot_type": "wide",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 1 of Aria in boardroom, guarded suspicion",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 2,
      "timecode": "00:06-00:12",
      "duration_seconds": 6,
      "narrative_purpose": "beat 1",
      "emotion": "guarded suspicion",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria's eyes flick to the clause, still composed",
      "visual_description": "vertical cinematic frame, moody key light, guarded suspicion.",
      "camera": {
        "shot_type": "medium",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 2 of Aria in boardroom, guarded suspicion",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 3,
      "timecode": "00:12-00:18",
      "duration_seconds": 6,
      "narrative_purpose": "beat 2",
      "emotion": "cold, simmering anger",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria confronts the rival across the table",
      "visual_description": "vertical cinematic frame, moody key light, cold, simmering anger.",
      "camera": {
        "shot_type": "close_up",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "centered"
      },
      "lighting": "low-key rim light",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 3 of Aria in boardroom, cold, simmering anger",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 4,
      "timecode": "00:18-00:24",
      "duration_seconds": 6,
      "narrative_purpose": "beat 2",
      "emotion": "smug certainty",
      "characters": [
        "char_aria",
        "char_rival"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png",
        "rival_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the rival mocks her, certain she has no move",
      "visual_description": "vertical cinematic frame, moody key light, smug certainty.",
      "camera": {
        "shot_type": "over_the_shoulder",
        "angle": "low_angle",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "facial_expression": {
        "char_aria": "composed, watching closely",
        "char_rival": "smug half-smile"
      },
      "body_language": {
        "char_aria": "still, controlled posture",
        "char_rival": "leaning forward, dominating the space"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink",
        "char_rival": "stares down at Aria, certain of victory"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 4 of Aria in boardroom, smug certainty",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 5,
      "timecode": "00:24-00:30",
      "duration_seconds": 6,
      "narrative_purpose": "beat 3",
      "emotion": "cold, controlled triumph",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reveals the clinic is already out of reach",
      "visual_description": "vertical cinematic frame, moody key light, cold, controlled triumph. Cut lands hard on the beat — no lingering, accelerated rhythm.",
      "camera": {
        "shot_type": "extreme_close_up",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "fast_push_in",
        "composition": "centered"
      },
      "lighting": "low-key rim light, harder contrast on the reversal beat",
      "facial_expression": {
        "char_aria": "eyes narrowed, jaw tight, the ghost of a smile"
      },
      "body_language": {
        "char_aria": "leans back, arms loosely crossed, unhurried"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "You should have checked the transfer log before you smiled.",
      "subtitle_text": "You should have checked the transfer log before you smiled.",
      "continuity_notes": "keep blazer + gold hoops; hard cut rhythm on the reversal",
      "image_prompt": "vertical 9:16 storyboard shot 5 of Aria in boardroom, cold, controlled triumph",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 6,
      "timecode": "00:30-00:36",
      "duration_seconds": 6,
      "narrative_purpose": "beat 3",
      "emotion": "exposed panic",
      "characters": [
        "char_aria",
        "char_rival"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png",
        "rival_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the rival's composure cracks as the reversal lands",
      "visual_description": "vertical cinematic frame, moody key light, exposed panic. Cut lands hard on the beat — no lingering, accelerated rhythm.",
      "camera": {
        "shot_type": "close_up",
        "angle": "low_angle",
        "lens_feel": "50mm",
        "movement": "whip_push",
        "composition": "off_center"
      },
      "lighting": "low-key rim light, harder contrast on the reversal beat",
      "facial_expression": {
        "char_aria": "eyes narrowed, jaw tight, the ghost of a smile",
        "char_rival": "brows drawn, mouth tightening, composure slipping"
      },
      "body_language": {
        "char_aria": "leans back, arms loosely crossed, unhurried",
        "char_rival": "shoulders stiffen, hand grips the chair"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink",
        "char_rival": "glances away toward his phone, avoiding her eyes"
      },
      "dialogue_excerpt": "You should have checked the transfer log before you smiled.",
      "subtitle_text": "You should have checked the transfer log before you smiled.",
      "continuity_notes": "keep blazer + gold hoops; hard cut rhythm on the reversal",
      "image_prompt": "vertical 9:16 storyboard shot 6 of Aria in boardroom, exposed panic",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 7,
      "timecode": "00:36-00:42",
      "duration_seconds": 6,
      "narrative_purpose": "beat 4",
      "emotion": "brittle calm",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the rival scrambles to call his backers",
      "visual_description": "vertical cinematic frame, moody key light, brittle calm.",
      "camera": {
        "shot_type": "medium",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 7 of Aria in boardroom, brittle calm",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 8,
      "timecode": "00:42-00:48",
      "duration_seconds": 6,
      "narrative_purpose": "beat 4",
      "emotion": "quiet vindication",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria walks out, unhurried, aftermath settling",
      "visual_description": "vertical cinematic frame, moody key light, quiet vindication.",
      "camera": {
        "shot_type": "wide",
        "angle": "high_angle",
        "lens_feel": "50mm",
        "movement": "slow_pull_back",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 8 of Aria in boardroom, quiet vindication",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 9,
      "timecode": "00:48-00:54",
      "duration_seconds": 6,
      "narrative_purpose": "beat 4",
      "emotion": "dawning dread",
      "characters": [
        "char_aria",
        "char_rival"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png",
        "rival_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the assistant's whisper about the emergency board vote lands on the rival",
      "visual_description": "vertical cinematic frame, moody key light, dawning dread.",
      "camera": {
        "shot_type": "insert",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "centered"
      },
      "lighting": "low-key rim light",
      "facial_expression": {
        "char_aria": "composed, watching closely",
        "char_rival": "smug half-smile"
      },
      "body_language": {
        "char_aria": "still, controlled posture",
        "char_rival": "leaning forward, dominating the space"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink",
        "char_rival": "stares down at Aria, certain of victory"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 9 of Aria in boardroom, dawning dread",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    }
  ],
  "plain_text_storyboard": "Shot 1 wide establishing, guarded suspicion... Shot 5-6 fast push-in reversal, cold triumph meets exposed panic... Shot 9 insert, dawning dread payoff.",
  "storyboard_handoff_json": {
    "schema_version": "1.0",
    "handoff_type": "storyboard_shot_prompts",
    "grid_layout": "3x3",
    "shots": [
      {
        "shot_number": 1,
        "image_prompt": "vertical 9:16 storyboard shot 1 of Aria in boardroom, guarded suspicion"
      },
      {
        "shot_number": 2,
        "image_prompt": "vertical 9:16 storyboard shot 2 of Aria in boardroom, guarded suspicion"
      },
      {
        "shot_number": 3,
        "image_prompt": "vertical 9:16 storyboard shot 3 of Aria in boardroom, cold, simmering anger"
      },
      {
        "shot_number": 4,
        "image_prompt": "vertical 9:16 storyboard shot 4 of Aria in boardroom, smug certainty"
      },
      {
        "shot_number": 5,
        "image_prompt": "vertical 9:16 storyboard shot 5 of Aria in boardroom, cold, controlled triumph"
      },
      {
        "shot_number": 6,
        "image_prompt": "vertical 9:16 storyboard shot 6 of Aria in boardroom, exposed panic"
      },
      {
        "shot_number": 7,
        "image_prompt": "vertical 9:16 storyboard shot 7 of Aria in boardroom, brittle calm"
      },
      {
        "shot_number": 8,
        "image_prompt": "vertical 9:16 storyboard shot 8 of Aria in boardroom, quiet vindication"
      },
      {
        "shot_number": 9,
        "image_prompt": "vertical 9:16 storyboard shot 9 of Aria in boardroom, dawning dread"
      }
    ],
    "character_attachment_manifest": [
      {
        "character_id": "char_aria",
        "refs": [
          "aria_primary_portrait.png"
        ]
      },
      {
        "character_id": "char_rival",
        "refs": [
          "rival_primary_portrait.png"
        ]
      }
    ],
    "rendering_notes": "vertical 9:16, keep identity anchors"
  }
}
```
