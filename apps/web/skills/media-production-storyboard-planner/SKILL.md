---
name: media-production-storyboard-planner
description: Turns a ProductionGoal into a reviewable production plan, storyboard outline, scene timeline, shot plan, asset requirements, provider candidates, and approval checklist.
version: 1.0.0
category: automation
icon: clapperboard
tags: [media-production, storyboard, planning]
auto_trigger: false
enabled_by_default: true
credit_multiplier: 1.0
priority: 75
execution_mode: llm-only
---

# Media Production Storyboard Planner

Create a reviewable plan package. Do not submit provider jobs or reserve credits.

When creating four story concepts for Production Director, return visual support fields for each concept:

- `visualSummary`
- `keyVisualElements`
- `storyboardThumbnailNotes`
- `infographicPrompt`

For every concept, keep `conceptDetails` concise but story-led: one distinct customer-journey or mini-story paragraph under 450 Thai characters or 80 English words. Do not use a Product / Details / Audience / Problem / Selling points label list and do not paste raw marketplace title/description text. Make the four concepts clearly different: awareness problem to relief, consideration doubts to confidence, fast visual demo, and post-purchase experience mini story. Do not include emoji, decorative symbols, bullets, or line breaks.

`infographicPrompt` must be suitable for the existing image generation system and should request a beautiful realistic infographic with photorealistic supporting imagery, readable storyboard/timeline sections, and no unsupported product claims.
