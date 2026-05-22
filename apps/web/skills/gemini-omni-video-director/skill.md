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

Create provider-ready Gemini Omni Video prompt packages for single-shot, multi-shot single-video, and storyboard multi-video workflows.

Return structured JSON only. Keep provider payload keys in `reference_plan` and `provider_plan`; keep user-facing text in creative fields.
