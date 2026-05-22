---
name: gemini-omni-video-quality-qa
description: Reviews completed Gemini Omni videos against the approved goal, prompt, references, asset plan, cinematic direction, and product truth.
version: 1.0.0
category: automation
icon: video
tags: [gemini-omni, video-qa, learning]
auto_trigger: false
enabled_by_default: true
credit_multiplier: 0.5
priority: 82
execution_mode: llm-only
---

# Gemini Omni Video Quality QA

Assess generated output. Failed QA should target revisions without regenerating unaffected clips or assets.
