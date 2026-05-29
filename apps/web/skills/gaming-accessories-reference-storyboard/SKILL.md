---
name: gaming-accessories-reference-storyboard
description: Gaming And Accessories Reference Storyboard prompt skill adapted from the furniture reference storyboard pattern. Optimized for game consoles, controllers, handheld gaming devices, gamepads, gaming headsets, game boxes/cards, keyboards, mice, mousepads, controller stands, charging docks, grips, cases, and gaming accessory kits, strict reference-image fidelity, exact product shape and proportion preservation, material and texture accuracy, marking/label preservation, product-source dominance, clean no-text-by-default image generation, infographic text controls, equal-frame storyboard layout, anti-generic-substitution guards, and category-specific QA gates. Use when generating image or storyboard prompts for เกมส์และอุปกรณ์เสริม (game consoles, controllers, handheld gaming devices, gamepads, gaming headsets, game boxes/cards, keyboards, mice, mousepads, controller stands, charging docks, grips, cases, and gaming accessory kits).
category: image_prompt_generation
version: 1.0.0
icon: gamepad-2
tags:
  - shared-skill
  - imported
  - reference-storyboard
  - production-reference-storyboard
  - product-fidelity
  - gaming
  - game-accessories
  - product-fidelity
auto_trigger: false
triggerPatterns:
  - Gaming And Accessories Reference Storyboard
  - gaming-accessories-reference-storyboard
  - เกมส์และอุปกรณ์เสริม
trigger_patterns:
  - Gaming And Accessories Reference Storyboard
  - gaming-accessories-reference-storyboard
  - เกมส์และอุปกรณ์เสริม
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
# Gaming And Accessories Reference Storyboard

## Purpose

This skill writes high-fidelity image and storyboard prompts for เกมส์และอุปกรณ์เสริม (game consoles, controllers, handheld gaming devices, gamepads, gaming headsets, game boxes/cards, keyboards, mice, mousepads, controller stands, charging docks, grips, cases, and gaming accessory kits). It is adapted from the furniture reference storyboard skill's product-source-dominance, equal-frame storyboard, no-text-by-default, and QA-loop conventions, but all product fidelity rules are rewritten for this category.

The current product reference images are the highest-priority source of truth. Creative styling may change the environment, camera, lighting, props, and mood, but it MUST NOT redesign, resize, recolor, relabel, simplify, beautify, or replace the referenced gaming product or accessory.

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

For เกมส์และอุปกรณ์เสริม, the prompt must additionally preserve:
- controllers: stick count, D-pad, face buttons, triggers, shoulder buttons, grip shape, charging port
- consoles/handhelds: screen ratio, bezel, joy grips, dock shape, vents, cartridge/card slot
- gaming peripherals: headset cups, boom mic, keyboard key layout, RGB zones, mouse buttons, mousepad edge
- game media: box art, cartridge, disc, card, case spine, edition markings when visible
- docks/stands: cradle shape, connector, LED, cable routing, controller slots

## Category-Specific Physical Fidelity Rules

### Structure And Proportion

Preserve controller button/stick layout, grip proportions, trigger shapes, console vent/slot layout, handheld screen ratio, headset cup/mic shape, keyboard rows, mouse button count, and dock slots.

### Material And Texture

Preserve matte plastic, glossy accents, rubber sticks, textured grips, fabric/leatherette ear pads, braided cables, RGB glow zones, printed box/card finish, and soft mousepad surface.

### Marking, Label, And Physical Text Preservation

Preserve physical logos, button glyphs, box/card title text if visible, LED icons, and controller labels; do not invent game titles or UI text.

### Scale And Context

Show realistic hand, desk, console shelf, TV/gaming setup, bag, dock, or controller stand scale; do not merge console and controller into impossible hybrid.

### Product Interaction And Use

Use scenes such as hand grip, button close-up, charging dock, console setup, headset wear, keyboard/mouse desk, cartridge/box display, or co-play lifestyle.

### Common Wrong Substitutions To Reject

The prompt must explicitly reject:
- changing button layout
- inventing game art/text
- adding extra sticks/triggers
- changing screen ratio
- turning controller into generic remote
- misplacing charging ports

## Multi-Frame Storyboard Visual Rule

When `generation_mode` is `multi_frame_storyboard`, create one clean generated image containing the requested grid. Use `storyboard_layout_preset` as the canvas contract. State the exact grid, total frame count, final canvas aspect ratio, and whether frames are exact-ratio or crop-safe.

For short 2-4 panel product storyboards, every panel must show the referenced product unless the user explicitly requests mood-only frames. For 3x3 storyboards, at least 7 of 9 panels should clearly show the same product, and all product-visible frames must preserve the same category, material, proportions, markings, and scale.

Default 3x3 customer-journey map for this category:
Frame 1: product hero.
Frame 2: hand grip scale.
Frame 3: button/stick detail.
Frame 4: port/dock/charging frame.
Frame 5: material/RGB close-up.
Frame 6: gaming setup context.
Frame 7: box/media frame.
Frame 8: storage/case frame.
Frame 9: final play lifestyle scene.

The rendered storyboard image must not contain visible frame numbers, captions, labels, text boxes, lower-thirds, subtitles, arrows with text, UI chrome, or layout typography unless `image_text_mode` is `with_text`.

## Default No-Extra-Text Rendering Rule

Input `image_text_mode` controls added visible text in the generated image.

- If `image_text_mode` is missing or `no_text`, every generated prompt must explicitly include a `TEXT RENDERING POLICY` saying the image contains no added visible text of any kind.
- If `image_text_mode` is `with_text`, intentional added text is allowed only when it supports a requested storyboard, ad, infographic, callout, caption, headline, label, comparison, or measurement design. Use `image_text_language`: `en` for English, `th` for Thai, and `other` for `image_text_custom_language`. Default language is English.

When added text is allowed, keep it short, readable, and in the selected language. Do not invent prices, discounts, ratings, sold counts, sales volume, certifications, health/safety claims, compatibility claims, badges, or marketplace copy unless the user supplied exact text.

Physical product text, package labels, brand marks, tags, engravings, printed pattern text, and real-world environment text are not added storyboard text. Preserve them when they belong to the referenced product, even when `image_text_mode` is `no_text`.

## Character And Human Interaction Rules

If recognizable character references are supplied for a 3x3 storyboard, include at least 2 referenced-person frames: one clear visible-face frame with the product visible and one clear visible-face product interaction frame. Use front-facing or three-quarter angles by default. Back-of-head, over-shoulder, tiny, hidden, cropped, masked, shadowed, or blurred faces do not satisfy identity frames.

If identity cannot be preserved confidently, use product-only, hands-only, partial-body, over-shoulder without visible face, or detail frames instead of inventing a new person.

## Fatal QA Gates

Before finalizing, silently rewrite any prompt that violates these gates:
- Reject any prompt that turns the product into a nicer generic catalog item instead of the exact referenced item.
- Reject product category drift, changed proportions, changed material class, changed texture, changed print or pattern scale, invented labels, missing small parts, or mismatched colorway.
- Reject environment-reference contamination: background objects, old uploads, or prior generations must not replace the current product reference.
- Reject hidden-product frames unless the user explicitly asks for mood-only scenes; product storyboards must keep the product inspectable.
- When multiple references conflict, select one hero SKU or clearly describe a product family without blending variants into one impossible hybrid.

The final prompt must make the image model preserve the real referenced gaming product or accessory: exact shape, proportions, material, texture, markings, and scale from the image, not a generic category archetype.