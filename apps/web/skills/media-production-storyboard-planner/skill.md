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
      "conceptDetails": "One distinct customer-journey or mini-story paragraph, maximum 450 Thai characters or 80 English words. Do not use a Product/Details/Audience/Problem/Selling points label list. Do not paste raw marketplace title/description text. Shape the paragraph to this concept's dimension and make it meaningfully different from the other three concepts.",
      "narrativeStructure": "Problem → Solution",
      "emotionalTone": "Empathy Tone",
      "hookTechnique": "Hook แบบปัญหาโดนใจ",
      "visualSummary": "One sentence describing the card's visual concept.",
      "keyVisualElements": ["realistic product hero", "requested-shot storyboard timeline", "evidence-safe proof badge"],
      "storyboardThumbnailNotes": "How the infographic should summarize the idea visually.",
      "infographicPrompt": "Create a polished realistic infographic with photorealistic supporting imagery, readable storyboard beats, and no unsupported product claims...",
      "variationRecipe": {
        "journeyStage": "consideration to confidence",
        "storyArc": "objection to proof",
        "emotion": "trust and relief",
        "speakingStyle": "friend answers the doubt",
        "hookStyle": "objection question",
        "cameraGrammar": "macro detail first, then reveal real-use context",
        "pacing": "slow proof, then clear CTA",
        "ctaStyle": "check product details first",
        "visualLanguage": "proof-led marketplace review"
      },
      "voiceoverBeats": [
        {
          "order": 1,
          "startSec": 0,
          "endSec": 7.5,
          "title": "Hook",
          "journeyStage": "awareness",
          "visualBeat": "What happens visually in this shot.",
          "cameraDirection": "Specific camera angle or movement.",
          "emotion": "The emotional intent for this shot.",
          "voiceoverScript": "Natural spoken product-video line, not brochure copy.",
          "speechBudgetSeconds": 10
        }
      ],
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

For every concept, include `conceptDetails` as one distinct customer-journey or mini-story paragraph. Keep it under 450 Thai characters or 80 English words. Do not paste raw marketplace title/description text, and do not use a label/template list such as Product / Details / Audience / Problem / Selling points. Make the four concepts clearly different:

- `problem_solution`: awareness problem to relief.
- `objection_trust`: consideration doubts to confidence.
- `quick_demo`: fast visual proof/demo beats.
- `use_case_moment`: post-purchase experience mini story.

Include product identity naturally once, use top evidence-safe points only when useful, and do not include emoji, decorative symbols, bullets, or line breaks.

For every concept, include `variationRecipe` and `voiceoverBeats`. `variationRecipe` is the compact anti-duplication driver: vary customer journey stage, story arc, emotion, speaking style, hook style, camera grammar, pacing, CTA style, and visual language while staying faithful to the product truth. Use human-readable phrases, not internal underscore tokens. `voiceoverBeats` must contain exactly the requested `shot_count` from `required_storyboard_voiceover` when provided; allowed storyboard counts are 6, 7, 8, 9, 10, 12, and 15. The beats must total 60 seconds, with per-shot timing distributed evenly unless the caller provides a different total. Each beat must include `order`, `startSec`, `endSec`, `title`, `journeyStage`, `visualBeat`, `cameraDirection`, `emotion`, `voiceoverScript`, and `speechBudgetSeconds`; set `speechBudgetSeconds` to about 10. The `voiceoverScript` must sound like natural spoken dialogue in a real product video, not written brochure copy, and should be long enough for roughly 10 seconds of natural speech so the final video does not leave long silent gaps. It should flow continuously across all shots and emotionally match the selected concept. Keep camera movement and visual notes out of `voiceoverScript`; put them in `visualBeat` and `cameraDirection`.

For every concept, include an `infographicPrompt` designed for the existing image generation system. The prompt should ask for a beautiful, realistic infographic with photorealistic supporting imagery, clear storyboard/timeline sections, and a visual summary that helps the user understand the concept at a glance. It must not invent unsupported product claims or alter product identity beyond the provided evidence.
