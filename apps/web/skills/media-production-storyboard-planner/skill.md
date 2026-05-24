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
      "narrativeStructure": "Problem → Solution",
      "emotionalTone": "Empathy Tone",
      "hookTechnique": "Hook แบบปัญหาโดนใจ",
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
