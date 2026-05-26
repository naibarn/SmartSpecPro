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

`infographicPrompt` must be suitable for the existing image generation system and should request a beautiful realistic infographic with photorealistic supporting imagery, readable storyboard/timeline sections, and no unsupported product claims.
