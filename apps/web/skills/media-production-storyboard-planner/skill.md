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

Return structured JSON for review before any batch execution or provider credit reservation.

## Marketplace Story Concept Synthesis

When `userInputs.mode` is `marketplace_story_concept_synthesis`, return JSON only:

```json
{
  "story_concepts": [
    {
      "storyOptionId": "story_option:problem_solution",
      "storyDimension": "problem_solution",
      "title": "ปัญหา → ทางออก",
      "angle": "...",
      "audience": "...",
      "painPoint": "...",
      "hook": "พูดเป็นภาษาไทยว่า ...",
      "sellingPoints": ["..."],
      "objectionsTrust": ["..."],
      "useCase": "...",
      "conceptDetails": "One complete narrative paragraph ready to copy into downstream work such as voice over scripting. Include product name, summarized product details, target audience, problem, and selling points without unsupported claims.",
      "narrativeStructure": "Problem → Solution",
      "emotionalTone": "Empathy Tone",
      "hookTechnique": "Hook แบบปัญหาโดนใจ",
      "visualSummary": "One sentence describing the card's visual concept.",
      "keyVisualElements": ["realistic product hero", "4-step storyboard timeline", "evidence-safe proof badge"],
      "storyboardThumbnailNotes": "How the infographic should summarize the idea visually.",
      "infographicPrompt": "Create a polished realistic infographic with photorealistic supporting imagery, readable storyboard beats, and no unsupported product claims...",
      "sceneTimeline": [
        { "timeRange": "0-3s", "title": "Hook", "detail": "..." },
        { "timeRange": "3-12s", "title": "Problem", "detail": "..." },
        { "timeRange": "12-23s", "title": "Solution / proof", "detail": "..." },
        { "timeRange": "23-30s", "title": "CTA", "detail": "..." }
      ]
    }
  ]
}
```

Always provide exactly four concepts for:

- `story_option:problem_solution`: pain and solution.
- `story_option:objection_trust`: objection and proof/trust.
- `story_option:quick_demo`: visual/video sequence to show, demo steps, and benefits.
- `story_option:use_case_moment`: real use case by context.

Mix each concept with a suitable storytelling structure, emotional tone, and short-video hook technique from the provided reference list. Use product truth, selected marketplace evidence, user-provided assets, and existing insight first. If evidence is missing, mark the concept review-safe instead of inventing product facts.

For every concept, include `conceptDetails` as one complete copy-ready paragraph. It must explicitly cover product name, summarized product details, target audience, problem, and selling points in natural narration form, not a bullet list.

For every concept, include an `infographicPrompt` designed for the existing image generation system. The prompt should ask for a beautiful, realistic infographic with photorealistic supporting imagery, clear storyboard/timeline sections, and a visual summary that helps the user understand the concept at a glance. It must not invent unsupported product claims or alter product identity beyond the provided evidence.
