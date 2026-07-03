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
---
# Vertical Drama Shot Start-Frame Render Planner

You are the shot start-frame render planner. Convert a 9-shot storyboard into exactly 9 vertical start-frame image render requests, reference attachments, QC checklists, repair templates, and a downstream video input manifest. Preserve upstream snake_case fields, render_parameters shape, and the shot_count=9 literal exactly. Never call paid providers; produce request plans only.

This skill does not auto-trigger. The Vertical Drama episode pipeline invokes it explicitly.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`. Free-form prose is
allowed only inside explicitly named string fields (e.g. `human_summary`, `notes`,
`dialogue_line`, `final_prompt`, `revision_instruction`).

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
      "prompt": "vertical 9:16 start frame for shot 1, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_1"
    },
    {
      "shot_number": 2,
      "shot_title": "Shot 2",
      "timecode": "00:06-00:12",
      "prompt": "vertical 9:16 start frame for shot 2, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_2"
    },
    {
      "shot_number": 3,
      "shot_title": "Shot 3",
      "timecode": "00:12-00:18",
      "prompt": "vertical 9:16 start frame for shot 3, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_3"
    },
    {
      "shot_number": 4,
      "shot_title": "Shot 4",
      "timecode": "00:18-00:24",
      "prompt": "vertical 9:16 start frame for shot 4, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_4"
    },
    {
      "shot_number": 5,
      "shot_title": "Shot 5",
      "timecode": "00:24-00:30",
      "prompt": "vertical 9:16 start frame for shot 5, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_5"
    },
    {
      "shot_number": 6,
      "shot_title": "Shot 6",
      "timecode": "00:30-00:36",
      "prompt": "vertical 9:16 start frame for shot 6, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_6"
    },
    {
      "shot_number": 7,
      "shot_title": "Shot 7",
      "timecode": "00:36-00:42",
      "prompt": "vertical 9:16 start frame for shot 7, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_7"
    },
    {
      "shot_number": 8,
      "shot_title": "Shot 8",
      "timecode": "00:42-00:48",
      "prompt": "vertical 9:16 start frame for shot 8, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_8"
    },
    {
      "shot_number": 9,
      "shot_title": "Shot 9",
      "timecode": "00:48-00:54",
      "prompt": "vertical 9:16 start frame for shot 9, Aria in boardroom",
      "negative_prompt": "no identity drift, no extra fingers",
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
      "continuity_notes": "keep charcoal blazer + gold hoops",
      "qc_checklist": [
        "identity match",
        "wardrobe continuity",
        "9:16 framing"
      ],
      "repair_prompt_template": "regenerate shot {shot_number} preserving Aria identity anchors",
      "expected_output_asset_id": "start_frame_shot_9"
    }
  ],
  "plain_text_render_plan": "Render 9 vertical start frames, one per shot, with Aria reference attached.",
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
      "no unsafe content"
    ],
    "common_failure_repairs": [
      {
        "issue": "identity_drift",
        "fix": "reattach primary portrait ref"
      }
    ]
  }
}
```
