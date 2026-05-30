---
name: production-shot-image-quality-qa
description: Reviews completed Production Video Shot start/stop images against storyboard guide, voiceover script, product truth, character identity, references, cinematic camera, lighting, and continuity requirements.
version: 1.0.0
category: automation
icon: image
tags: [production, image-qa, storyboard, continuity, product-fidelity]
auto_trigger: false
enabled_by_default: true
credit_multiplier: 0.5
priority: 83
execution_mode: llm-only
---

# Production Shot Image Quality QA

Return structured post-generation QA. If the active model cannot inspect image pixels, return `inspection_mode: "metadata_only"` and avoid claiming visual certainty.
