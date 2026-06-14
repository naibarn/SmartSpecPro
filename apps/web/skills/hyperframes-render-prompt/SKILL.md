---
name: hyperframes-render-prompt
description: Builds complete HyperFrames render prompts for Thai ecommerce product videos from product truth, storyboard structure, approved clips, overlay copy, subtitles, audio policy, and platform constraints.
category: video_prompt_generation
version: 1.0.0
icon: film
tags:
  - hyperframes
  - video-render
  - ecommerce
  - thai-copy
  - storytelling
auto_trigger: false
triggerPatterns:
  - hyperframes render prompt
  - create hyperframes prompt
  - marketplace hyperframes final composite prompt
trigger_patterns:
  - hyperframes render prompt
  - create hyperframes prompt
  - marketplace hyperframes final composite prompt
enabled_by_default: true
credit_multiplier: 1
priority: 62
execution_mode: llm-only
strict_provider_pin: false
execution_policy:
  mode: requirements
  requirements:
    supportsVision: false
    contextLength: 128000
  allowConversationOverride: false
  allowFreeModels: false
  fallbackPolicy: error
config:
  marketplace_auto_review:
    hyperframes:
      final_composite_prompt: true
      require_product_truth: true
      require_storytelling_structure: true
      require_safe_area_rules: true
      max_prompt_chars: 12000
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# HyperFrames Render Prompt Skill

## Purpose

Create a complete, production-ready HyperFrames render prompt for a 9:16 Thai
ecommerce product video. The result must tell HyperFrames exactly what video to
make, what text to show, how to animate each beat, which assets to use, and what
not to invent.

Use this skill when Auto Storyboard Review or Storyboard Review needs a smarter
render prompt than deterministic field concatenation can provide.

## Input Contract

The caller should provide:

- product title and canonical product facts;
- product category and marketplace context;
- price, promotion, trust, and warranty text when evidence-backed;
- approved storyboard beats or completed shot clips;
- hook/supporting text candidates;
- per-shot overlay text candidates;
- subtitle or voiceover text;
- selected overlay/subtitle/audio presets;
- target platform, resolution, duration, safe-zone, and language;
- any compliance or claim restrictions.

## Output Contract

Return only one plain text prompt. Do not return JSON or Markdown fences.

The prompt must fit within 12000 characters and include these sections:

1. Opening instruction: create a 9:16 vertical product ad using HyperFrames.
2. Style: premium, modern, product-specific design direction.
3. Product: product name and evidence-backed context.
4. Visual: how to use product images or generated clips.
5. Headline and subheadline.
6. Feature callouts rewritten into concise, readable Thai selling points.
7. Price or trust section when evidence exists.
8. Storytelling structure: hook, problem/desire, proof, feature, offer, CTA.
9. Animation timeline with second ranges matching the target duration.
10. Subtitle policy.
11. Audio policy.
12. Export requirements.

## Quality Rules

- Do not simply paste raw product description lines.
- Rewrite specs into short, premium Thai overlay copy.
- Keep Thai text readable on mobile: no long lines, no dense paragraphs.
- Use product truth only. Do not invent prices, specs, awards, official badges,
  logos, discounts, shipping claims, or warranties.
- Preserve important numeric specs exactly.
- Choose a hook that communicates the main buyer benefit, not just the product
  name.
- Make overlay text feel modern and commercial: concise, confident, and visually
  structured.
- The timeline must align to the number of source clips and total duration.
- If subtitles are disabled, explicitly say no subtitles.
- If native audio should be preserved, say so; otherwise define music/SFX only.

## Example Shape

Create a 9:16 vertical product ad video using HyperFrames.

Style: premium Thai ecommerce flash sale ad, modern product layout, clean
background, readable high-contrast Thai typography.

Product: [product name].
Visual: use the approved storyboard clips as the main product footage, keep the
product visible, add subtle floating motion and soft shadows.

Headline: "[benefit-led hook]"
Subheadline: "[product/supporting line]"
Feature callouts:
- [short spec/benefit]
- [short spec/benefit]

Animation:
0-1s: background and product identity reveal.
1-3s: product footage floats in with headline.
3-6s: feature proof appears one by one.
6-8s: offer/trust area slides up.
8-10s: CTA pulse, product and key text stay visible.

No subtitles. Thai text must be clear and readable.
Export as MP4, 1080x1920.
