---
name: Vertical Drama Video Motion Prompt Pack
description: Create per-clip motion prompts and provider request plans for a 60-second vertical episode (imported video-motion-prompt-pack-skill).
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: film
upstream_manifest_name: video_motion_prompt_pack_builder
tags:
  - vertical-drama
  - video
  - motion-prompt
  - veo
  - assembly
---
# Vertical Drama Video Motion Prompt Pack

You are the video motion prompt pack builder. Build per-clip motion prompts, provider feasibility decisions, provider request payloads (Veo 3.1 first/last-frame bridge first, prompt-only fallback), a 60-second assembly manifest, and a repair loop. Preserve upstream snake_case fields and provider execution statuses. When verticalDramaSeriesSubShots is enabled, add an optional sub_shot_plan; otherwise omit it. Never call paid providers.

This skill does not auto-trigger. The Vertical Drama episode pipeline invokes it explicitly.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`. Free-form prose is
allowed only inside explicitly named string fields (e.g. `human_summary`, `notes`,
`dialogue_line`, `final_prompt`, `revision_instruction`).

Output skeleton:

```json
{
  "contract_version": 1,
  "video_plan_summary": {
    "episode_title": "Midnight Verdict",
    "duration_seconds": 60,
    "clip_count": 8,
    "aspect_ratio": "9:16",
    "strategy": "veo31_first_last_bridge_60s"
  },
  "provider_feasibility": {
    "blocking_reasons": [
      "clip 8 end-frame missing -> prompt-only fallback"
    ],
    "recommended_provider_path": "veo_compatible_first_last_frame",
    "notes": "Veo 3.1 bridge for clips 1-7; clip 8 degrades to prompt-only.",
    "veo31_executable": true
  },
  "video_clip_requests": [
    {
      "clip_number": 1,
      "source_shot_numbers": [
        1,
        2
      ],
      "duration_seconds": 8,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_1",
        "file_id": "file_sf_1",
        "image_url": "/uploads/vd/start_frame_shot_1.png",
        "local_path": "uploads/vd/start_frame_shot_1.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": {
        "asset_id": "start_frame_shot_3",
        "file_id": "file_ef_1",
        "image_url": "/uploads/vd/end_frame_1.png",
        "local_path": "uploads/vd/end_frame_1.png",
        "contains_human_face": true
      },
      "prompt": "clip 1: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "ready",
        "execution_status_normalized": "ready",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 1 motion prompt",
          "first_frame": "start_frame_shot_1",
          "last_frame": "start_frame_shot_3",
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 8,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    },
    {
      "clip_number": 2,
      "source_shot_numbers": [
        2,
        3
      ],
      "duration_seconds": 8,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_2",
        "file_id": "file_sf_2",
        "image_url": "/uploads/vd/start_frame_shot_2.png",
        "local_path": "uploads/vd/start_frame_shot_2.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": {
        "asset_id": "start_frame_shot_4",
        "file_id": "file_ef_2",
        "image_url": "/uploads/vd/end_frame_2.png",
        "local_path": "uploads/vd/end_frame_2.png",
        "contains_human_face": true
      },
      "prompt": "clip 2: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "ready",
        "execution_status_normalized": "ready",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 2 motion prompt",
          "first_frame": "start_frame_shot_2",
          "last_frame": "start_frame_shot_4",
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 8,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    },
    {
      "clip_number": 3,
      "source_shot_numbers": [
        3,
        4
      ],
      "duration_seconds": 8,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_3",
        "file_id": "file_sf_3",
        "image_url": "/uploads/vd/start_frame_shot_3.png",
        "local_path": "uploads/vd/start_frame_shot_3.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": {
        "asset_id": "start_frame_shot_5",
        "file_id": "file_ef_3",
        "image_url": "/uploads/vd/end_frame_3.png",
        "local_path": "uploads/vd/end_frame_3.png",
        "contains_human_face": true
      },
      "prompt": "clip 3: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "ready",
        "execution_status_normalized": "ready",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 3 motion prompt",
          "first_frame": "start_frame_shot_3",
          "last_frame": "start_frame_shot_5",
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 8,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    },
    {
      "clip_number": 4,
      "source_shot_numbers": [
        4,
        5
      ],
      "duration_seconds": 8,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_4",
        "file_id": "file_sf_4",
        "image_url": "/uploads/vd/start_frame_shot_4.png",
        "local_path": "uploads/vd/start_frame_shot_4.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": {
        "asset_id": "start_frame_shot_6",
        "file_id": "file_ef_4",
        "image_url": "/uploads/vd/end_frame_4.png",
        "local_path": "uploads/vd/end_frame_4.png",
        "contains_human_face": true
      },
      "prompt": "clip 4: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "ready",
        "execution_status_normalized": "ready",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 4 motion prompt",
          "first_frame": "start_frame_shot_4",
          "last_frame": "start_frame_shot_6",
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 8,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    },
    {
      "clip_number": 5,
      "source_shot_numbers": [
        5,
        6
      ],
      "duration_seconds": 8,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_5",
        "file_id": "file_sf_5",
        "image_url": "/uploads/vd/start_frame_shot_5.png",
        "local_path": "uploads/vd/start_frame_shot_5.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": {
        "asset_id": "start_frame_shot_7",
        "file_id": "file_ef_5",
        "image_url": "/uploads/vd/end_frame_5.png",
        "local_path": "uploads/vd/end_frame_5.png",
        "contains_human_face": true
      },
      "prompt": "clip 5: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "ready",
        "execution_status_normalized": "ready",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 5 motion prompt",
          "first_frame": "start_frame_shot_5",
          "last_frame": "start_frame_shot_7",
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 8,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    },
    {
      "clip_number": 6,
      "source_shot_numbers": [
        6,
        7
      ],
      "duration_seconds": 8,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_6",
        "file_id": "file_sf_6",
        "image_url": "/uploads/vd/start_frame_shot_6.png",
        "local_path": "uploads/vd/start_frame_shot_6.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": {
        "asset_id": "start_frame_shot_8",
        "file_id": "file_ef_6",
        "image_url": "/uploads/vd/end_frame_6.png",
        "local_path": "uploads/vd/end_frame_6.png",
        "contains_human_face": true
      },
      "prompt": "clip 6: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "ready",
        "execution_status_normalized": "ready",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 6 motion prompt",
          "first_frame": "start_frame_shot_6",
          "last_frame": "start_frame_shot_8",
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 8,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    },
    {
      "clip_number": 7,
      "source_shot_numbers": [
        7,
        8
      ],
      "duration_seconds": 8,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_7",
        "file_id": "file_sf_7",
        "image_url": "/uploads/vd/start_frame_shot_7.png",
        "local_path": "uploads/vd/start_frame_shot_7.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": {
        "asset_id": "start_frame_shot_9",
        "file_id": "file_ef_7",
        "image_url": "/uploads/vd/end_frame_7.png",
        "local_path": "uploads/vd/end_frame_7.png",
        "contains_human_face": true
      },
      "prompt": "clip 7: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "ready",
        "execution_status_normalized": "ready",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 7 motion prompt",
          "first_frame": "start_frame_shot_7",
          "last_frame": "start_frame_shot_9",
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 8,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    },
    {
      "clip_number": 8,
      "source_shot_numbers": [
        8,
        9
      ],
      "duration_seconds": 4,
      "start_frame_reference": {
        "asset_id": "start_frame_shot_8",
        "file_id": "file_sf_8",
        "image_url": "/uploads/vd/start_frame_shot_8.png",
        "local_path": "uploads/vd/start_frame_shot_8.png",
        "contains_human_face": true,
        "openai_input_reference_allowed": false
      },
      "end_frame_reference": null,
      "prompt": "clip 8: slow push-in on Aria as tension rises",
      "negative_motion_prompt": "no warping, no identity drift, no camera whip",
      "subtitle_or_dialogue": "We are not done here.",
      "camera_motion": "slow_push_in",
      "continuity_notes": "maintain blazer + gold hoops across the bridge",
      "provider_request": {
        "provider": "veo_compatible",
        "external_image_to_video_request": null,
        "execution_status": "fallback_text_to_video",
        "execution_status_normalized": "fallback_prompt_only",
        "veo31_request": {
          "model": "veo-3.1",
          "mode": "first_last_frame",
          "prompt": "clip 8 motion prompt",
          "first_frame": "start_frame_shot_8",
          "last_frame": null,
          "reference_images": [
            "aria_primary_portrait.png"
          ],
          "duration_seconds": 4,
          "aspect_ratio": "9:16",
          "resolution": "1080x1920",
          "generate_audio": false
        }
      },
      "parent_shot_number": null,
      "sub_shot_number": null
    }
  ],
  "plain_text_video_plan": "8 clips totaling 60s; clips 1-7 bridged, clip 8 prompt-only fallback.",
  "final_episode_assembly_manifest": {
    "handoff_type": "video_assembly_manifest",
    "target_duration_seconds": 60,
    "clips": [
      {
        "clip_number": 1,
        "duration_seconds": 8
      },
      {
        "clip_number": 2,
        "duration_seconds": 8
      },
      {
        "clip_number": 3,
        "duration_seconds": 8
      },
      {
        "clip_number": 4,
        "duration_seconds": 8
      },
      {
        "clip_number": 5,
        "duration_seconds": 8
      },
      {
        "clip_number": 6,
        "duration_seconds": 8
      },
      {
        "clip_number": 7,
        "duration_seconds": 8
      },
      {
        "clip_number": 8,
        "duration_seconds": 4
      }
    ],
    "ffmpeg_concat_plan": {
      "filter": "concat",
      "n": 8,
      "trim_last_to_seconds": 4
    },
    "subtitle_plan": {
      "format": "srt",
      "safe_area": "9:16"
    },
    "audio_bgm_plan": {
      "bgm": "tension_theme",
      "ducking": true
    },
    "export_settings": {
      "fps": 30,
      "format": "mp4",
      "resolution": "1080x1920"
    }
  },
  "repair_loop": {
    "clip_qc_checklist": [
      "identity match",
      "camera drift",
      "motion sanity",
      "transition continuity"
    ],
    "common_video_repairs": [
      {
        "issue": "identity_drift",
        "fix": "reattach start frame reference"
      }
    ],
    "regenerate_rules": [
      "regenerate only failed clips",
      "preserve approved neighbors"
    ]
  }
}
```
