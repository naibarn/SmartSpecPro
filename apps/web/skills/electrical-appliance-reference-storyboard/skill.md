---
name: electrical-appliance-reference-storyboard
description: Electrical Appliance Reference Storyboard prompt skill adapted from the furniture reference storyboard pattern. Optimized for home appliances and powered utility devices such as refrigerators, washing machines, microwaves, air fryers, blenders, fans, air purifiers, kettles, rice cookers, irons, heaters, vacuum cleaners, and small kitchen appliances, strict reference-image fidelity, exact product shape and proportion preservation, material and texture accuracy, marking/label preservation, product-source dominance, clean no-text-by-default image generation, infographic text controls, equal-frame storyboard layout, anti-generic-substitution guards, and category-specific QA gates. Use when generating image or storyboard prompts for เครื่องใช้ไฟฟ้า (home appliances and powered utility devices such as refrigerators, washing machines, microwaves, air fryers, blenders, fans, air purifiers, kettles, rice cookers, irons, heaters, vacuum cleaners, and small kitchen appliances).
category: image_prompt_generation
version: 1.0.0
icon: zap
tags:
  - shared-skill
  - imported
  - reference-storyboard
  - production-reference-storyboard
  - product-fidelity
  - appliance
  - home-electrical
  - product-fidelity
auto_trigger: false
triggerPatterns:
  - Electrical Appliance Reference Storyboard
  - electrical-appliance-reference-storyboard
  - เครื่องใช้ไฟฟ้า
trigger_patterns:
  - Electrical Appliance Reference Storyboard
  - electrical-appliance-reference-storyboard
  - เครื่องใช้ไฟฟ้า
enabled_by_default: false
credit_multiplier: 1
priority: 50
execution_mode: llm-only
strict_provider_pin: false
execution_policy:
  mode: requirements
  requirements:
    supportsVision: true
    contextLength: 1000000
  allowConversationOverride: false
  allowFreeModels: false
  fallbackPolicy: error
config:
  media_studio:
    production_reference_storyboard:
      enabled: true
    auto_learning:
      enabled: true
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
# Electrical Appliance Reference Storyboard

## Purpose

This skill writes high-fidelity image and storyboard prompts for เครื่องใช้ไฟฟ้า (home appliances and powered utility devices such as refrigerators, washing machines, microwaves, air fryers, blenders, fans, air purifiers, kettles, rice cookers, irons, heaters, vacuum cleaners, and small kitchen appliances). It is adapted from the furniture reference storyboard skill's product-source-dominance, equal-frame storyboard, no-text-by-default, and QA-loop conventions, but all product fidelity rules are rewritten for this category.

The current product reference images are the highest-priority source of truth. Creative styling may change the environment, camera, lighting, props, and mood, but it MUST NOT redesign, resize, recolor, relabel, simplify, beautify, or replace the referenced electrical appliance.

## Optional Storyboard Guide Contract

Input `storyboard_guide` is optional. When it is blank, keep normal skill behavior. When provided, it becomes the creative direction contract for shot order, timing, story beat, product-use action, camera intent, and continuity. Follow the guide without contradicting product reference locks, category-specific shape rules, physical markings, or safety constraints.

Input `production_concept_details` is optional. Use it as the higher-level concept guideline for audience, problem, hook, tone, selling points, and storyboard intent. Never add prices, discounts, ratings, sales volume, certifications, medical/safety claims, compatibility claims, or other volatile claims unless the user supplied exact text.

## Media Studio Output Contract

When executed from Media Studio Auto Prompt, return plain prompt text only. Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or `scene_descriptions`.

Allowed shape:

OUTPUT FORMAT LOCK:
...

TEXT RENDERING POLICY:
...

PRODUCT REFERENCE LOCK:
...

PRODUCT PHYSICAL PROPORTION LOCK:
...

PRODUCT SCALE LOCK:
...

STORYBOARD PROMPT:
9:16 final canvas, 3x3 grid, 9 total vertical frames.
Frame 1: ...
Frame 2: ...
...
Frame 9: ...

## Reference Role Disambiguation Rule

Separate references before prompt writing:
- `reference_product_images` define the exact product only: category, geometry, proportions, material, construction, colorway, physical markings, packaging, and scale.
- `reference_character_images` define recurring person identity only. Preserve face likeness when people appear; use hands-only or product-only frames if identity cannot be preserved.
- `reference_environment_images` define room/location mood, lighting, architecture, floor/wall/surface material, and context only. They must not override product shape, material, scale, color, or markings.
- Old uploads, generated images, unrelated people, unrelated rooms, marketplace thumbnails, and background objects must not contaminate the current product unless explicitly included as current product references.

## Required Product Lock Blocks

Every output must include a category-specific `PRODUCT REFERENCE LOCK`, `PRODUCT PHYSICAL PROPORTION LOCK`, and `PRODUCT SCALE LOCK`. The lock must state observable facts, not vague phrases like "match the reference."

Lock these facts from the current product reference:
- Exact product category and subtype from current reference images.
- Overall silhouette, height-width-depth or length-width-thickness relationship, and visual bounding box.
- Countable parts, visible components, openings, seams, hinges, fasteners, controls, labels, ports, tags, or closures.
- Primary and secondary colors, finish, reflectivity, transparency, texture scale, pattern direction, and material identity.
- Physical scale class and how the product sits, folds, hangs, stands, is held, worn, opened, plugged in, poured, served, or used.
- All physical marks that belong to the product: brand marks, printed text, engraved text, stitched tags, labels, stickers, packaging facts, serial-like markings, and decorative pattern text when present.

For เครื่องใช้ไฟฟ้า, the prompt must additionally preserve:
- large appliances: refrigerator, washing machine, dryer, dishwasher, freezer, range hood
- small kitchen appliances: microwave, oven, air fryer, blender, kettle, rice cooker, toaster, coffee machine
- air and cleaning appliances: fan, air purifier, humidifier, vacuum, steam cleaner, dehumidifier
- care appliances: iron, garment steamer, hair dryer when sold as appliance, heater
- control systems: knobs, buttons, touch panels, displays, doors, handles, vents, transparent windows

## Category-Specific Physical Fidelity Rules

### Structure And Proportion

Preserve door orientation, handle placement, window shape, knob/button count, display position, vent grille pattern, tank/basket shape, blade jar geometry, cord position, wheel/foot/base stance, and appliance proportions.

### Material And Texture

Preserve stainless steel, glossy plastic, matte plastic, glass windows, transparent reservoirs, rubber gaskets, mesh filters, ceramic-coated baskets, chrome trim, and brushed metal finish.

### Marking, Label, And Physical Text Preservation

Preserve physical control labels, temperature marks, icons, capacity labels, brand badges, energy labels only if part of product/packaging; exclude marketplace overlays.

### Scale And Context

Show correct countertop, floor, hand, cabinet, kitchen, laundry, or room scale; do not shrink large appliances into mini gadgets or enlarge compact appliances into furniture.

### Product Interaction And Use

Use scenes such as opening door/lid, loading contents, pressing controls, showing filter/tank/basket, countertop placement, cleaning/cooking/airflow result, or safe plugged-in use.

### Common Wrong Substitutions To Reject

The prompt must explicitly reject:
- inventing control panels
- changing door swing or handle side
- turning appliance into furniture
- removing vents or cords
- changing capacity proportions
- adding fake digital text or promo badges

## Multi-Frame Storyboard Visual Rule

When `generation_mode` is `multi_frame_storyboard`, create one clean generated image containing the requested grid. Use `storyboard_layout_preset` as the canvas contract. State the exact grid, total frame count, final canvas aspect ratio, and whether frames are exact-ratio or crop-safe.

For short 2-4 panel product storyboards, every panel must show the referenced product unless the user explicitly requests mood-only frames. For 3x3 storyboards, at least 7 of 9 panels should clearly show the same product, and all product-visible frames must preserve the same category, material, proportions, markings, and scale.

Default 3x3 customer-journey map for this category:
Frame 1: hero front view.
Frame 2: side/depth scale.
Frame 3: door/lid open.
Frame 4: control panel close-up.
Frame 5: material/vent detail.
Frame 6: real-use loading.
Frame 7: result context.
Frame 8: maintenance/filter detail.
Frame 9: final lifestyle scene.

The rendered storyboard image must not contain visible frame numbers, captions, labels, text boxes, lower-thirds, subtitles, arrows with text, UI chrome, or layout typography unless `image_text_mode` is `with_text` OR `cinematic_style` is `info_graphics_realistic` or `info_graphics`.

## Default No-Extra-Text Rendering Rule

Input `image_text_mode` controls added visible text in the generated image. Infographic cinematic styles have higher priority than the no-text default.

- If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, treat it as an explicit visible-text request even when `image_text_mode` is missing or `no_text`. Do NOT include a no-added-visible-text negative prompt. Every generated prompt must include a `TEXT RENDERING POLICY` requiring a readable infographic layout with concise, large, intentional text.
- For `info_graphics_realistic`, write the image prompt in this direction: "Create an info graphics realistic image using the attached product/reference image as the main visual, with large readable text, not too many words, only the key points about [topic/key product benefit]." Keep the product photo-realistic and preserve the reference product's exact shape, proportions, material, texture, markings, and scale.
- For `info_graphics`, write the image prompt in this direction: "Create a clean info graphics image using the attached product/reference image as the main visual, with large readable text, not too many words, only the key points about [topic/key product benefit]." Use clean graphic shapes, icons, callout panels, and hierarchy while preserving the reference product.
- Infographic text language follows `image_text_language`: `en` for English, `th` for Thai, and `other` for `image_text_custom_language`. If no language is specified, use English. If Thai is selected, use large concise Thai headline/callout text.
- Infer `[topic/key product benefit]` only from user-supplied `storyboard_guide`, `production_concept_details`, `product_title`, `product_label_text`, visible product facts, or safe category/use-case facts. Use one large headline plus 2-4 short key points; avoid paragraphs and dense copy.
- If `cinematic_style` is not an infographic style and `image_text_mode` is missing or `no_text`, every generated prompt must explicitly include a `TEXT RENDERING POLICY` saying the image contains no added visible text of any kind.
- If `image_text_mode` is `with_text`, intentional added text is allowed only when it supports a requested storyboard, ad, infographic, callout, caption, headline, label, comparison, or measurement design.

When added text is allowed, keep it short, readable, and in the selected language. Do not invent prices, discounts, ratings, sold counts, sales volume, certifications, health/safety claims, compatibility claims, badges, or marketplace copy unless the user supplied exact text.

Physical product text, package labels, brand marks, tags, engravings, printed pattern text, and real-world environment text are not added storyboard text. Preserve them when they belong to the referenced product, even when `image_text_mode` is `no_text`.

## Character And Human Interaction Rules

If recognizable character references are supplied for a 3x3 storyboard, include at least 2 referenced-person frames: one clear visible-face frame with the product visible and one clear visible-face product interaction frame. Use front-facing or three-quarter angles by default. Back-of-head, over-shoulder, tiny, hidden, cropped, masked, shadowed, or blurred faces do not satisfy identity frames.

If identity cannot be preserved confidently, use product-only, hands-only, partial-body, over-shoulder without visible face, or detail frames instead of inventing a new person.

## Fatal QA Gates

Before finalizing, silently rewrite any prompt that violates these gates:
- Reject any prompt that turns the product into a nicer generic catalog item instead of the exact referenced item.
- Reject product category drift, changed proportions, changed material class, changed texture, changed print or pattern scale, invented physical product labels, unsupported claims, missing small parts, or mismatched colorway. Intentional infographic overlay text is allowed only under the infographic/text rules above.
- Reject environment-reference contamination: background objects, old uploads, or prior generations must not replace the current product reference.
- Reject hidden-product frames unless the user explicitly asks for mood-only scenes; product storyboards must keep the product inspectable.
- When multiple references conflict, select one hero SKU or clearly describe a product family without blending variants into one impossible hybrid.

The final prompt must make the image model preserve the real referenced electrical appliance: exact shape, proportions, material, texture, markings, and scale from the image, not a generic category archetype.