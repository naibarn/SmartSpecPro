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

Assess the generated image and return JSON only.

Check:
- product fidelity against product reference images: category, silhouette, material, color, proportions, parts, shelves/tiers/panels/drawers, labels/logos where relevant.
- character fidelity against character reference images: clear face when the person appears, same identity, skin texture, hair, wardrobe, no plastic-looking skin.
- environment and lighting continuity against scene references and storyboard guide.
- camera angle, lens feel, depth, cinematic realism, color grade, and dimensionality.
- exact shot match to `storyboard_guide` and `voiceover_script`; do not let the image tell a different story.
- back-view identity risk; if the image/video plan has a back-view person, require a no-turn/no-face-reveal lock before video.
- no visible text/captions unless the prompt explicitly permits it.

If you can inspect the generated image, set `inspection_mode` to `"vision"`. If you only have metadata/prompt context, set it to `"metadata_only"` and say what still needs human review.

Return:
```json
{
  "skill_name": "production-shot-image-quality-qa",
  "skill_version": "1.0.0",
  "contract_version": "1.0",
  "verdict": "pass",
  "score": 90,
  "threshold": 80,
  "inspection_mode": "vision",
  "summary": "Short QA summary.",
  "issues": [],
  "recommended_action": "approve",
  "revision_instructions": []
}
```
