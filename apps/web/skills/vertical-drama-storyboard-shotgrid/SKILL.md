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

Output skeleton:

```json
{
  "contract_version": 1,
  "storyboard_summary": {
    "episode_title": "Midnight Verdict",
    "episode_number": 1,
    "duration_seconds": 60,
    "core_emotion": "betrayal",
    "visual_promise": "a quiet power struggle in a dark boardroom"
  },
  "canonical_style_bible": {
    "overall_style": "premium vertical cinema",
    "lighting_language": "low-key, rim-lit",
    "camera_language": "slow deliberate pushes",
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
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 1",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "wide",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 1 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 2,
      "timecode": "00:06-00:12",
      "duration_seconds": 6,
      "narrative_purpose": "beat 2",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 2",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "medium",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 2 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 3,
      "timecode": "00:12-00:18",
      "duration_seconds": 6,
      "narrative_purpose": "beat 3",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 3",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "close_up",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 3 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 4,
      "timecode": "00:18-00:24",
      "duration_seconds": 6,
      "narrative_purpose": "beat 4",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 4",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "over_the_shoulder",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 4 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 5,
      "timecode": "00:24-00:30",
      "duration_seconds": 6,
      "narrative_purpose": "beat 5",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 5",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "medium",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 5 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 6,
      "timecode": "00:30-00:36",
      "duration_seconds": 6,
      "narrative_purpose": "beat 6",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 6",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "close_up",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 6 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 7,
      "timecode": "00:36-00:42",
      "duration_seconds": 6,
      "narrative_purpose": "beat 7",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 7",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "insert",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 7 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 8,
      "timecode": "00:42-00:48",
      "duration_seconds": 6,
      "narrative_purpose": "beat 8",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 8",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "reaction",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 8 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 9,
      "timecode": "00:48-00:54",
      "duration_seconds": 6,
      "narrative_purpose": "beat 9",
      "emotion": "tension",
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reacts to revelation 9",
      "visual_description": "vertical cinematic frame, moody key light",
      "camera": {
        "shot_type": "wide",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "low-key rim light",
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 9 of Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    }
  ],
  "plain_text_storyboard": "Shot 1 wide establishing... Shot 9 wide payoff.",
  "storyboard_handoff_json": {
    "schema_version": "1.0",
    "handoff_type": "storyboard_shot_prompts",
    "grid_layout": "3x3",
    "shots": [
      {
        "shot_number": 1,
        "image_prompt": "shot 1"
      },
      {
        "shot_number": 2,
        "image_prompt": "shot 2"
      },
      {
        "shot_number": 3,
        "image_prompt": "shot 3"
      },
      {
        "shot_number": 4,
        "image_prompt": "shot 4"
      },
      {
        "shot_number": 5,
        "image_prompt": "shot 5"
      },
      {
        "shot_number": 6,
        "image_prompt": "shot 6"
      },
      {
        "shot_number": 7,
        "image_prompt": "shot 7"
      },
      {
        "shot_number": 8,
        "image_prompt": "shot 8"
      },
      {
        "shot_number": 9,
        "image_prompt": "shot 9"
      }
    ],
    "character_attachment_manifest": [
      {
        "character_id": "char_aria",
        "refs": [
          "aria_primary_portrait.png"
        ]
      }
    ],
    "rendering_notes": "vertical 9:16, keep identity anchors"
  }
}
```
