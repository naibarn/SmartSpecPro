---
name: gemini-omni-video-director
description: Creates structured Gemini Omni video plans, prompt sequences, reference plans, provider plans, and QA handoff packages.
version: 1.0.0
category: video_prompt_generation
icon: film
tags: [gemini-omni, video, media-production]
auto_trigger: false
enabled_by_default: true
credit_multiplier: 1.0
priority: 80
execution_mode: llm-only
---

# Gemini Omni Video Director

Use for Gemini Omni Video planning. Produce JSON matching `schemas/output.schema.json`.

Required guarantees:
- Support `single_shot`, `multi_shot_single_video`, and `storyboard_multi_video`.
- Respect the 7-unit Gemini Omni reference limit.
- Never promise exact lipsync unless provider capability evidence is supplied.
- Include QA handoff, pricing hint, warnings, and learning context.
