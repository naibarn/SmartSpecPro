---
name: mother-baby-reference-storyboard
description: Mother And Baby Product Reference Storyboard prompt skill adapted from the furniture reference storyboard pattern. Optimized for baby bottles, pacifiers, strollers, carriers, baby seats, diapers, wipes, baby clothing, maternity items, nursing pillows, baby toys, bath items, feeding sets, and child-care accessories, strict reference-image fidelity, exact product shape and proportion preservation, material and texture accuracy, marking/label preservation, product-source dominance, clean no-text-by-default image generation, infographic text controls, equal-frame storyboard layout, anti-generic-substitution guards, and category-specific QA gates. Use when generating image or storyboard prompts for สินค้าแม่และเด็ก (baby bottles, pacifiers, strollers, carriers, baby seats, diapers, wipes, baby clothing, maternity items, nursing pillows, baby toys, bath items, feeding sets, and child-care accessories).
category: image_prompt_generation
version: 1.0.0
icon: baby
tags:
  - shared-skill
  - imported
  - reference-storyboard
  - production-reference-storyboard
  - product-fidelity
  - mother-baby
  - baby-products
  - safety-fidelity
auto_trigger: false
triggerPatterns:
  - Mother And Baby Product Reference Storyboard
  - mother-baby-reference-storyboard
  - สินค้าแม่และเด็ก
trigger_patterns:
  - Mother And Baby Product Reference Storyboard
  - mother-baby-reference-storyboard
  - สินค้าแม่และเด็ก
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
      enabled: false
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
# Mother And Baby Product Reference Storyboard

## Purpose

This skill writes high-fidelity image and storyboard prompts for สินค้าแม่และเด็ก (baby bottles, pacifiers, strollers, carriers, baby seats, diapers, wipes, baby clothing, maternity items, nursing pillows, baby toys, bath items, feeding sets, and child-care accessories). It is adapted from the furniture reference storyboard skill's product-source-dominance, equal-frame storyboard, no-text-by-default, and QA-loop conventions, but all product fidelity rules are rewritten for this category.

The current product reference images are the highest-priority source of truth. Creative styling may change the environment, camera, lighting, props, and mood, but it MUST NOT redesign, resize, recolor, relabel, simplify, beautify, or replace the referenced mother and baby product.

## Optional Storyboard Guide Contract

Input `storyboard_guide` is optional. When it is blank, keep normal skill behavior. When provided, it is the visual storyboard contract for shot order, timing, story beat, product-use action, camera intent, layout/frame allocation, and continuity. Do not replace the guide with a new story, skip required beats, or introduce conflicting actions, claims, product variants, or visual outcomes.

Input `voiceover_script` is optional. When provided, it is the spoken dialogue/narration contract for the storyboard. Match each spoken line to the corresponding Storyboard Guide beat, timing, and shot order. Use the spoken script to decide what the frame must communicate emotionally and narratively, but do not render subtitles, captions, or dialogue text in the image unless the text/infographic controls explicitly allow added visible text.

Use `storyboard_guide` + `voiceover_script` as the primary source for storyboard content. These fields are expected to already contain separated shots/beats, so do not invent a different shot list or unrelated visual story. Expand or condense only to fit `storyboard_layout_preset`, `aspect_ratio`, and `required_frame_count` while preserving the same story sequence and spoken meaning.

## Shot-By-Shot Frame Mapping Rule

When `storyboard_guide` or `voiceover_script` contains numbered or timed shots, first build an internal shot-by-shot storyboard map before writing the final prompt. Parse shot markers even when whitespace is collapsed, including `1.`, `2.`, `0-6.7s`, `ภาพ:`, `มุมกล้อง:`, `บทพูด:`, and `VOICEOVER SCRIPT BY SHOT:`.

For `canvas_9_16_grid_3x3_frame_9_16_exact` or any 9-frame storyboard request, write exactly `Frame 1` through `Frame 9` in the same order as the Storyboard Guide and Voiceover Script. Each frame description must include the source shot timing/title when available, the visual beat/action, the spoken meaning from the matched voiceover line, the camera/lens/lighting direction, the product role, the character-face requirement when a person appears, and environment continuity.

If Storyboard Guide and Voiceover Script differ, Storyboard Guide controls visual action, camera, timing, and frame order; Voiceover Script controls the emotional/narrative meaning; Product Concept Details and current reference images control product truth, claims, scale, character identity, and environment fidelity. Do not use category default frame maps when `storyboard_guide` or `voiceover_script` supplies explicit numbered/timed shots. Category default maps are fallback only for blank or underspecified storyboard inputs.

Do not output one generic `SCENE DESCRIPTION:` summary for explicit storyboard runs. Output a shot-by-shot storyboard prompt with frame-level mapping so the generated image cannot talk about one beat while showing another. Generic beauty shots, duplicated lifestyle panels, or frames that do not visibly match their mapped guide/script beat are fatal and must be rewritten before returning.

Input `production_concept_details` is optional. Use it as the product concept and claim-safety guideline for audience, problem, hook, emotional tone, selling points, product facts, real-use context, and storyboard intent. It must control product truth and commercial context, but it must not override current product, character, label, scale, material, or environment reference locks. Never add prices, discounts, ratings, sold counts, sales volume, certifications, badges, or volatile marketplace claims unless the user supplied exact text.

## Cinematic Realism And Shot Alignment Rule

Every generated prompt must include a `CINEMATIC REALISM LOCK` that pushes the image toward high-quality cinematic photorealism: real product-ad film lighting, natural perspective, believable lens compression, realistic depth of field, grounded shadows, material-accurate reflections, dimensional foreground/midground/background separation, and clean high-resolution detail. Avoid flat catalog lighting, plastic skin, waxy faces, over-smoothed CGI, toy-like people, random glamour lighting, and generic stock-photo staging unless the Storyboard Guide explicitly asks for that style.

For every storyboard frame, derive the camera angle, lens feel, subject distance, depth, movement cue, lighting mood, and environment staging from `storyboard_guide` + `voiceover_script`. The visuals must communicate the same beat and spoken meaning as the script; do not create unrelated beauty shots, random lifestyle scenes, or product poses that contradict the guide. If the guide or voiceover says close-up, demonstration, reaction, problem moment, proof detail, comparison, hand interaction, or final result, the frame must visibly show that exact intent.

## Cinematic Shot Plan And Color Continuity Rule

Every explicit storyboard prompt must include a dedicated `CINEMATIC REALISM LOCK` block before the shot-by-shot frames. Do not rely on the word "cinematic" alone. The block must state the intended product-film look: lens language, camera height/movement, motivated light sources, depth separation, exposure/contrast, color grade, grounded shadows, and material-real rendering.

Every frame description must include a compact camera/light/color note matched to its Storyboard Guide and Voiceover beat: lens or subject distance, camera angle or movement cue, key/practical/back light, foreground-midground-background depth, color temperature, and palette continuity. If a guide asks for close-up, handheld, POV, top-down, wide, scale-check, proof detail, or hero shot, the generated frame must use that exact camera intent rather than a generic room photo.

Reject flat catalog lighting, real-estate listing composition, generic bright bedroom snapshots, one-distance camera repetition, overexposed white rooms, muddy low-contrast output, random glamour lighting, and product shots that ignore the beat's camera direction. The nine panels should feel like frames from one commercial film reel with purposeful shot variety and consistent color science.

Every generated prompt with a referenced person must include a `CHARACTER FACE AND IDENTITY LOCK`: keep the same face likeness, facial proportions, skin tone, age range, hairline, hairstyle, distinctive marks, expression language, body scale, and wardrobe continuity across shots. When a face is part of the shot, it should be clearly visible, naturally lit, sharp enough to recognize, and human-realistic with skin pores and natural asymmetry. Reject identity swaps, distorted faces, beautified new faces, mannequin faces, waxy/plastic/CG-looking skin, blurred faces, tiny faces, cropped-off faces, masked faces, back-of-head substitutions, or a different person between frames. If the character identity cannot be preserved confidently, choose hands-only or product-only composition instead of inventing a new person.

## Video Character Continuity Rule

For storyboard prompts that may become video shots, treat visible human identity as a continuity-critical asset. Any frame that shows a recognizable head, face, hair, shoulders, or body identity should use a clear front-facing or three-quarter face by default, with the referenced product visible when the beat involves product use.

Avoid back-of-head, over-shoulder with visible hair/head but no face, rear-only, side-only, hidden-face, or tiny-face product-use frames because video generation can reinterpret them as a different person. If the beat needs POV, top-down, or close hand action, make the frame hands-only or partial-body-without-head/face/hair and do not describe it as a visible character identity frame. A product interaction frame that is meant to preserve identity must show the same referenced face clearly.

Every generated prompt must strengthen the product lock: `reference_product_images` are immutable physical evidence, not inspiration. Never add, remove, stretch, reshape, recolor, re-texture, relabel, simplify, upscale, downscale, beautify, or redesign product parts, proportions, materials, surfaces, markings, labels, ports, seams, caps, lids, straps, handles, packaging, or physical structure. The product may be placed, held, used, opened, worn, or lit differently only when the exact referenced geometry, material class, texture, colorway, scale, and visible markings remain intact.

## Product Fidelity Matrix And Per-Frame QA Rule

Before writing frame prompts, extract a canonical product fidelity matrix from current `reference_product_images` plus supplied Product Concept Details/product facts. Lock the exact product category/subtype, countable parts, silhouette and bounding-box ratio, material class, texture, colorway, finish, support/base/leg/post structure, visible markings/labels, scale class, and common wrong substitutions.

Repeat the relevant product facts inside every product-visible frame, not only in a global product block. For example, if the reference product is a 3-tier open bedside shelf with four vertical posts, every visible product frame must preserve three shelf levels, open sides, four posts, light wood material/finish, compact table-height scale, and no drawers/doors/closed cabinet conversion. Adapt the example to the actual current product category and references.

For products whose identity depends on countable parts, every product-visible frame must state how those parts remain verifiable. Intro, result, scale-check, overview, and hero frames must show the full silhouette with all countable parts visible enough to count. Detail close-ups may crop tighter, but they must still show enough adjacent geometry to prove the product has not changed and must not imply missing tiers, shelves, legs, drawers, handles, ports, lids, labels, straps, seams, supports, or other critical parts.

## Cross-Frame Same Product Instance Rule

Every product-visible frame must show the same canonical product instance or same explicitly requested product-family variant established in `PRODUCT REFERENCE LOCK`. Lifestyle, result, confirmation, overview, scale-check, and CTA frames are not allowed to swap in a similar background object from the environment, a different furniture piece, a different packaging shape, a different device, or a more convenient prop product.

If a frame says the character looks at, reaches for, sits beside, demonstrates, confirms, or benefits from the product, the locked referenced product must be visible and readable in that frame with the same geometry, countable parts, material, colorway, scale, and placement continuity as earlier product frames. A frame where the person is correct but the product changes is still a fatal failure.

For confirmation/overall frames after the product has solved the problem, prefer a wider three-quarter composition that shows both the referenced person's clear face and the exact referenced product in the same shot. If both cannot fit safely, choose product-only or hands-only composition rather than showing the person beside a wrong or generic substitute product.

If the explicit Storyboard Guide begins with problem/setup frames before the product appears, product-absent frames are allowed only for those mapped beats. From the product-introduction beat onward, every frame that should show the product must keep it inspectable enough to verify the locked geometry, material, countable parts, and scale. Close-ups may crop tighter but must not hide or change defining parts such as shelf/tier count, handles, ports, lids, labels, legs, posts, seams, or support structure.

A frame is invalid if it turns the referenced product into a nicer generic category archetype, changes the number of tiers/shelves/drawers/doors/ports/parts, adds or removes physical components, changes material/finish/colorway, changes scale class, copies a background object from an environment reference, or lets props/hands/crops conceal the features needed to prove product fidelity.

## Sellable Product Exclusivity And Background Furniture Rule

There must be only one sellable hero product or explicitly requested product family in the storyboard. Environment references may supply the room mood, architecture, wall/floor material, bed, window, and lighting, but they must not contribute a second competing product, alternate nightstand, cabinet, shelf, cart, table, package, bottle, device, bag, book, shoe, watch, or other sellable item that could be mistaken for the current product.

If the product itself is a bedside table, shelf, cabinet, organizer, cart, rack, bag, bottle, device, or other recognizable object, remove, avoid, crop out, or strongly de-emphasize any similar background object from product-story frames. Do not let a pre-existing environment object replace the referenced product in overview, result, lifestyle, confirmation, or CTA frames. A second similar object that attracts attention or holds the storyboard props is a fatal product-contamination failure.

## Media Studio Output Contract

When executed from Media Studio Auto Prompt, return plain prompt text only. Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or other wrapper keys.

Allowed shape:

OUTPUT FORMAT LOCK:
...

TEXT RENDERING POLICY:
...

CINEMATIC REALISM LOCK:
...

CHARACTER FACE AND IDENTITY LOCK:
...

PRODUCT REFERENCE LOCK:
...

PRODUCT PHYSICAL PROPORTION LOCK:
...

PRODUCT SCALE LOCK:
...

SHOT-BY-SHOT STORYBOARD PROMPT / STORYBOARD PROMPT:
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

Every output must include a `CINEMATIC REALISM LOCK`, a `CHARACTER FACE AND IDENTITY LOCK` when people appear, plus category-specific `PRODUCT REFERENCE LOCK`, `PRODUCT PHYSICAL PROPORTION LOCK`, and `PRODUCT SCALE LOCK`. The lock must state observable facts, not vague phrases like "match the reference."

Lock these facts from the current product reference:
- Exact product category and subtype from current reference images.
- Overall silhouette, height-width-depth or length-width-thickness relationship, and visual bounding box.
- Countable parts, visible components, openings, seams, hinges, fasteners, controls, labels, ports, tags, or closures.
- Primary and secondary colors, finish, reflectivity, transparency, texture scale, pattern direction, and material identity.
- Physical scale class and how the product sits, folds, hangs, stands, is held, worn, opened, plugged in, poured, served, or used.
- All physical marks that belong to the product: brand marks, printed text, engraved text, stitched tags, labels, stickers, packaging facts, serial-like markings, and decorative pattern text when present.

For สินค้าแม่และเด็ก, the prompt must additionally preserve:
- feeding: bottle, nipple, cap, straw cup, bowl, spoon, sterilizer accessory, formula container
- travel and seating: stroller, carrier, car seat accessory, high chair item, harness, wheels, canopy
- care and hygiene: diaper, wipes pack, changing mat, bath tub, towel, thermometer, nasal aspirator
- soft goods: baby clothes, swaddle, blanket, pillow, bib, socks, maternity/nursing product
- safety details: rounded edges, straps, buckles, padding, non-slip bases, ventilation, soft seams

## Category-Specific Physical Fidelity Rules

### Structure And Proportion

Preserve baby-product safety shape, rounded edges, straps, buckle count, wheel/canopy layout, bottle nipple/cap geometry, diaper thickness, fabric folds, toy parts, and soft padding proportions.

### Material And Texture

Preserve silicone softness, BPA-free plastic look, cotton/muslin weave, plush pile, waterproof mat finish, foam padding, rubber grip, transparent bottle body, and printed fabric scale.

### Marking, Label, And Physical Text Preservation

Preserve bottle measurement marks, size labels, care tags, safety icons, pack text, and printed character patterns when visible; never invent medical/safety certifications or age claims.

### Scale And Context

Show realistic parent hand, baby-safe surface, nursery, stroller, diaper bag, feeding chair, or crib-adjacent scale. Keep infants safe and never depict unsafe use.

### Product Interaction And Use

Use safe scenes such as assembling, holding, feeding setup, stroller fold/unfold, strap detail, pack opening, nursery placement, washing/cleaning, or parent-assisted use.

### Common Wrong Substitutions To Reject

The prompt must explicitly reject:
- unsafe baby use
- changing buckle/strap layout
- inventing certifications
- turning soft baby goods into adult items
- changing bottle nipple shape
- adding small choking-hazard parts

## Multi-Frame Storyboard Visual Rule

When `generation_mode` is `multi_frame_storyboard`, create one clean generated image containing the requested grid. Use `storyboard_layout_preset` as the canvas contract. State the exact grid, total frame count, final canvas aspect ratio, and whether frames are exact-ratio or crop-safe.

For short 2-4 panel product storyboards, every panel must show the referenced product unless the user explicitly requests mood-only frames. For 3x3 storyboards, at least 7 of 9 panels should clearly show the same product, and all product-visible frames must preserve the same category, material, proportions, markings, and scale.

Fallback 3x3 customer-journey map for this category (use only when `storyboard_guide` and `voiceover_script` do not provide explicit numbered/timed shots):
Frame 1: product hero.
Frame 2: parent-hand scale.
Frame 3: safety/detail close-up.
Frame 4: material softness frame.
Frame 5: safe use setup.
Frame 6: packing/storage frame.
Frame 7: cleaning/care frame.
Frame 8: label/measurement detail.
Frame 9: final nursery lifestyle scene.

The rendered storyboard image must not contain visible frame numbers, captions, labels, text boxes, lower-thirds, subtitles, arrows with text, UI chrome, or layout typography unless `image_text_mode` is `with_text` OR `cinematic_style` is `info_graphics_realistic` or `info_graphics`.

## Default No-Extra-Text Rendering Rule

Input `image_text_mode` controls added visible text in the generated image. Infographic cinematic styles have higher priority than the no-text default.

- If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, treat it as an explicit visible-text request even when `image_text_mode` is missing or `no_text`. Do NOT include a no-added-visible-text negative prompt. Every generated prompt must include a `TEXT RENDERING POLICY` requiring a readable infographic layout with concise, large, intentional text.
- For `info_graphics_realistic`, write the image prompt in this direction: "Create an info graphics realistic image using the attached product/reference image as the main visual, with large readable text, not too many words, only the key points about [topic/key product benefit]." Keep the product photo-realistic and preserve the reference product's exact shape, proportions, material, texture, markings, and scale.
- For `info_graphics`, write the image prompt in this direction: "Create a clean info graphics image using the attached product/reference image as the main visual, with large readable text, not too many words, only the key points about [topic/key product benefit]." Use clean graphic shapes, icons, callout panels, and hierarchy while preserving the reference product.
- Infographic text language follows `image_text_language`: `en` for English, `th` for Thai, and `other` for `image_text_custom_language`. If no language is specified, use English. If Thai is selected, use large concise Thai headline/callout text.
- Infer `[topic/key product benefit]` only from user-supplied `storyboard_guide`, `voiceover_script`, `production_concept_details`, `product_title`, `product_label_text`, visible product facts, or safe category/use-case facts. Use one large headline plus 2-4 short key points; avoid paragraphs and dense copy.
- If `cinematic_style` is not an infographic style and `image_text_mode` is missing or `no_text`, every generated prompt must explicitly include a `TEXT RENDERING POLICY` saying the image contains no added visible text of any kind.

## Prop Text Suppression Rule

When `image_text_mode` is missing or `no_text` and the style is not infographic, suppress readable text on all non-product props and background objects. Use blank mugs, blank/spineless books, unreadable phone screens, no visible logos, no wall-art words, no signage, no UI, no prop labels, and no readable numbers unless they are exact physical markings on the referenced product that the user wants preserved. If an alarm clock, book, package, screen, or mug is needed as a prop, compose it so any numerals, title, logo, or lettering is absent, turned away, blurred, or too small to read. Product labels/marks are the only text that may be preserved in no-text mode.
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

The final prompt must make the image model preserve the real referenced mother and baby product: exact shape, proportions, material, texture, markings, and scale from the image, not a generic category archetype. It must also render the storyboard as cinematic, dimensional, photorealistic product-film imagery with clear, consistent human faces when character references are used.