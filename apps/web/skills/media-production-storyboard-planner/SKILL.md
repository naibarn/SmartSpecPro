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
- `variationRecipe`
- `voiceoverBeats`

For every concept, keep `conceptDetails` concise but story-led: one distinct customer-journey or mini-story paragraph under 450 Thai characters or 80 English words. Do not use a Product / Details / Audience / Problem / Selling points label list and do not paste raw marketplace title/description text. Make the four concepts clearly different: awareness problem to relief, consideration doubts to confidence, fast visual demo, and post-purchase experience mini story. Do not include emoji, decorative symbols, bullets, or line breaks.

For every concept, include `voiceoverBeats` with exactly the requested `shot_count` from `required_storyboard_voiceover` when provided; allowed storyboard counts are 6, 7, 8, 9, 10, 12, and 15. The beats must total 60 seconds, with per-shot timing distributed evenly unless the caller provides a different total. Each beat must include `order`, `startSec`, `endSec`, `title`, `journeyStage`, `visualBeat`, `cameraDirection`, `emotion`, `voiceoverScript`, and `speechBudgetSeconds`. Set `speechBudgetSeconds` to about 10. The `voiceoverScript` must sound like real spoken product-video dialogue, not written brochure copy, and should be long enough for roughly 10 seconds of natural speech so the final video does not leave long silent gaps. Keep camera movement and visual notes out of `voiceoverScript`; put them in `visualBeat` and `cameraDirection` so the video concept becomes a paired shot brief.

Use `variationRecipe` to make regenerated ideas genuinely different without relying on long history: vary customer journey stage, story arc, emotion, speaking style, hook style, camera grammar, pacing, CTA style, and visual language while staying faithful to the product truth. Output human-readable phrases, not internal underscore tokens.

`infographicPrompt` must be suitable for the existing image generation system and should request a beautiful realistic infographic with photorealistic supporting imagery, readable storyboard/timeline sections, and no unsupported product claims.
