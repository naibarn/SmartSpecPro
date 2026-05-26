---
name: media-products-storyboard-planner
description: Imported from shared skill bundle (media-products-storyboard-planner.zip)
category: image_prompt_generation
version: 1.0.0
icon: sparkles
tags:
  - shared-skill
  - imported
auto_trigger: false
trigger_patterns: []
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
config:
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
# Media Products Storyboard Planner Skill

## Purpose

Use this skill to transform a user's production brief, uploaded assets, concept direction, product truth, creative direction, and constraints into a complete storyboard plan, image/video generation prompt, shot list, and QA-ready handoff.

This skill is designed for workflows such as:

- Product review storyboard
- TikTok / Reels / Shorts video planning
- Product infographic storyboard board
- Character + product + scene storyboard
- Interior / home product walkthrough
- Problem → Solution product storytelling
- Multi-video storyboard planning

## Core Principle: Full Input Coverage

Every non-empty user input must be used, mapped, or explicitly marked as not applicable with a reason.

Before producing the final plan, create an `input_usage_map` that explains where each user-provided input is used. If an input is not used, include it in `omitted_inputs` with a clear reason.

## Required Files

```text
media-production-storyboard-planner-skill/
├── SKILL.md
└── schemas/
    ├── input.schema.json
    ├── ui.schema.json
    └── output.schema.json
```

## When to Use

Use this skill when the user wants to create or plan:

- A storyboard
- A video ad
- A product review video
- A social media video
- A product infographic image
- A shot list
- A script
- An image/video generation prompt
- A production handoff

## Input Handling

The user may provide inputs through a UI, JSON payload, natural-language brief, or uploaded files.

Common user inputs include:

- Project name
- Production goal
- Content type
- Target group
- Platform
- Duration
- Aspect ratio
- Language
- Product truth / brand truth
- Creative direction
- Constraints
- Concept direction
- Hook seed
- Selected concept card
- Reference assets

Reference assets may include:

- Character / presenter images
- Product images
- Background / scene images
- Style references
- Floor plan references
- Logo / brand references
- Material references
- Video references
- Audio references

## Asset Integration Rules

1. Every uploaded asset must be assigned a role.
2. Product images are the visual source of truth for the product. The final prompt must instruct the image/video model to look at the attached product reference images first and preserve what is visible there, even when other text, style, or scene instructions are present.
3. Character images must preserve the overall identity and key visual traits, unless the user says otherwise.
4. Scene images must guide mood, lighting, environment, and composition.
5. If an uploaded asset is not used, explain why in `omitted_inputs`.
6. Do not invent product features that are not supported by the user input or evidence.
7. Do not claim sales numbers, certifications, or proof points unless provided.
8. Do not invent, stylize, redraw, or add any brand mark, trademark, certification badge, marketplace badge, shop logo, app logo, or platform logo unless the user explicitly provides permission and exact artwork for that use.
9. Do not copy logos or brand marks from reference/source images into the generated infographic, except when the logo is physically printed on the product/package itself and is visible as part of the product reference. Even then, preserve it only as an incidental product detail, not as a standalone decorative or header logo.
10. Do not use price, discount, voucher, promotion, campaign condition, free-shipping claim, countdown deal, installment term, or limited-time offer in prompts or visible infographic text. These values change frequently and must be omitted even if found in marketplace screenshots or product metadata, unless the user explicitly asks to create a temporary promo draft and provides the exact approved copy.

## Visual Source Of Truth Rules

When `reference_assets.assets` contains one or more `product_image` assets, generate the plan and `main_prompt` in strict visual-reference mode:

1. Treat attached product images as the primary source of truth for product identity, not as loose style inspiration.
2. Preserve product silhouette, structure, visible part count, proportions, color/material, surface finish, openings, handles, legs, shelves, buttons, labels, packaging, and any other product-specific details that are visible in the images.
3. Do not replace the product with a similar-looking generic product, upgraded variant, different model, different material, or more premium interpretation.
4. Style, lighting, text overlay, background, room setting, camera framing, and infographic layout may change only around the product; they must not alter the product itself.
5. If product text conflicts with the product image, follow the image for visual attributes and mention the conflict in `handoff_notes`.
6. If multiple product images show different variants, keep the prompt variant-neutral or explicitly ask the generation model to preserve the exact variant visible in the selected hero product reference.
7. The `main_prompt` must include a visible `PRODUCT REFERENCE LOCK` section that tells the generation model to use attached product images as direct visual reference and lists only generic fidelity requirements that work for any product category.
8. The `main_prompt` must include a visible `TRADEMARK / LOGO SAFETY LOCK` section: no invented brand marks/logos; no copied source-image logos; only preserve logos physically printed on the referenced product/package when visible, and never use them as separate layout decoration.
9. The `main_prompt` must include a visible `PRICE / PROMOTION SAFETY LOCK` section: omit all prices, discounts, vouchers, promo badges, shipping offers, sale campaign text, countdown deals, and limited-time conditions because they can change at any time.
10. The `negative_prompt` must include generic product-drift failures plus trademark/logo/price failures: wrong product, changed shape, changed material, changed color, changed proportions, changed visible parts, extra features, missing visible details, generic substitute product, invented logo, fake brand mark, copied source-image logo, standalone logo decoration, fake certification badge, fake marketplace badge, price tag, discount badge, voucher, promo banner, sale countdown, free shipping badge.
11. The `qa_checklist` must include pass/fail items comparing the generated product against every product reference image, checking that no unauthorized logo/trademark/badge was created or copied, and checking that no price/promotion/offer text appears before approving the output.

## Storyboard Logic

Build the storyboard around the user's concept direction.

Typical arcs include:

- Problem → Solution
- Hook → Problem → Solution → Proof → CTA
- Before → After
- Feature → Benefit → Proof
- Question → Answer
- Walkthrough
- Product demo
- Lifestyle use case

For short-form video, align timing with the selected duration.

Example for 30 seconds:

```text
0–5s Hook
5–12s Problem
12–20s Solution
20–26s Proof / Demo
26–30s CTA
```

## Output Requirements

The final output must include:

1. `thai_summary`
2. `input_usage_map`
3. `reference_integration_plan`
4. `storyboard_timing`
5. `main_prompt`
6. `negative_prompt`
7. `qa_checklist`
8. `omitted_inputs`
9. `handoff_notes`

When product references are present, also include:

- `product_fidelity_lock`: a short structured summary of how the prompt preserves product identity from attached images.
- `visual_source_of_truth_notes`: notes explaining that visual product attributes come from the attached images, while text claims come from product truth/evidence.

## Prompt Writing Guidelines

When generating the final prompt:

- Use the project name in the title/header.
- Use the production goal as the objective.
- Use the target group to shape hook, pain point, tone, and CTA.
- Use the platform to shape pacing, framing, and aspect ratio.
- Use duration to create shot timing.
- Use language for hook, script, voiceover, or on-screen text.
- Use product truth as strict product constraints.
- Use creative direction as visual style.
- Use constraints in both negative prompt and QA checklist.
- Use all referenced assets according to the reference integration plan.
- Put product-reference fidelity before style instructions when product images are present.
- Do not describe a product design from memory or category expectation. Phrase product visuals as: "Use the attached product reference image(s) as the exact visual source of truth."
- Keep product fidelity language category-agnostic so it works for furniture, electronics, cosmetics, packaging, clothing, food, tools, accessories, and other marketplace products.

## Quality Checklist

Before finalizing, verify:

- All non-empty inputs appear in `input_usage_map`.
- All assets appear in `reference_integration_plan`.
- Product visuals preserve the reference product.
- Product-reference fidelity appears in `main_prompt`, `negative_prompt`, `reference_integration_plan`, `qa_checklist`, and `handoff_notes` whenever product images are provided.
- Scene visuals match scene references.
- Platform, duration, ratio, and language are respected.
- Claims are supported by evidence.
- Constraints appear in negative prompt and QA checklist.
- `omitted_inputs` is empty or justified.

## Example Use Case

User input:

```text
Project: รีวิวโต๊ะข้างเตียง
Goal: ทำวิดีโอรีวิวสินค้าโต๊ะข้างเตียงนอน
Platform: TikTok
Duration: 30s
Ratio: 9:16
Language: Thai
Target: คนแต่งบ้าน / ของใช้ในบ้าน
Product truth: ภาพสินค้าต้องเหมือนภาพจริงที่แนบไป
Concept: ปัญหา → ทางออก
Assets: 2 product images, 1 presenter image, 1 scene image
```

Expected behavior:

- Use the product images as strict product references.
- The final prompt must tell the image generator to use the attached product images as exact visual source of truth, not as a general inspiration board.
- Use the scene image as background/mood reference.
- Use the presenter image if present as character reference.
- Build a 30-second TikTok storyboard.
- Use Thai hook and CTA.
- Include input usage map.
- Include QA checklist ensuring the product stays visually accurate.
