---
name: product-reference-storyboard
description: Unified product reference storyboard prompt skill for Media Studio Production. Uses Storyboard Guide + Voiceover Script as the shot contract, locks product truth from Product Detail and reference images, injects one product-category rule file via product_category, and produces cinematic photorealistic 3x3 storyboard prompts with strong face, product, lighting, camera, and continuity controls.
category: image_prompt_generation
version: 1.0.0
icon: panels-top-left
tags:
  - shared-skill
  - imported
  - product-fidelity
  - production-reference-storyboard
  - unified-product-storyboard
auto_trigger: false
triggerPatterns:
  - product reference storyboard
  - Product Reference Storyboard
trigger_patterns:
  - product reference storyboard
  - Product Reference Storyboard
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
      min_prompt_score_to_pass: 88
      min_image_fidelity_score_to_pass: 84
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Prompt Logic

## Primary Contract

This skill replaces the previous 20 category-specific `*-reference-storyboard` skills. Keep the shared storyboard logic here, and use `product_category` to select exactly one product-category rule file.

Use `storyboard_guide` + `voiceover_script` as the primary source for storyboard content. These inputs are expected to already contain separated shots/beats, so do not invent a different shot list or unrelated visual story. Expand or condense only to fit `storyboard_layout_preset`, `aspect_ratio`, and `required_frame_count` while preserving the same order, visual intent, and spoken meaning.

Use `production_concept_details` as Product Detail / Product Facts. It controls product truth, real-use context, claim safety, model/variant facts, dimensions, material, parts, and commercial context. It must not override current product, character, label, scale, material, or environment reference locks. Never add prices, discounts, ratings, sold counts, certifications, badges, or volatile marketplace claims unless exact supplied text says so.

Current-run reference images beat every default. `reference_product_images` are immutable physical evidence. `reference_character_images` are identity anchors. `reference_environment_images` define atmosphere, light, floor/wall/layout, and room context only; they are not product evidence and must not introduce a competing sellable product.

## Compact Prompt Budget

Aim to keep the final plain-text prompt under 4300 characters so downstream image models stay comfortably below a 4500-character prompt limit. This is a soft budget, not an input field or schema parameter. Shorten by using one shared `CAMERA/LIGHT/DEPTH` block and one shared `PRODUCT VERIFY` block instead of repeating them in every frame. Completeness is mandatory and has higher priority than brevity: always return `Frame 1` through `Frame 9` with non-empty visual-only frame prose before ending. Never satisfy the budget by summarizing, returning only one shot, returning only the final shot, copying a source storyboard bullet, or omitting required global locks. If the budget is tight, shorten global locks to one compact line each and shorten each frame to one compact visual sentence; never stop mid-frame or return a bare label.

## Product Category Rule Selection

Input `product_category` selects the category-specific fidelity file under `references/product-categories/`. The execution layer may append the selected file to the system prompt. When `product_category` is `auto`, infer the category from Product Detail, product title, marketplace category text, and current product images; if uncertain, use the generic product lock and avoid category-specific assumptions.

Apply category rules after shared locks and before writing frame prompts. Category defaults are fallback constraints only: they must never override the current product reference image, Product Detail, exact labels, dimensions, material, scale, character identity, or Storyboard Guide/Voiceover Script.

Category index:
- `household_product` -> `references/product-categories/household_product.md`: Lock the exact household item subtype, container/tool shape, lid/handle/nozzle/head/brush/pad count, material, finish, dimensions, and real domestic use context. Reject: Do not turn organizers into cabinets, bottles into generic decor, cleaning tools into different heads, kitchenware into restaurant props, or storage products into larger furniture.
- `computer_laptop` -> `references/product-categories/computer_laptop.md`: Lock exact device class, screen/body ratio, hinge geometry, keyboard layout, ports, bezels, stand/base, cable/dock form, colorway, and surface finish. Reject: Do not swap laptop/desktop/monitor/accessory types, change screen size, add impossible ports, redesign keyboard layout, invent UI text, or replace the referenced device with a cleaner generic model.
- `electrical_appliance` -> `references/product-categories/electrical_appliance.md`: Lock exact appliance type, body volume, door/lid/basket/blade/vent/panel placement, handle shape, controls, cord/plug visibility, material, and scale class. Reject: Do not change appliance class, capacity impression, door direction, control layout, vents, basket/lid geometry, or convert the item into a premium-looking different model.
- `food_beverage` -> `references/product-categories/food_beverage.md`: Lock package type, pack count, flavor/colorway, cap/seal/sachet/can/bottle/carton geometry, label layout, serving form, visible food texture, and portion scale. Reject: Do not invent flavors, claims, nutrition badges, certifications, price promos, extra packs, different packaging shapes, or restaurant dishes unrelated to the product.
- `electronics` -> `references/product-categories/electronics.md`: Lock exact gadget subtype, button/port/grille/case/cable/adapter shape, LED/window placement, logo/marking layout, finish, scale, and accessory count. Reject: Do not swap earbuds/headphones/speaker/router/remote/cable types, add ports, change connector shape, invent screen UI, or replace the item with a similar generic gadget.
- `fashion_clothing` -> `references/product-categories/fashion_clothing.md`: Lock garment type, cut, neckline, sleeve/hem length, closure, seams, fabric texture, print/pattern placement, colorway, drape, and fit class. Reject: Do not change dress/shirt/pants/jacket type, alter pattern scale, add logos, switch fabric, over-style into a different outfit, or hide the garment in tiny lifestyle framing.
- `shoes` -> `references/product-categories/shoes.md`: Lock exact footwear type, pair count, sole thickness/tread, toe shape, heel height, lace/strap/buckle layout, upper material, color blocking, and logo/marking placement. Reject: Do not convert sneakers to running shoes, sandals to slippers, change sole geometry, add/remove laces or straps, or show only one shoe unless the product is one-piece.
- `watch_eyewear` -> `references/product-categories/watch_eyewear.md`: Lock watch/eyewear subtype, case/frame silhouette, dial/lens shape, crown/bridge/temple/strap details, material, colorway, and scale on wrist/face/table. Reject: Do not change analog/smart watch class, lens tint, frame shape, strap design, dial markings, or add luxury branding and readable text that was not supplied.
- `mobile_tablet` -> `references/product-categories/mobile_tablet.md`: Lock phone/tablet/accessory subtype, camera island, bezel ratio, case cutouts, button/port placement, screen size impression, colorway, and accessory geometry. Reject: Do not change brand-like camera layout, add extra lenses, switch phone/tablet class, invent UI screens, reshape case holes, or replace with a generic premium device.
- `jewelry` -> `references/product-categories/jewelry.md`: Lock jewelry type, set count, stone/bead/chain/link shape, clasp, setting, metal color, finish, charm/pendant geometry, and scale on body or display. Reject: Do not add stones, alter metal tone, change ring/necklace/bracelet class, invent luxury marks, simplify delicate details, or enlarge tiny jewelry unrealistically.
- `mother_baby` -> `references/product-categories/mother_baby.md`: Lock exact baby product class, safety-visible parts, straps/rails/wheels/bottle nipple/lid count, soft material, colorway, size class, and age/use context. Reject: Do not add unsupported safety claims, unsafe use, wrong age impression, extra restraints, missing straps, different stroller/chair/bottle structure, or unrealistic baby handling.
- `pet_supplies` -> `references/product-categories/pet_supplies.md`: Lock exact pet product subtype, package/container/toy/bed/collar/leash/litter geometry, clip/buckle/strap shape, material, colorway, and pet-size fit. Reject: Do not change species use, invent veterinary claims, add different toys/foods, alter leash/collar hardware, or use animals in ways that hide product identity.
- `sports_equipment` -> `references/product-categories/sports_equipment.md`: Lock exact equipment subtype, pair/set count, grip/strap/padding/weight plate/ball/racket shape, material, colorway, markings, and size in use. Reject: Do not change sport category, weight impression, grip layout, protective coverage, set count, or create unsafe exercise form or unsupported performance claims.
- `camera_photography` -> `references/product-categories/camera_photography.md`: Lock exact camera/accessory subtype, lens/barrel/mount/tripod/gimbal/head/button/screen geometry, strap, finish, port, marking layout, and rig scale. Reject: Do not switch camera type, add lenses/screens/buttons, change tripod/gimbal joints, invent display UI, or replace the referenced item with a professional-looking different rig.
- `gaming_accessories` -> `references/product-categories/gaming_accessories.md`: Lock exact gaming product subtype, controller/button/stick/trigger/headset/cable/dock shape, RGB zones, finish, colorway, logo/marking position, and console fit. Reject: Do not add extra buttons, switch console ecosystem, change headset/controller class, invent screen UI/game art, or overdo RGB beyond the reference.
- `automotive` -> `references/product-categories/automotive.md`: Lock exact automotive product subtype, mount/strap/clip/lens/helmet/tire/bottle/package geometry, material, finish, scale, and vehicle placement. Reject: Do not change vehicle compatibility, add unsafe installation, alter helmet/lens/mount shape, invent certifications, or show unsupported road-safety claims.
- `stationery` -> `references/product-categories/stationery.md`: Lock exact stationery subtype, set count, pen tip/cap/clip, notebook binding, paper size, folder/ring/organizer layout, colorway, packaging, and label placement. Reject: Do not change pen/notebook/folder class, invent written content, add random logos, alter set count, or turn stationery into generic desk decor.
- `books` -> `references/product-categories/books.md`: Lock exact book type, cover color/layout, spine thickness, volume/box-set count, binding, page block, size, edition impression, and supplied title/cover marks. Reject: Do not invent titles, author names, readable cover text, extra volumes, different genre artwork, or replace the book with a generic notebook.
- `furniture` -> `references/product-categories/furniture.md`: Lock exact furniture subtype, dimensions/scale class, tier/shelf/drawer/door/cushion/leg/post count, joinery, hardware, material, finish, colorway, and room footprint. Reject: Do not convert open shelves into cabinets, add drawers/doors, change tier count, resize compact furniture, swap material, copy similar background furniture, or simplify construction.
- `cosmetics` -> `references/product-categories/cosmetics.md`: Lock exact beauty product subtype, bottle/tube/jar/palette/compact/lipstick geometry, cap/pump/dropper/applicator, package count, colorway, label layout, and texture/swatches. Reject: Do not invent claims, SPF/medical results, shade names, certifications, new packaging, extra products, altered label design, or unrealistic skin-perfecting before/after proof.

## Shot-By-Shot Frame Mapping Rule

When `storyboard_guide` or `voiceover_script` contains numbered or timed shots, first build an internal shot-by-shot storyboard map before writing the final prompt. Parse shot markers even when whitespace is collapsed, including `1.`, `2.`, `0-6.7s`, `ภาพ:`, `มุมกล้อง:`, `บทพูด:`, and `VOICEOVER SCRIPT BY SHOT:`.

For `canvas_9_16_grid_3x3_frame_9_16_exact` or any 9-frame storyboard request, write exactly `Frame 1` through `Frame 9` in the same order as the Storyboard Guide and Voiceover Script. Each frame description must include the source shot timing/title when available, visual beat/action, spoken meaning from the matched voiceover line, product role/use cue, character-face requirement when a person appears, and environment continuity. Keep frame lines compact because shared camera/lighting/depth and product verification details live in their own global blocks. Draft all 9 frame lines before expanding any lock text.

Use compact visual-only frame prose so image generators do not render prompt labels as captions. Every frame must begin with `Frame N:` and then describe only what should be seen in that panel, including the matched story meaning as visual action or emotion. Do not write `VISUAL:`, `STORY MATCH:`, `HUMAN REALISM:`, quoted voiceover lines, timecodes, subtitles, captions, or any other label inside the frame text. Use one shared `CAMERA/LIGHT/DEPTH:` block before the frames for the whole storyboard, and one shared `PRODUCT VERIFY:` block before or after the frames for canonical product facts. Do not repeat `CAMERA/LIGHT/DEPTH:` or `PRODUCT VERIFY:` in every frame unless a single frame truly needs an exception. Human realism requirements must be described in natural visual prose, not as a visible label.

If Storyboard Guide and Voiceover Script differ, Storyboard Guide controls visual action, camera, timing, and frame order; Voiceover Script controls emotional/narrative meaning; Product Detail and current reference images control product truth, claims, scale, character identity, and environment fidelity.

Do not output one generic `SCENE DESCRIPTION:` summary for explicit storyboard runs. Output `SHOT-BY-SHOT STORYBOARD PROMPT` with frame-level mapping so the generated image cannot talk about one beat while showing another. Generic beauty shots, duplicated lifestyle panels, or frames that do not visibly match their mapped guide/script beat are fatal and must be rewritten before returning.

## Cinematic Realism Lock

Every generated prompt must include a `CINEMATIC REALISM LOCK` block before the frames. State the intended product-film look: realistic lens language, camera height/movement, motivated light sources, foreground/midground/background depth separation, exposure/contrast, color grade, grounded shadows, natural material reflections, and high-resolution detail.

For every storyboard frame, derive camera angle, lens feel, subject distance, depth, movement cue, lighting mood, and environment staging from `storyboard_guide` + `voiceover_script`. If the guide asks for close-up, handheld, POV, top-down, wide, scale-check, proof detail, comparison, or hero shot, use that exact camera intent instead of a generic room/product photo.

Include one global `CAMERA/LIGHT/DEPTH:` block before `SHOT-BY-SHOT STORYBOARD PROMPT`. Keep it to one compact line that specifies subject distance or lens feel, camera height/angle/movement, motivated light source direction, exposure/contrast, depth separation, shadow behavior, color temperature/grade, and material-real highlights for the whole grid. Vary shot distance intentionally in the frame visuals while keeping one consistent film color science; do not repeat this full block inside each frame.

Reject flat catalog lighting, real-estate listing composition, generic bright-bedroom snapshots, one-distance camera repetition, overexposed white rooms, muddy low-contrast output, random glamour lighting, toy-like people, waxy/plastic/CG-looking skin, and product shots that ignore the beat's camera direction. The panels should feel like frames from one commercial film reel with purposeful shot variety and consistent color science.

## Character Face And Video Continuity Lock

Every generated prompt with a referenced person must include a `CHARACTER FACE AND 95 PERCENT IDENTITY LOCK`: keep the same face likeness, facial proportions, skin tone, age range, hairline, hairstyle, distinctive marks, expression language, body scale, and wardrobe continuity across shots without implying a 100 percent face clone. Wardrobe should come from the current character reference images or explicit user/product brief only. Do not invent a new sweater, blazer, dress, accessories, hairstyle, makeup style, or color palette to fit the room mood; if home styling is needed, preserve the same referenced wardrobe pieces or only describe neutral continuity without changing visible clothing. When a face is part of the shot, it must be clearly visible, naturally lit, sharp enough to recognize, and human-realistic with skin pores and natural asymmetry.

When `reference_character_images` are supplied by Marketplace Auto Review's Character / Presenter upload, treat the first character reference (`@Image2` when a product reference is also attached) as the uploaded presenter/reviewer identity anchor by default. Do not reinterpret that uploaded presenter as a child, toddler, kid, baby, product user, or age-converted variant just because the product is for children. Never write `child from @Image2`, `toddler from @Image2`, `kid from @Image2`, or similar wording unless the user explicitly supplied a child character reference. For child-focused products, show the product, hands-only interaction, or non-identifying child details only if necessary; do not bind the uploaded presenter reference to a child.

For storyboard prompts that may become video shots, treat visible human identity as a continuity-critical asset. Any frame that shows a recognizable head, face, hair, shoulders, or body identity should use a clear front-facing or three-quarter face by default, with the referenced product visible when the beat involves product use.

Avoid back-of-head, over-shoulder with visible hair/head but no face, rear-only, side-only, hidden-face, tiny-face, cropped-off-face, masked-face, or blurred-face product-use frames because video generation can reinterpret them as a different person. If the beat needs POV, top-down, or close hand action, make the frame hands-only or partial-body-without-head/face/hair and do not describe it as a visible character identity frame. A product interaction frame that is meant to preserve identity must show the same referenced face clearly.

## Rear/Back View Video Safety Rule

Any frame that shows the back of a head, hair, shoulders, or a recognizable body identity without a clear face is invalid by default for video-bound storyboards. Do not use back-facing, rear-only, over-shoulder-with-hair, side/rear profile, or face-hidden compositions merely for mood or convenience.

The only exception is when the Storyboard Guide explicitly requires a rear-only shot and the generated frame includes a natural-language rear-only motion lock: rear-only shot, the person must not turn around, must not reveal a face, must not look back to camera, and must remain non-identifying through the entire video shot. In that exception, describe a rear-only non-identifying body with no face reveal and no visible face identity to preserve, without using `HUMAN REALISM:` as a label.

If a video shot may include any turn, look-back, reveal, reaction, speaking, smiling, or face-visible continuation, the still frame must begin with a clear front-facing or three-quarter referenced face. If the beat is POV/top-down/hand action, crop to hands and product only with no visible head, hair, face, shoulders, or body identity. A visible back-of-head frame that could later turn to camera is a fatal identity-continuity failure.

For face-visible frames, the natural frame prose must state front-facing or three-quarter face visibility, same referenced facial structure and hairline, natural skin texture with pores, subtle asymmetry, believable hands/anatomy, no waxy or plastic skin, no beauty-filter smoothing, no mannequin expression, no distorted eyes/teeth/fingers, and natural light on the face. For hands-only frames, say hands-only, no visible head/face/hair identity, natural hand anatomy.

## Product Reference Lock

Every generated prompt must include a `PRODUCT REFERENCE LOCK`: use the first attached product reference image (`@Image1` when image tags are available) as the primary visual source of truth. The written Product Detail / product description is secondary and must never override the attached product image. In the final prompt, explicitly state that the generated sellable product must match `@Image1` / the first attached product reference image exactly for appearance, proportions, construction, material, color, countable parts, and scale. Treat `reference_product_images` as immutable physical evidence, not loose inspiration. Never add, remove, stretch, reshape, recolor, re-texture, relabel, simplify, upscale, downscale, beautify, or redesign product parts, proportions, materials, surfaces, markings, labels, ports, seams, caps, lids, straps, handles, packaging, or physical structure.

Before writing frame prompts, extract a canonical product fidelity matrix from current `reference_product_images` plus Product Detail/Product Facts. Lock the exact product category/subtype, countable parts, silhouette and bounding-box ratio, material class, texture, colorway, finish, support/base/leg/post structure, visible markings/labels, scale class, and common wrong substitutions. Product Detail may name and count parts, but the product reference image controls the real appearance, proportions, construction, and countable visible parts.

Include one concise `PRODUCT VERIFY:` block with the canonical product facts needed to prevent substitution. Start this block by saying the product visual lock comes from `@Image1` / the first attached product reference image and the product must match that reference exactly. Then list the product name/category and countable facts, for example: 3 levels, 4 vertical posts, light wood finish, compact bedside scale, no drawers, no doors. Adapt the facts to the actual current product category and references. Do not repeat this full verification list inside every frame.

Every product-visible frame must show the same canonical product instance or same explicitly requested product-family variant established in `PRODUCT REFERENCE LOCK`. Lifestyle, result, confirmation, overview, scale-check, and CTA frames are not allowed to swap in a similar background object from the environment, a different packaging shape, a different device, a different furniture piece, or a more convenient prop product. A frame where the person is correct but the product changes is still a fatal failure.

If a frame says the character looks at, reaches for, sits beside, demonstrates, confirms, or benefits from the product, the locked referenced product must be visible and readable in that frame with the same geometry, countable parts, material, colorway, scale, and placement continuity as earlier product frames. If both face and exact product cannot fit safely, choose product-only or hands-only composition rather than showing a person beside a wrong or generic substitute product.

## Post-Introduction Product Visibility Rule

From the first product-introduction/solution frame onward, every mapped beat about product solution, proof, real use, result, expectation check, reconfirming value, overview, confirmation, or CTA must visibly include the exact locked product. Do not write person-only, bed-only, room-only, lamp-only, mug-only, book-only, or generic atmosphere frames for these beats.

Frame 8 / reconfirming-value / value-confirmation frames are product-critical: they must show the same canonical product in the same shot as any character, large enough to verify product category, full silhouette, countable parts, material, colorway, and scale. If the product is a 3-tier open bedside shelf, Frame 8 must still show the top surface, middle shelf, bottom shelf, open sides/posts, light wood finish, compact bedside scale, and no drawers or doors.

Result and overview frames may be wider, but the product must remain in the foreground or clear midground, not a tiny background prop. If an environment reference contains a similar nightstand, cabinet, shelf, table, drawer unit, or lamp table, explicitly remove/crop/de-emphasize it so it cannot replace or compete with the locked product.

Use the global `PRODUCT VERIFY:` block to state the exact product facts once. Post-introduction product frames may use short product-use wording, but they must not repeat the full verification list. For a Greenforst 3-tier open bedside shelf, the global block should include: Greenforst 3-tier open bedside shelf; 3 levels; 4 vertical posts; light wood finish; compact bedside scale; no drawers; no doors; no alternate nightstand.

## Sellable Product Exclusivity And Environment Rule

There must be only one sellable hero product or explicitly requested product family in the storyboard. Environment references may supply room mood, architecture, wall/floor material, bed, window, and lighting, but they must not contribute a second competing product, alternate nightstand, cabinet, shelf, cart, table, package, bottle, device, bag, book, shoe, watch, or other sellable item that could be mistaken for the current product.

If the product itself is a bedside table, shelf, cabinet, organizer, cart, rack, bag, bottle, device, or other recognizable object, remove, avoid, crop out, or strongly de-emphasize any similar background object from product-story frames. Do not let a pre-existing environment object replace the referenced product in overview, result, lifestyle, confirmation, or CTA frames.

## Text Rendering Policy

Always include `TEXT RENDERING POLICY`. Default non-infographic mode is no added visible text: no subtitles, captions, frame numbers, UI, labels, signage, wall-art words, readable book spines, mug words, random logos, or screen text. Prompt section names and frame numbers are instructions only and must not appear in the generated image. The final prompt must explicitly forbid visible prompt labels, frame labels, timecodes, spoken-script text, or any other instruction text from being rendered in the image. The returned prompt must explicitly require blank/unreadable book covers and spines, blank mugs/cups, unreadable phone or computer screens, no wall-art words, and no readable prop labels unless they are exact supplied product markings. Physical product markings that are supplied or visible on the product reference may be preserved, but do not invent them.

Infographic cinematic styles have higher priority than the no-text default. If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, do NOT include a no-added-visible-text negative prompt. Instead require large readable text, not too many words, only the key points: one large headline plus 2-4 short key points, using `image_text_language` or `image_text_custom_language`.

## Output Format Lock

Return plain prompt text only. Do not return JSON, YAML, Markdown fences, wrapper fields, implementation notes, or QA analysis.

Use this shape:

OUTPUT FORMAT LOCK:
Plain prompt text only.

VIDEO IDENTITY SAFETY LOCK:
No back-facing or no-face visible-head identity frames unless explicitly rear-only with no turn/no face reveal.

CINEMATIC REALISM LOCK:
...

PRODUCT REFERENCE LOCK:
Use @Image1 / the first attached product reference image as the primary visual source of truth; the written product description is secondary and must never override the attached product image. The generated sellable product must match that actual reference exactly for appearance, proportions, construction, material, color, countable parts, and scale. Other reference images may guide character or environment only, never product shape.

CHARACTER FACE AND 95 PERCENT IDENTITY LOCK:
...

TEXT RENDERING POLICY:
...

CAMERA/LIGHT/DEPTH:
One shared concrete camera, light, depth, color, lens, and material-realism direction for the full grid.

PRODUCT VERIFY:
Product visual lock from @Image1 / first attached product reference image; then one concise canonical product fact list, e.g. product name/category, exact levels/posts/parts/material/color/scale, and no wrong substitutions.

SHOT-BY-SHOT STORYBOARD PROMPT:
9:16 final canvas, 3x3 grid, exactly 9 equal vertical frames storyboard panel, borderless edge-to-edge grid, zero white divider lines, zero black lines, zero gutters, zero margins, zero frame outlines, zero separator lines.
Frame 1: Visual-only description of the first panel and the matched story meaning as visible action, with no rendered text.
Frame 2: Visual-only description of the second panel and the matched story meaning as visible action, with no rendered text.
Frame 3: Visual-only description of the third panel and the matched story meaning as visible action, with natural human-realism wording if a person appears.
Frame 4: Visual-only description of the fourth panel and the matched story meaning as visible action, with no rendered text.
Frame 5: Visual-only description of the fifth panel and the matched story meaning as visible action, with hands-only or natural human-realism wording if relevant.
Frame 6: Visual-only description of the sixth panel and the matched story meaning as visible action, with no rendered text.
Frame 7: Visual-only description of the seventh panel and the matched story meaning as visible action, with natural human-realism wording if a person appears.
Frame 8: Visual-only description of the eighth panel and the matched story meaning as visible action, with natural human-realism wording if a person appears.
Frame 9: Visual-only description of the ninth panel and the matched story meaning as visible action, with no rendered text.

Invalid output examples: a single line such as `*: 33.3-40s. Visual: ...`, one source storyboard bullet, only `Frame 9`, only a final scene summary, any answer with fewer than nine `Frame N:` lines, or frame text containing `STORY MATCH:`, `HUMAN REALISM:`, `VISUAL:`, quoted voiceover, timecodes, subtitles, or captions.
