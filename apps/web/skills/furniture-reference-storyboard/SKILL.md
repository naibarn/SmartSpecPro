---
name: furniture-reference-storyboard
description: Furniture reference storyboard prompt skill adapted from the original reference storyboard bundle. Optimized for furniture product fidelity, exact scale/dimensions, compact and convertible furniture recognition, clean single-frame output control, default no-text rendering, strict storyboard-mode enforcement, strict equal-frame storyboard layout control, borderless storyboard presentation, strict per-panel uniqueness control, customer-journey storyboard planning, anti-redundancy frame design, broad furniture taxonomy coverage, product-source dominance, room-scale visualization, material preservation, construction details, realistic usage scenes, and reference-role disambiguation while keeping existing schemas compatible. Includes exhaustive visual inspection, furniture taxonomy coverage, variant handling, set handling, occlusion control, product-specific QA gates, current-reference contamination rejection, mandatory person-with-product interaction coverage, floor-textile/rug product support, physical-pattern text preservation, reference relevance ranking, dominant product category lock, product-family collection handling, environment compatibility control, cross-turn contamination fail-safes, and irrelevant-frame rejection.
category: image_prompt_generation
version: 1.4.19
icon: sofa
tags:
  - shared-skill
  - imported
  - furniture
  - interior
  - product-fidelity
  - production-reference-storyboard
auto_trigger: false
triggerPatterns:
  - furniture reference storyboard
  - Furniture Reference Storyboard
trigger_patterns:
  - furniture reference storyboard
  - Furniture Reference Storyboard
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
---
# Prompt Logic

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

For start/stop-frame workflows, interpret the guide as one video shot: create a start-frame prompt that matches the beginning of that shot and a stop-frame prompt that matches the end state of that shot. The stop frame should be visually compatible as the next shot's start frame when Media Studio chains shots together.

This skill writes high-fidelity image prompts for furniture, furniture-adjacent products, floor textiles, storage units, hardware, and storyboard/contact-sheet outputs. It must preserve the product from the current reference images instead of turning it into a generic catalog archetype.

Every generated prompt MUST independently repeat:
- Character identity lock when people appear.
- Character reference lock block when recognizable people appear.
- Furniture product geometry lock.
- Furniture product physical aspect-ratio and visual bounding-box lock.
- Furniture material, color, finish, texture, and pattern lock.
- Visible brand/marking/tag preservation lock when present.
- Room, scale, and environment consistency lock.
- Product scale lock in every prompt, using exact numeric dimensions when supplied or inferred scale/proportion from product references when not supplied.
- Compact/portable/convertible furniture scale guard when applicable.
- Single-frame vs storyboard/collage output guard.
- Default no-extra-text rendering guard with infographic cinematic override.
- Explicit storyboard-mode override guard.
- Equal-frame storyboard grid guard.
- Borderless storyboard presentation guard.
- Strict per-panel uniqueness and duplicate-frame rejection guard.
- Customer-journey and anti-redundancy storyboard guard.
- Product-source dominance guard.
- Watermark/marketplace-overlay exclusion guard.
- Furniture taxonomy and subtype-specific fidelity rules.
- Forensic vision inspection and micro-component preservation rules.
- Variant, set, product-family, and multi-product handling rules.
- Reference relevance ranking and irrelevant-reference rejection rules.
- Dominant product category and current-product-majority lock.
- Occlusion and product visibility rules.
- Industrial design and joinery preservation rules.
- Negative constraints.

This prevents image drift across storyboard frames and prevents referenced furniture from becoming a generic catalog item.

Recommended mode: `separate_prompt_per_frame`.

## Media Studio Output Contract

When this skill is executed from Media Studio Auto Prompt, return plain prompt text only.
Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or other wrapper keys.

The final answer must be directly usable in the Media Studio prompt textarea. If the request needs a storyboard, write a human-readable storyboard prompt as normal text with clear scene or panel sections. Do not serialize those sections as JSON.

Allowed shape:

OUTPUT FORMAT LOCK:
...

PRODUCT REFERENCE LOCK:
...

PRODUCT SCALE LOCK:
...

SHOT-BY-SHOT STORYBOARD PROMPT / STORYBOARD PROMPT:
9:16 final canvas, 3x3 grid, 9 total vertical frames.
Frame 1: ...
Frame 2: ...
...
Frame 9: ...

Forbidden shapes:
- `{"output":{"prompt":"..."}}`
- `{"prompt":"..."}`
- JSON arrays of scenes.
- Markdown code fences around the prompt.
- Analysis notes before the prompt.

## Reference Role Disambiguation Rule

The skill MUST separate reference images into clear roles before writing any prompt:
- `reference_product_images` define the product only. Preserve product category, geometry, dimensions, colorway, material, construction, markings, and scale from these images.
- `reference_character_images` define the recurring person only. Preserve identity only when a recognizable person appears.
- `reference_environment_images` define room mood, architecture, lighting, floor/wall material, and layout only. They MUST NOT override product geometry, product color, product dimensions, product material, or character identity.
- Storyboard Guide and `voiceover_script` define shot action, composition, and spoken intent, but they MUST NOT authorize redesigning the product unless the user explicitly requests a new product concept rather than reference fidelity.

When a reference set contains furniture-like objects in the environment image, treat those as background context unless they are also present in product references. Do not accidentally replace the referenced product with an unrelated sofa, table, cabinet, bed, shelf, stool, cart, rug, or decorative furniture from the room image.

When product references show multiple colorways or variants, choose the variant requested by the user. If the user does not specify, infer the dominant/clearest product variant from product references and state it in `PRODUCT REFERENCE LOCK`. Do not blend variants into a new hybrid colorway or mixed construction.

If multiple product references show the same furniture model in different colorways, finishes, or listing angles, treat them as geometry evidence for one shared product design. Lock the shared silhouette, board thickness, shelf count, support count, height-width-depth relationship, and table-height footprint from all product references, then lock exactly one output colorway unless the user explicitly asks for a collection comparison. Never alternate between white and wood variants across frames in a single-SKU storyboard.

## Automatic Colorway Decision And Same-Frame Color Consistency Rule

When product references show the same physical product in multiple colors, the skill MUST decide the colorway without asking the user unless the user explicitly requests a specific color.

Decision rules:
- If the final output is a single-frame image, choose one colorway only: prefer the clearest/dominant product image, then the color most relevant to the requested scene.
- If the final output is a storyboard/grid, different panels may show different reference colorways only when the references clearly show those as valid variants of the same product family.
- Within one panel/frame, every instance of the same SKU/product variant MUST use the same color and finish. Do not mix white and dark blue/black brackets, legs, handles, casters, shelves, mats, cushions, or other product parts inside the same panel unless the reference image itself shows a deliberate two-tone product.
- For paired hardware or multi-pack products, both visible items in the same pair/set frame must share the same selected colorway and finish.
- If a storyboard uses multiple colorways across panels, explicitly state each panel's selected variant and keep that panel internally consistent.

For shelf brackets specifically: a dark glossy bracket panel must show only dark glossy brackets in that panel; a white powder-coated bracket panel must show only white brackets in that panel. Never show a white bracket supporting the same shelf as a dark bracket in the same frame unless the user explicitly asks for mixed-color comparison.

## Current-Input-Only Reference Rule

Use only reference images supplied in the current skill run. Do not borrow products, people, rooms, colors, layouts, or props from earlier uploads, previous test runs, generated outputs, or conversation history unless the user explicitly re-attaches or names them as valid references for the current run.

If the current run supplies exactly one product reference and one environment reference, the product reference defines the product and the environment reference defines only room mood/architecture. Previous generated images are not product references and must not override the current product image.

## Reference Relevance Ranking And Rejection Rule

Before prompt writing, the skill MUST rank every current-run reference image into one of these roles:
1. `PRIMARY_PRODUCT_REFERENCE` - images that directly show the sellable product or product-family variants. These dominate all product facts.
2. `SECONDARY_CONTEXT_REFERENCE` - images that provide useful environment, scale, use-case, mood, or person-interaction context without defining the product.
3. `IRRELEVANT_OR_CONFLICTING_REFERENCE` - images that do not support the product story, conflict with the product category, or would cause unrelated fashion/travel/portrait/room frames. These must be ignored unless the user explicitly says to use them.

Ranking must be based on the current request only. If most product-like references show mats, rugs, cabinets, brackets, sofas, tables, or another clear product category, that product category becomes the storyboard subject. Any image that does not plausibly help sell or explain that product is demoted or rejected.

A storyboard plan fails QA if any frame is primarily driven by an `IRRELEVANT_OR_CONFLICTING_REFERENCE`.

## Dominant Product Category Lock

After ranking references, the skill MUST declare one dominant product category or product-family category before writing any storyboard prompt. This category lock controls all panels.

Rules:
- If references mostly show one product type from multiple angles, use `single_product_storyboard`.
- If references show the same product category in multiple designs/colorways/patterns, use `product_family_or_collection_storyboard`.
- If one image is a person, room, or lifestyle scene but product images clearly indicate a different category, the product category wins.
- Do not let a visually attractive person/environment image override the product category.

For floor mat/rug collections, the dominant category should be specific, such as `cute cartoon animal floor mat collection`, `bath mat collection`, `entry mat collection`, or `decorative floor textile collection`. Do not reinterpret it as fashion, travel, portrait, room design, blanket, towel, or generic carpet.

## Single Product Versus Product-Family Decision Rule

The skill must distinguish whether references describe one exact item or a family/collection of related items.

Use `single_product_storyboard` when:
- the same item appears repeatedly from different angles or usage states.
- visible differences are caused by lighting, perspective, folding, opening, or installation state.
- the user asks for one specific product.

Use `product_family_or_collection_storyboard` when:
- references show several patterns, colors, motifs, or variants of the same product category.
- items are clearly variants sold as a collection.
- the common commercial subject is the category/design family rather than one exact SKU.

For collection mode:
- Do not blend variants into one impossible hybrid product.
- Show multiple variants deliberately as a collection when useful, but keep each variant internally consistent inside each panel/frame.
- Preserve each variant's visible pattern/color when it appears.
- Make clear through composition that the collection belongs to one product family.

## Forensic Vision Inspection Rule

Before writing the final prompt, inspect product references as if performing a forensic visual audit. Do not stop at coarse furniture classification.

Inspect and preserve:
- primary furniture category and subtype.
- configuration/state, including folded, extended, opened, reclined, stacked, nested, modular, or converted states.
- countable components and small parts.
- material identity, finish, and texture.
- wear patterns, wrinkles, seam behavior, and surface tension when visible.
- hardware, trim, connectors, feet, caps, rails, hinges, screws, pulls, brackets, and other construction details.
- pattern direction, weave direction, grain direction, veining, chip distribution, perforation pattern, and stitch path when visible.
- asymmetries, left/right-specific details, and minor distinguishing features.

If the reference image is small or imperfect, preserve what is observable. Use cautious language such as "appears to be" only when genuinely ambiguous. Never replace uncertainty with a more generic or more luxurious furniture archetype.

## Canonical Product Attribute Extraction Rule

Before writing prompts, extract these attributes from the product reference and restate them in `PRODUCT REFERENCE LOCK` when visible or supplied:
- category and subtype.
- single item vs set; exact number of included units.
- overall silhouette and footprint.
- height/width/depth relationship and numeric dimensions when supplied.
- visual bounding-box ratio from the reference image: whether the product is short/tall, narrow/wide, shallow/deep, cube-like, slab-like, tower-like, or table-height.
- primary visible orientation and allowed alternate orientations.
- support system: legs, pedestal, plinth, casters, wall mount, floor pad, suspension, rails, glides.
- countable structure: cushions, panels, drawers, doors, shelves, legs, wheels, arms, slats, modules, pillows, handles, hooks, rails, baskets.
- material and finish for every visible major part.
- seams, stitching, piping, tufting, fluting, grooves, weave, grain, bevels, edge profiles, joinery, fasteners, hardware.
- functional features: reclining, folding, swiveling, rolling, extending, stacking, sliding, lifting, converting, storage access.
- no-go substitutions: explicitly name common mistaken categories that must not be generated.

The prompt should not rely on generic wording like "same furniture as reference." It must name concrete observable attributes.

## Furniture Geometry And Material Lock

This rule is a fatal Media Studio maintenance requirement. For every furniture prompt, explicitly lock geometry and material from the product reference.

The prompt MUST state:
- exact furniture category and subtype.
- whether the item is low/wide, tall/narrow, compact, bulky, boxy, rounded, arched, slab-sided, soft-edged, modular, or transformable.
- number and arrangement of cushions, arms, backs, drawers, doors, shelves, tiers, legs, casters, handles, brackets, pillows, panels, modules, hooks, rails, and other countable parts.
- material category of each visible major component: fabric, leather, wood, veneer, plastic, metal, rattan/cane, glass, stone, laminate, lacquer, textile, rubber, or composite.
- color, finish, texture scale, pattern direction, grain direction, stitch path, edge binding, seam lines, hardware finish, and visible label/tag placement.
- product-specific wrong substitutions to reject.

Do not write only "match the reference." The prompt must force the image model to preserve visible facts:
`PRODUCT REFERENCE LOCK: reproduce this product exactly as shown in the current product reference with zero changes to visible category, geometry, countable parts, material, color, finish, hardware, support/base, scale, and markings. This is a [material/category/proportion/support] product, NOT a [common wrong substitution].`

For cabinets/dressers/storage units, the prompt must explicitly mention material category, proportion category, handle category/position, and base/leg category. If the reference shows plastic, say plastic and prohibit wooden dresser substitution. If the reference sits on short feet or a plinth, prohibit tall tapered legs.

For sofas/daybeds/floor chairs, preserve cushion count, backrest position, armrest presence/absence, pillow count, leg/base type, fabric texture, seam/piping, and low-floor or raised scale. Do not transform a low armless daybed into a full sofa, sectional, mattress, chaise longue, raised armchair, or bed.

For tables/desks, preserve tabletop shape, edge profile, thickness, overhang, leg count, base type, crossbars, drawers, cable holes, and material finish. Do not change a round table to rectangular, four legs to pedestal, glass to marble, desk to dining table, or coffee table to bench.

For racks/carts/shelves, preserve tier count, basket lips, caster count, pole thickness, rail placement, and narrow/wide footprint. Do not turn a narrow rolling cart into a pantry cabinet or built-in shelf.

## Product Physical Aspect-Ratio Lock

Product physical aspect ratio is separate from output canvas aspect ratio. The storyboard canvas may be 9:16, 1:1, 16:9, or another layout, but the furniture object itself must keep the same height-to-width-to-depth relationship visible in the product reference.

When product references are supplied, every prompt MUST include a product-proportion sentence inside `PRODUCT REFERENCE LOCK`:

`PRODUCT PHYSICAL PROPORTION LOCK: preserve the reference product's real object proportions and visual bounding-box ratio exactly: [height vs width vs depth], [top thickness], [leg/post thickness], [shelf/drawer/cushion spacing], [floor clearance/base stance]. Do not stretch taller, widen, flatten, bulk up, slim down, upscale, downscale, or change the object's physical ratio to fit the storyboard frame or room composition.`

If `PRODUCT PHYSICAL PROPORTION LOCK` is missing, the prompt is invalid and must be rewritten before output.

This lock is required even when no numeric dimensions are supplied. Infer the proportion class from the product image and state it plainly, such as:
- `small table-height two-tier shelf, not a tall bookcase`.
- `narrow rolling cart, not a full-height pantry rack`.
- `low floor sofa, not a raised sectional`.
- `wide squat cabinet, not a tall dresser`.
- `thin floor mat, not a blanket or thick mattress`.

Every storyboard panel that shows the product must preserve the same product instance proportions. Camera angle, crop, perspective, and distance may change, but the object may not gain height, lose width, thicken shelves, stretch legs, change shelf spacing, or become a different furniture archetype from panel to panel.

For product-only, hero, and room-placement panels, show enough full silhouette to verify the proportion lock. At least 4 of 9 panels in a 3x3 furniture storyboard must show the full or nearly full product body with top, base/feet, side posts/legs, shelves/drawers/cushions, and floor contact visible unless the user explicitly requests detail-only frames.

If the reference product is a compact white two-tier side shelf/table or nursery side table, explicitly lock it as a small table-height rectangular open shelf with a flat top, two open shelf levels, four straight vertical side posts/legs, slim rectangular boards, low floor clearance, and compact height-to-width ratio. Do not transform it into a tall bookcase, cube organizer, bulky cabinet, thick-legged table, oversized shelving tower, or generic nursery furniture.

Do not describe a compact open side table as having solid side panels, a closed cabinet body, a back panel, or thick slab walls unless those are unmistakably visible in the product reference. If the reference shows open sides or narrow supports, say open-sided frame with slim vertical supports/posts/legs. If uncertain, use "appears open-sided" and prohibit closed-cabinet reinterpretation.

For square or near-square compact side tables, the prompt must say `near-square table-height footprint` or `roughly cube-like table-height footprint` and explicitly prohibit tall narrow shelving proportions. The generated object must not be taller than it is wide by a large margin unless the reference proves that ratio.

## Exact Furniture Color, Finish, And Marking Lock

Reference product images are the highest-priority source of truth. Interior styling, lifestyle mood, architecture, lighting, props, and aspirational art direction may change the scene around the furniture, but must not redesign, recolor, rebrand, resize, upscale/downscale unrealistically, or materially reinterpret the product itself.

Preserve:
- exact primary and secondary color palette as perceived in the reference.
- exact upholstery material impression: woven fabric, linen, boucle, velvet, leather, faux leather, microfiber, canvas, outdoor textile, or mesh.
- exact wood tone and grain direction when identifiable.
- exact metal finish: chrome, brushed stainless steel, matte black, powder-coated white, bronze, brass, copper, aluminum, or painted steel.
- exact glass, stone, rattan, cane, wicker, laminate, lacquer, ceramic, plastic, concrete, textile, rubber, or composite finish.
- exact hardware, logo, brand tag, care label, printed/engraved mark, and sticker placement when physically present.

Lighting may be warm, cool, daylight, studio, or moody, but it must not recolor the furniture into a new SKU/colorway.

## Product-Source Dominance Rule

The product reference wins over every other source, even when it is a small ecommerce thumbnail, low-resolution image, marketplace image, or partially cropped photo. Translate that product faithfully into the requested room/storyboard, not a prettier generic furniture item.

When the product reference is a simple ecommerce cutout or small thumbnail, extract and preserve observable product facts:
- product category and configuration.
- silhouette and orientation.
- material color and surface type.
- cushion/drawer/leg/shelf/handle count.
- backrest/armrest/base/foot/caster layout.
- visible brand overlay exclusion unless physically attached to the product.

Every storyboard panel that shows the product must keep the same product identity. Different camera angles and usage scenes are allowed; redesigning the product is not.

## Micro-Component And Small-Part Preservation Rule

Preserve small visible parts if they contribute to product identity. Small parts are not optional.

Inspect and preserve whenever visible:
- zipper lines, zipper pulls, Velcro flaps, ties, straps, snaps, piping, welting, button tufting, channel tufting, quilting lines, stitch spacing, top-stitch lines, seam breaks, pleats, gathers, and edge binding.
- caster shape, wheel housing, wheel count, axle spacing, leg caps, glides, foot pads, plastic end caps, anti-slip pads, adjustable feet, and floor-clearance details.
- drawer pulls, handle profile, knob shape, hinge type, rail placement, sliding track, lock cylinder, magnet latch, cable hole, shelf pin, hook, peg, rail, towel bar, basket edge, mesh insert, and support bracket.
- connector plates, screws, bolts, rivets, nail heads, exposed joinery, dowel covers, corner protectors, stitch tabs, reinforcement patches, and trim strips.
- label placement, brand tag location, care tag location, hang tag attachment point, SKU sticker placement, engraved plate, stamped logo, or maker mark when physically present.

Do not simplify away these details when visible.

## No Invention Of Unseen Materials Or Parts

Do not assume, add, or describe materials, hardware accessories, support structures, or functional parts not visible in the reference images.

Forbidden unless visible:
- metal plates, mounting brackets, black steel bars, tension ropes, reinforcement frames, exposed assembly bolts.
- slide rails, runners, metal guide tracks, chrome gas lifts, side hinges, or handles.
- internal linings, dust covers, backing fabrics, plywood panels, raw pine, MDF, or secondary wood species.
- decorative seams, buttons, quilting, fluting, carvings, gold trim, metallic feet, faux leather inserts, or decorative knobs.

If an underside, interior, or hidden side is exposed in a storyboard frame, default its material/color/finish to the primary visible exterior finish unless the reference proves otherwise.

## Numeric Dimension And Compact Furniture Scale Lock

When the user supplies exact dimensions, include a dedicated `PRODUCT SCALE LOCK` block:

`PRODUCT SCALE LOCK: real product dimensions are approximately [length] x [width] x [height/thickness/depth] [unit]; preserve this [compact/full-size/portable/low-profile/tall-narrow] scale; show it as [one-person/two-person/storage-height/table-height/etc.] furniture; do not enlarge, shrink, or reinterpret it as a different furniture class.`

When the user does not supply numeric dimensions, still include an inferred scale lock from the reference:

`INFERRED PRODUCT SCALE LOCK: based on the product reference image, preserve the visible scale class and physical proportions: [small tabletop/table-height/storage-height/floor-level/full-size/etc.], with the same height-width-depth relationship and same countable structure. Do not let room styling, nursery context, props, human scale, or storyboard framing resize the product into another class.`

The final prompt must still label this block as `PRODUCT SCALE LOCK:`. If there are no numeric dimensions, put the inferred-scale sentence under `PRODUCT SCALE LOCK:` rather than omitting the block or using only generic words like compact, table-height, or small.

Compact furniture guardrails:
- If under about 150 cm long or under about 70 cm wide, treat as compact/portable/one-person/small-room unless references prove otherwise.
- If it sits directly on the floor and thickness is under about 20 cm, do not turn it into a full-height sofa, sectional, chaise longue, mattress, bed, bench, raised recliner, or bulky armchair.
- If it has casters and narrow tiers, do not scale like a pantry cabinet, wardrobe, or full-height shelving system unless dimensions support that.
- If it is a folding stool or portable step stool, keep it hand-carry scale and do not enlarge it into a bench, side table, or ladder.

Scale QA is fatal. If a draft prompt would make a compact product look like a large permanent living-room centerpiece, rewrite it.

## Floor Textile, Rug, Mat, And Carpet Product Fidelity Rule

For rugs, mats, carpets, bath mats, kitchen mats, play mats, pet mats, bedside mats, and floor textiles, classify the product as a furniture-adjacent textile product, not generic decor.

Preserve:
- rectangular, runner, round, oval, irregular, contour, scalloped, or custom shape.
- corner radius, rounded edges, stitched border, binding, overlock seam, piping, beveled edge, or hem.
- pile height impression: low pile, medium pile, plush, shaggy, loop pile, chenille-like, microfiber, tufted, woven, felt-like, rubber-backed.
- surface softness and fiber direction.
- printed/woven/tufted pattern, animal motifs, paw prints, cartoon faces, clouds, letters, geometric motifs, stripes, border lines, and motif placement.
- backing/anti-slip layer if visible.
- thickness and how the mat lies on tile, wood, bathroom floor, playroom floor, or entry floor.
- physical product text genuinely printed/woven into the product, such as WELCOME or decorative letters.

Do not convert a floor mat into a blanket, wall tapestry, bedspread, sofa throw, towel, yoga mat, picnic blanket, plain rug, or unrelated floor texture.

## Floor Textile Product Visibility Coverage Rule

For a 3x3 mat/rug storyboard:
- At least 6 of 9 panels must show the mat clearly as the main subject.
- At least 3 panels must show the full or nearly full mat shape.
- At least 2 panels must show close-up texture, edge, pile, or motif detail.
- At least 1 panel must show human or usage interaction with the mat.
- No panel may rely on the mat as an indistinct background floor texture.
- Lifestyle wide shots must keep the mat readable, not tiny or hidden.

If the pattern is the main selling feature, the pattern must be readable in most product-visible panels.

## Floor Textile Collection 3x3 Role Map

When references show a collection of related mats/rugs rather than one exact SKU, use a collection-aware 3x3 storyboard:
1. hero of the clearest/dominant mat variant, full shape and pattern visible.
2. top-down or three-quarter comparison of 2-3 collection variants.
3. bathroom/entryway/playroom/pet-corner placement based on the best-fitting use case.
4. close-up edge binding, rounded corner, stitch, overlock, or thickness.
5. close-up pile/fiber texture and motif color separation.
6. user interaction: feet stepping on the mat, hand touching texture, or placing the mat on floor.
7. key motif detail such as animal face, paw print, cloud, flower, letters, or WELCOME word.
8. scale/context frame showing the mat in a real room while still clearly visible.
9. final styled lifestyle frame showing product-family identity without unrelated references.

Do not allocate any panel to unrelated beach portraits, fashion frames, empty dressing rooms, or environment-only mood images.

## Storage Furniture And Drawer Fidelity Rule

For cabinets, dressers, wardrobes, drawers, sideboards, shelves, carts, and storage units, override generic storage priors.

The prompt must contain:
- `reproduce this product exactly as shown in the attached reference image with zero changes to any visible attribute`.
- Material override: `this is a [MATERIAL] storage unit, NOT a [common wrong substitution]`.
- Proportion override: `proportions are [wide and squat / tall and slim / low and long / roughly cubic] as in the reference, NOT [wrong archetype]`.
- Handle override: `handles are [arch scoop / round knobs / bar pulls / recessed slits / cutout slots / absent] as visible in the reference, NOT [wrong replacement]`.
- Base override: `base has [short plastic feet / plinth / casters / no visible base / tapered wooden legs] as in the reference, NOT [wrong base]`.

When a drawer is shown open, interior and sides must match the exterior finish unless the reference shows otherwise. Do not invent raw wood linings, metal slide rails, or contrasting unfinished panels.

## Armless Daybed / Low Chaise Product-Specific Guard

For armless daybeds, low chaise seats, compact sofa beds, floor-sofa products, and foldable floor loungers, preserve:
- one long rectangular seat slab unless the reference shows separate cushions.
- a single backrest panel at one short end or along one side as shown in the reference.
- included pillow count/shape only if visible in the product reference.
- no armrests unless visible in the reference.
- short exposed legs or low base exactly as shown.
- fabric weave/color and edge piping visible in the reference.
- low lounge/daybed scale, not a tall couch or luxury sectional.

At least three storyboard panels must show the full product form clearly: front three-quarter, side profile, and product-only hero/detail.

## Furniture Hardware, Accessory, And Component-Only Product Rule

Some furniture-related products are hardware, brackets, legs, casters, handles, shelf supports, wall mounts, hinge kits, connector plates, replacement feet, risers, rails, or modular parts. When the product reference shows only a component or hardware set, the component itself is the product.

Preserve:
- exact number of pieces in the set when visible.
- colorway and finish such as matte black powder-coated metal, glossy black, white coated metal, stainless steel, brass, plastic, rubber, wood, or mixed materials.
- plate shape, arm length relationship, diagonal brace geometry, bend radius, thickness, screw-hole count, screw-hole placement, slot shape, rounded ends, sharp corners, caps, weld lines, included screws/anchors.
- whether the product is a pair, single unit, left/right mirrored pair, or multi-pack.

Do not let the shelf, cabinet, wall, props, or room styling become the main product.

For shelf brackets and L-brackets, the `PRODUCT REFERENCE LOCK` must explicitly name all observable micro-geometry:
- L/right-angle structure and whether the vertical and horizontal plates are equal length or unequal.
- plate end shape, corner radius, edge thickness, bend radius, flatness, and whether edges are rounded or square.
- diagonal brace shape, brace position, weld points, gusset/strut thickness, and any raised ridge or folded edge.
- exact visible hole count by component: vertical mounting plate, horizontal shelf plate, and diagonal brace/gusset.
- hole shape, relative size, alignment, spacing, and whether holes are countersunk, circular, oval, slotted, or plain.
- pair/set relationship: single bracket, matched pair, mirrored pair, or multi-pack.
- included screws/anchors only when visibly supplied by the reference; otherwise do not invent them.

For small hardware storyboards, at least 6 of 9 panels must keep the hardware large enough to inspect; at least 4 panels should be macro/detail/product-only views. Wide room/lifestyle panels are allowed only when the bracket/hardware remains visible and recognizable, not hidden under the shelf or swallowed by the room.

Do not let a shelf, room, wall, books, plants, clothing rack, or character become the hero subject. In installed shelf frames, the bracket must remain visibly dominant enough to verify its plate shape, diagonal brace, and hole pattern.

When styling shelves near hardware, use blank book spines and props with no readable text unless physical text is part of the product reference. This prevents unwanted text despite the no-extra-text policy.

## Hardware Storyboard Role Map Rule

For furniture hardware/components, a 3x3 storyboard should include:
1. product pair/set overview on clean surface.
2. installed context showing what the hardware supports.
3. close-up of screw holes / plate shape.
4. close-up of diagonal brace / weld / bend / joint.
5. hand-scale or size-context shot.
6. installation alignment or mounting moment.
7. side profile showing thickness and projection.
8. loaded/use-case shot with shelf/object supported.
9. final installed result with hardware clearly visible.

At least 5 of 9 panels should show the hardware large enough to inspect.

## Comprehensive Furniture Taxonomy Coverage Rule

Classify the referenced product into one primary category and optional secondary category before prompt writing.

Core categories:
0. Floor textiles and soft floor coverings: rug, carpet, area rug, runner, bath mat, kitchen mat, entry mat, doormat, play mat, baby mat, pet mat, bedside mat, anti-slip mat, floor cushion mat.
1. Seating furniture: sofa, loveseat, sectional, modular sofa, chaise, recliner, armchair, lounge chair, accent chair, rocking chair, swivel chair, office chair, gaming chair, dining chair, bar stool, counter stool, bench, ottoman, pouf, floor chair, floor sofa, meditation chair, folding chair, outdoor chair.
2. Sleeping and convertible furniture: bed frame, platform bed, daybed, bunk bed, loft bed, sofa bed, futon, fold-out chair bed, trundle bed, headboard, mattress base, storage bed, crib, toddler bed.
3. Tables and surfaces: coffee table, side table, end table, console table, dining table, desk, computer desk, vanity table, nesting table, folding table, extendable table, bar table, bedside table, outdoor table, TV tray.
4. Storage and case goods: wardrobe, closet, cabinet, cupboard, sideboard, buffet, credenza, dresser, chest of drawers, filing cabinet, TV stand, media console, shoe cabinet, bookcase, shelf unit, wall shelf, cube organizer, display cabinet, pantry cabinet, bathroom cabinet, laundry cabinet, storage cart, rolling rack.
5. Office and work furniture: office chair, task chair, executive chair, gaming chair, standing desk, writing desk, computer desk, monitor riser, filing cabinet, workstation, meeting table, reception desk.
6. Dining and kitchen furniture: dining table, dining chair, dining bench, bar stool, counter stool, kitchen island cart, pantry rack, sideboard, buffet, wine rack, baker's rack.
7. Entryway, hallway, and utility furniture: shoe rack, coat rack, hall tree, entry bench, umbrella stand, key cabinet, console, garment rack, laundry hamper rack, utility shelf, ironing board cabinet.
8. Bathroom and laundry furniture: vanity cabinet, medicine cabinet, bathroom shelf, over-toilet rack, laundry shelf, laundry cart, hamper, towel rack, linen cabinet.
9. Outdoor, patio, and garden furniture: patio chair, outdoor sofa, rattan set, garden bench, folding camping chair, sun lounger, patio table, umbrella table, outdoor storage box, deck chair.
10. Children's, nursery, and pet furniture: crib, toddler bed, changing table, kids chair, study desk, high chair, toy storage, play table, pet bed, cat tree, pet sofa.
11. Commercial and hospitality furniture: cafe chair/table, restaurant booth, hotel lounge chair, waiting bench, salon chair, massage table, retail display shelf, reception counter, classroom desk, dorm furniture.
12. Modular, flat-pack, and transformable furniture: modular shelving, modular sofa, stackable cubes, extendable table, folding stool, folding bed, wall bed, lift-top table, convertible sofa bed, adjustable recliner, collapsible rack.

If the product does not fit exactly, classify by physical construction first: seating surface, sleeping surface, storage volume, tabletop surface, rack/shelf structure, floor textile, hardware component, or hybrid/transformable structure.

## Product Visibility, Occlusion, And Cropping Rule

Every storyboard frame must contain the referenced product unless the user explicitly requests a product-absent establishing shot. Do not create mood-only, room-only, bed-only, floor-only, prop-only, book-only, or person-only panels in a product storyboard.

For any storyboard with 2-4 panels, every panel must show the full or nearly full product clearly enough to verify category, shelf/tier count, open sides, tabletop, support/leg structure, and table-height scale. Detail-only crops are allowed only when the storyboard has 5 or more panels and the crop still includes enough adjacent product structure to prove it belongs to the same item.

For hero/product panels:
- Show the full product silhouette with defining structure visible.
- Keep key edges, supports, legs/casters/base, arms/backrests, doors/drawers/shelves, tabletop, seat surface, and distinctive hardware unobscured.
- Use props sparingly and never let pillows, blankets, plants, people, pets, decor, or foreground blur hide product identity.
- Preserve floor/wall contact and scale cues.

For detail panels:
- Crop intentionally to material, seam, weave, hardware, caster, handle, hinge, joinery, fold mechanism, drawer reveal, support bracket, label, edge binding, or motif.
- Make the detail belong to the same product and same material/colorway.
- Do not crop so tightly that the feature becomes visually ambiguous or looks like a different product.

For people-interaction panels:
- Hands/body must interact naturally without covering the detail being demonstrated.
- Do not sit, lean, or drape fabric in a way that hides product-defining structure in all panels.

## Smart Human-With-Product Interaction Rule

If a current character/person image is relevant and plausible for the product, use that person as the identity reference in at least one product-interaction frame.

If the current person image is irrelevant to the product category/environment/use case, do not force that person or location into the storyboard. Instead, create a generic, non-identifiable user interaction that explains the product, such as:
- bare feet stepping on a mat.
- a hand touching rug texture.
- a person placing a mat at a bathroom or doorway.
- a hand opening a drawer, installing hardware, or using a furniture mechanism.
- a person sitting, reclining, reaching, placing, folding, rolling, or lifting in a way that proves scale/function.

Do not create a person-only frame. The human element is valid only when it demonstrates scale, contact, use, function, installation, or lifestyle benefit with the product clearly visible.

## Hand, Body, And Furniture Interaction Rule

For frames with hands, people, or body contact:
- Require natural left/right hand orientation.
- Correct palm direction and plausible wrist rotation.
- Correct thumb placement.
- Exactly five fingers per visible hand.
- No fused fingers, extra fingers, duplicated hands, reversed palms, broken joints, or rubbery anatomy.
- Body posture must match real furniture use.
- Product contact must match real weight, scale, and function.

Prefer simple readable poses. In close-up product-use frames, use one clearly visible active hand when possible.

## Environment Compatibility Scoring Rule

Before using an environment reference, score whether it plausibly supports the product's actual use case.

Examples:
- bath mat -> bathroom entrance, shower area, sink area.
- entry mat/doormat -> doorway, foyer, hallway.
- cute animal mat/play mat -> nursery, kids room, pet corner, playroom.
- dresser/cabinet -> bedroom, closet, dressing room, storage corner.
- shelf bracket -> wall shelf installation, hardware close-up, workshop/installation context.
- daybed/floor sofa -> compact studio, bedroom corner, reading nook, playroom, low lounge area.

An environment-only frame is invalid for product storyboards unless the user explicitly requested an establishing shot. Even then, the product should usually be present.

## Single-Frame Output And No-Collage Default Rule

Unless `generation_mode` is explicitly `multi_frame_storyboard`, each prompt must describe one coherent final photograph, not a product collage, not a contact sheet, not a catalog grid, and not a before/after comparison.

For single-frame and separate-prompt-per-frame modes:
- one main product instance.
- one believable room setting.
- one camera angle.
- one clear action or usage moment.
- clean product visibility without internal subframes, reference-photo replication, thumbnails, diagrams, labels, or measurement arrows.

## Explicit Storyboard Mode Enforcement Rule

If the user selects or requests a storyboard, contact sheet, grid, frame sequence, 3x3, 2x3, 3x2, 2x2, or any `storyboard_layout_preset`, the output format MUST be multi-frame storyboard even if `generation_mode` is `auto`.

For a requested 3x3 storyboard:
- output one single final image containing a 3 columns x 3 rows grid.
- include exactly nine separate panels.
- every panel must be equal-sized.
- each panel must show a distinct product-relevant scene, angle, detail, or usage moment.
- every panel must preserve the same referenced product.
- no captions, frame numbers, labels, arrows, or text overlays unless explicitly requested.

If a draft prompt describes one hero photograph instead of the requested panels, rewrite it as a storyboard before output.

## Multi-Frame Storyboard Visual Rule

When `generation_mode` is `multi_frame_storyboard` OR when the user requests/selects any storyboard/grid layout, create a prompt for a clean image-only storyboard/contact sheet.

Whenever a vertical storyboard or vertical aspect ratio is requested/implied, explicitly lock `9:16` as the canvas ratio.

Use `storyboard_layout_preset` together with `aspect_ratio` as the canvas contract:
- `canvas_1_1_*` presets require the final full storyboard image to be 1:1.
- `canvas_16_9_*` presets require the final full storyboard image to be 16:9.
- `canvas_9_16_*` presets require the final full storyboard image to be 9:16.
- `canvas_4_3_*` presets require the final full storyboard image to be 4:3.
- `canvas_3_4_*` presets require the final full storyboard image to be 3:4.
- `*_exact` presets require every frame to match the stated per-frame ratio exactly.
- `*_crop_safe` presets may use non-exact internal frame ratios, but every frame must include generous safe margins so each frame can be cropped later without cutting off the furniture, person, hands, legs, arms, backrest, tabletop, drawer front, hardware, logo, brand tag, or key action.

For `canvas_9_16_grid_3x3_frame_9_16_exact`, the final prompt MUST describe exactly one 9:16 vertical storyboard image with a 3x3 grid and exactly 9 distinct vertical frames. Do not return 3 scenes. Do not combine three frames into one scene. Do not duplicate the same sentence under each scene heading.

State the exact grid, total frame count, final canvas aspect ratio, whether frames are exact-ratio or crop-safe, and that panels are seamlessly joined with zero divider lines, gutters, borders, or margins.

## Borderless Storyboard Presentation Rule

Every storyboard prompt MUST contain both:
1. A positive borderless grid declaration, such as `seamless borderless edge-to-edge grid`.
2. Explicit negative prohibitions, such as `zero white divider lines, zero black lines, zero gutters, zero margins, zero frame outlines, zero separator lines`.

Required text to include in every multi-panel prompt:
`seamless borderless edge-to-edge grid, panels touch directly with zero white divider lines, zero black lines, zero colored borders, zero gutters, zero margins, zero frame outlines, zero separator lines between panels`

Every panel must be mathematically identical in height and width forming a perfectly aligned grid to allow clean automatic cropping and frame slicing.

## Equal-Frame Storyboard Grid Rule

When the output is a storyboard/contact sheet/image grid:
- no divider lines or gutters.
- every frame must touch adjacent frames perfectly and seamlessly with zero gap.
- every panel/cell must have exact same width and height dimensions down to the pixel level.
- row heights must match exactly.
- column widths must match exactly.
- no hidden overlap, collage-style stacking, irregular mosaic layout, floating inset frames, frame numbers, or visible labels.

This rule directly addresses Media Studio maintenance issue `weak_storyboard_grid_contract`.

## Strict Per-Panel Uniqueness Rule

A storyboard must not contain multiple panels that are visually or semantically near-duplicates. Similar product visibility is allowed, but repeated camera distance, repeated camera angle, repeated product orientation, repeated prop setup, and repeated user action are not allowed unless the user explicitly asks for comparison variants.

For a 3x3 storyboard:
- no more than 2 panels may use the same broad camera angle category.
- no more than 2 panels may use the same shot distance category.
- no more than 2 panels may show the same product orientation.
- no more than 1 panel may repeat the same user action.
- at least 7 of 9 panels must have clearly different visual intent.
- at least 6 of 9 panels must have a different camera distance, angle, or functional state from adjacent panels.

If any two panels could be described by essentially the same sentence, rewrite the storyboard plan.

## Customer-Journey Storyboard Planning Rule

When the user requests a storyboard, first infer the most useful customer journey for understanding the product, then distribute that journey across frames.

The storyboard should communicate:
- what the product is.
- what it looks like from key angles.
- how it functions.
- what differentiates it.
- how large it feels in context.
- how it is used in real life.
- what special mechanisms, details, or accessories it includes.
- how it fits into the intended room or lifestyle.

For furniture, default journey:
1. hero product overview.
2. alternate angle proving silhouette/configuration.
3. side/rear/underside/mechanism evidence.
4. close-up of key surface/material detail.
5. close-up of key functional detail or hardware.
6. in-use interaction frame.
7. room-scale/context frame.
8. second lifestyle/benefit frame or another functional state.
9. final confirmatory frame showing complete product clearly or folded/opened/converted/storage state.

For 2-panel, 3-panel, or 4-panel product storyboards, do not use any panel as a product-absent setup image. Panel 1 must be a full product hero, panel 2 must be an alternate angle or placement with the same full product, and remaining panels must still keep the product visible.

## Required 3x3 Panel Role Maps

Choose the matching category and adapt the nine panels.

Seating furniture:
1. full product hero in matching room.
2. three-quarter angle showing length, arms, seat depth.
3. cushion/seam/material close-up.
4. side profile proving backrest tilt, seat height, leg clearance.
5. adult using the product for scale.
6. support/feet detail.
7. comfort demonstration with hand or body contact.
8. alternate wider lifestyle angle.
9. clean product confirmation.

Sleeping and convertible furniture:
1. complete bed/daybed/sofa bed in room.
2. headboard/backrest detail.
3. primary state profile.
4. transition/action on hinge/latch/fold if applicable.
5. secondary converted/open state if supported by reference.
6. frame/slat/base evidence.
7. upholstery/seam/fold detail.
8. person resting or using scale.
9. final styled lifestyle.

Tables and surfaces:
1. full table hero.
2. tabletop geometry.
3. edge/profile detail.
4. leg/base stance.
5. joinery/hardware/underside detail.
6. utility scale with hand/cup/laptop.
7. material texture macro.
8. lifestyle footprint.
9. clean structural view.

Storage and case goods:
1. direct front elevation.
2. depth/side panel.
3. drawer/door fronts and reveal lines.
4. hardware close-up.
5. open state with matching interior finish.
6. joinery/seam/edge detail.
7. human access interaction.
8. organized utility/capacity.
9. styled room integration.

Floor textiles:
1. complete mat/rug shape and pattern.
2. room placement with correct scale.
3. edge binding/corner detail.
4. pile/fiber/pattern close-up.
5. feet/hand/placement interaction.
6. functional placement frame.
7. key motif/letter/pattern detail.
8. low-angle edge thickness.
9. final lifestyle with full product visible.

Hardware/components:
1. product pair/set overview.
2. installed context.
3. screw holes/plate shape.
4. brace/weld/bend/joint.
5. hand-scale shot.
6. installation alignment.
7. side profile.
8. loaded/use case.
9. final installed result.

Default furniture:
1. hero establishing.
2. angle/depth.
3. side/support profile.
4. material texture.
5. detail component.
6. usage/scale.
7. underside/hinge/support.
8. room fit/layout.
9. clean confirmatory hero.

## Video-Friendly Storyboard Continuity Rule

For multi-frame storyboard prompts, enforce visual continuity across all panels. The storyboard should feel like consecutive frames extracted from a premium cinematic video reel unless the user explicitly asks for multiple settings.

Lock:
- room architecture, wall color, floor material, window placement, ceiling height.
- background props that remain in exact positions.
- fixed light source, shadow direction, color temperature, exposure, white balance.
- smooth camera progression rather than chaotic random cuts.
- identical clothing/hair/accessories for recurring people.
- logical hand/body movement progression.
- prop consistency when visible.

If any panel description would lead to shifted backgrounds, mismatched lighting, or disjointed character clothing, rewrite the plan.

## Default No-Extra-Text Rendering Rule

Generated images must be image-only by default, except when an infographic cinematic style is selected. Input `image_text_mode` controls added visible text in the generated image. Infographic cinematic styles have higher priority than the no-text default.

If `cinematic_style` is `info_graphics_realistic` or `info_graphics`, treat it as an explicit visible-text request even when `image_text_mode` is missing or `no_text`. Do NOT include a no-added-visible-text negative prompt. Every generated prompt MUST include `TEXT RENDERING POLICY` requiring a readable infographic layout with concise, large, intentional text.

For `info_graphics_realistic`, write the image prompt in this direction: "Create an info graphics realistic image using the attached furniture/product reference image as the main visual, with large readable text, not too many words, only the key points about [topic/key product benefit]." Keep the product photo-realistic and preserve the exact furniture geometry, proportions, material, texture, construction, markings, and scale.

For `info_graphics`, write the image prompt in this direction: "Create a clean info graphics image using the attached furniture/product reference image as the main visual, with large readable text, not too many words, only the key points about [topic/key product benefit]." Use clean graphic shapes, icons, callout panels, and hierarchy while preserving the referenced product.

Infographic text language follows `image_text_language`: `en` means English, `th` means Thai, and `other` means use `image_text_custom_language`. If no language is specified, use English. If Thai is selected, use large concise Thai headline/callout text.

Infer `[topic/key product benefit]` only from user-supplied `storyboard_guide`, `voiceover_script`, `production_concept_details`, `product_title`, `product_label_text`, visible product facts, supplied dimensions/markings, or safe category/use-case facts. Use one large headline plus 2-4 short key points; avoid paragraphs and dense copy.

If `cinematic_style` is not an infographic style and `image_text_mode` is missing or `no_text`, every generated prompt MUST explicitly include `TEXT RENDERING POLICY` stating that the image must contain no added visible text of any kind.

## Prop Text Suppression Rule

When `image_text_mode` is missing or `no_text` and the style is not infographic, suppress readable text on all non-product props and background objects. Use blank mugs, blank/spineless books, unreadable phone screens, no visible logos, no wall-art words, no signage, no UI, no prop labels, and no readable numbers unless they are exact physical markings on the referenced product that the user wants preserved. If an alarm clock, book, package, screen, or mug is needed as a prop, compose it so any numerals, title, logo, or lettering is absent, turned away, blurred, or too small to read. Product labels/marks are the only text that may be preserved in no-text mode.

If `image_text_mode` is `with_text`, intentional added text is allowed only where it supports the requested storyboard, ad, infographic, callout, caption, headline, label, or measurement design. Use `image_text_language` to choose the language for added visible text.

Forbidden by default for non-infographic no-text mode:
- captions, headlines, subheads, bullet points.
- product feature callouts.
- spec labels, frame numbers, measurement numbers, arrows.
- Thai or English promotional text.
- badges, banners, stickers, price bubbles, sale marks.
- infographic labels, UI chrome, card labels, mockup text.

When added text is allowed, keep it short, readable, and in the selected language. Do not invent prices, discounts, ratings, sold counts, sales volume, claims, certifications, badges, marketplace IDs, URLs, or volatile marketplace copy unless the user explicitly provided those exact words.

Product markings, labels, and brand marks are not added storyboard text. Preserve them when they are part of the referenced product, even when `image_text_mode` is `no_text`.

## Physical Text, Pattern Text, And Overlay Text Distinction Rule

Distinguish:
1. Physical product text/pattern text: printed, woven, embroidered, engraved, molded, or stitched onto the product. Preserve when visible and commercially relevant.
2. Marketplace/editorial overlay: sale badges, price bubbles, measurement arrows, app UI, watermarks, product listing captions, Thai promotional copy, graphic callout boxes. Exclude unless explicitly requested.
3. Background incidental text: tiny text on books, bottles, packages, or room props. Avoid emphasizing it and do not invent new text.

For mats/rugs, printed/woven letters such as WELCOME or alphabet marks are part of the product pattern and should be preserved as best as possible.

## Watermark, Marketplace Overlay, And Reference-Image Text Exclusion Rule

Before writing `VISIBLE MARKING LOCK`, classify visible text as physical product marking or non-product overlay.

Only preserve physical markings:
- sewn tags, fabric labels, engraved logos, metal badges.
- care labels, safety labels, underside stickers, warranty stickers, SKU stickers, assembly labels physically present.
- packaging text only when packaging is part of the requested scene.

Exclude non-product overlays:
- marketplace logos, corner watermarks, Thai titles, brand banners, measurement arrows, sale badges, price labels, UI captions, or listing graphics.

## Marketplace Product Metadata Rule

When Media Studio supplies marketplace metadata fields such as `product_shop_id`, `product_item_id`, `product_source_url`, `marketplace_platform`, `product_shop_name`, or `product_title`, treat them as source metadata for planning and downstream video workflows.

Use metadata to:
- identify the exact ecommerce item and avoid mixing references from unrelated products.
- understand product title/category/use case when the visual reference is ambiguous.
- preserve shop/item lineage in the prompt notes or planning context when useful for video generation handoff.
- choose scenes that fit the product title and marketplace category, while still letting product images define visual appearance.

Do NOT:
- render shop ID, item ID, URLs, product titles, shop names, platform names, or marketplace labels as visible text in the generated image.
- treat marketplace title text as a physical marking on the product.
- let marketplace metadata override the product reference images for geometry, color, material, scale, or visible details.

If multiple marketplace images share the same shop/item IDs, treat them as references for the same product. If shop/item IDs conflict, rank current product-image relevance first and avoid blending unrelated products.

## Character Reference Lock Rule

When a recognizable person reference is supplied, the prompt MUST anchor identity to the reference image without inventing a detailed facial or ethnicity description.

Use this structure:
`CHARACTER REFERENCE LOCK: keep the exact person from the character reference image; do not replace with a generic model or stock-photo face; do not change age, facial maturity, hairstyle, hair length, hair color, wardrobe continuity, or distinctive identity cues.`

Do not write unnecessary text such as ethnicity labels, face-shape descriptions, eye/nose details, beauty judgments, or guessed biographical traits. The image reference already carries identity. The text prompt should only prevent common drift.

Whenever a generated image intentionally includes a person, choose a face-readable camera angle by default: front-facing or three-quarter view, sharp focus, well lit, unobstructed, and large enough to recognize. Avoid back-of-head, over-shoulder with no face, fully side/rear angles, hidden/cropped faces, or people looking fully away from camera unless the frame is explicitly product-only, hands-only, or partial-body without recognizable identity.

If identity preservation is not important for a product-detail frame, prefer hands-only, side/back/over-shoulder, or partial-body interaction instead of describing or inventing a new face.

## 3x3 Human Reference And Clear Face Rule

When the output is a 3x3 storyboard or 9-frame storyboard grid and `reference_character_images` include a recognizable person, the storyboard MUST include the referenced person in some frames to anchor real scale, use, and lifestyle context. Do not put a person in every frame; keep enough frames product-only for geometry, material, and functional details.

Minimum human-frame coverage for 3x3:
- include the referenced person in at least 2 of 9 frames when a relevant character reference is supplied.
- one person frame must be a clear face establishing or lifestyle frame with the referenced product visible.
- one additional person frame must show product use, access, scale, placement, sitting/reaching/resting/opening/organizing, or another product-relevant interaction.

For 3x3 person frames, the face must be clear enough to preserve identity: front-facing or three-quarter face, sharp focus, well lit, unobstructed, and large enough to recognize. Do not count these as valid identity/person frames: back of head, over-shoulder with no face, tiny face, cropped-off face, face hidden by hair/hands/product, sunglasses/mask, heavy shadow, motion blur, profile too far from camera, or a person looking fully away from camera.

Every person frame must include `CHARACTER REFERENCE LOCK` and must say: "same referenced person, clear visible face, front-facing or three-quarter camera angle, identity locked, no face swap, no generic model." If the model cannot preserve a clear referenced face, rewrite that panel as product-only, hands-only, or partial-body-with-product without a visible face. Never invent a new visible face.

The referenced product must remain visible in every required person frame. A person-only portrait, fashion frame, or lifestyle frame that hides the furniture is invalid. The person should demonstrate scale, contact, use, function, installation, reach, comfort, or lifestyle benefit while the product geometry remains readable.

## Required Prompt Block Order

For each generated prompt, use this order:
1. `OUTPUT FORMAT LOCK` - aspect ratio, single image vs storyboard, exact grid when requested, no captions/labels unless explicitly requested.
2. `TEXT RENDERING POLICY` - explicitly say no added visible text for non-infographic defaults; for `info_graphics_realistic` or `info_graphics`, require large concise infographic text with one headline and 2-4 key points.
3. `REFERENCE ROLE LOCK` - product images are product truth, character images are identity truth, environment images are scene truth only.
4. `CHARACTER REFERENCE LOCK` - only when a recognizable referenced person appears.
5. `PRODUCT REFERENCE LOCK` - exact category, silhouette, construction, color/material/finish, visible markings.
6. `PRODUCT SCALE LOCK` - required in every prompt; use numeric dimensions if supplied, otherwise infer compact/full-size/table-height/storage-height/floor-level classification and physical proportions from the product reference.
7. `STORYBOARD GRID LOCK` - mandatory for storyboard requests; exact grid, equal panels, borderless, no single-frame fallback.
8. `SHOT-BY-SHOT STORYBOARD PROMPT` - one frame per mapped Storyboard Guide/Voiceover beat; include action, spoken meaning, product role, camera, lighting, composition, and per-frame fidelity notes. Do not output a single generic `SCENE DESCRIPTION` block when explicit shot inputs exist.
9. `NEGATIVE CONSTRAINTS` - no redesign, no recolor, no wrong scale, no invented text, no anatomy errors.
10. `QA BEFORE OUTPUT` - rewrite internally if product, scale, character, storyboard, or environment fidelity fails.

Do not output analysis or QA notes as visible text inside generated images.

Any final prompt that has product references but lacks both `PRODUCT PHYSICAL PROPORTION LOCK` inside `PRODUCT REFERENCE LOCK` and a separate `PRODUCT SCALE LOCK` block is incomplete. Rewrite it before returning it to Media Studio.

## Category-Specific Red-Flag Corrections

Before finalizing, check and correct:
- Sofa/sectional/loveseat: wrong cushion count, missing chaise, invented arms, added ottoman, changed leg style, fabric/leather swap, sectional direction reversed.
- Floor chair/floor sofa/futon/daybed: inflated into large sofa/bed, missing low scale, wrong backrest angle, invented arms, hidden fold seams, wrong pillow count.
- Dining chair/stool/bench: converted into office chair/lounge chair, wrong height, missing footrest, wrong leg count, added casters.
- Office/gaming chair: missing caster base, wrong wheel count, missing armrests/headrest/lumbar support, mesh converted to solid upholstery.
- Table/desk: tabletop shape changes, wrong leg/base count, pedestal replaced by four legs, drawers invented or removed, wrong material/edge thickness.
- Cabinet/storage: drawer/door/shelf count drift, handles moved, open shelves closed, sliding doors hinged, wrong plinth/leg base.
- Shelving/rack/cart: tier count changes, caster count wrong, basket lips disappear, narrow rack becomes built-in.
- Bed/headboard/bunk/loft: headboard shape changes, rail/ladder/guard missing, storage invented/removed, scale becomes hotel bed.
- Outdoor/rattan/cane: weave becomes generic fabric, frame disappears, cushions recolor, metal tube becomes wood.
- Kids/nursery/pet: safety rails/platforms/scratch posts/rounded edges missing, scale becomes adult furniture.
- Stone/glass/acrylic/metal furniture: material becomes generic wood/plastic, transparency/reflection wrong, marble/granite/terrazzo confused.
- Floor textile: pattern disappears, mat becomes blanket/towel/plain carpet, product too tiny to inspect, room appears without mat.
- Hardware: hardware becomes full furniture, screw holes disappear, bracket hidden, room decor replaces product.

Any red-flag failure is fatal and requires rewrite.

## Prompt Quality Loop And Fatal QA Gates

Before returning prompts, silently run a quality loop. Draft the prompt, compare against all current references and dimensions, then rewrite weak frames. Repeat until no fatal issue remains.

Fatal QA gates:
- Output format: single-frame prompts must not describe a collage/contact sheet/inset thumbnails/measurement arrows/visible labels unless explicitly requested.
- Storyboard enforcement: requested grid/storyboard must produce the requested number of panels, not one hero image.
- Frame geometry: storyboard must enforce equal-sized frames and a regular grid.
- Borderless completeness: storyboard prompt must include both positive borderless declaration and explicit no-divider/no-gutter/no-border prohibitions.
- Product-source dominance: product must follow current product reference, not environment furniture or generic showroom archetype.
- Product visibility completeness: every frame in a 2-4 panel storyboard and at least 8 of 9 frames in a 3x3 storyboard must show the referenced product; product-absent mood/setup frames are fatal unless explicitly requested.
- Required lock completeness: product-reference prompts must contain `PRODUCT PHYSICAL PROPORTION LOCK` and a separate `PRODUCT SCALE LOCK`; missing either one is fatal.
- Current-reference contamination: no old products, old rooms, old generated outputs, unrelated people, beach/fashion/travel frames unless supplied in current run.
- Irrelevant frame rejection: every panel must contribute to product story, detail, function, room placement, scale, or customer journey.
- Person-with-product coverage: if product and relevant character references are supplied for 3x3, include at least 2 referenced-person frames: one clear visible-face establishing/lifestyle frame with product visible and one clear visible-face person-product interaction frame.
- Storage furniture fidelity: drawer count, handle position, lock/keyhole placement, material, and base stance must match reference.
- Open shelving/table fidelity: open side tables, open shelves, and compact side tables must not become closed cabinets, tall cube organizers, thick-sided towers, or full-height bookcases; preserve open sides, shelf count, board thickness, support count, and squat/table-height footprint from the reference.
- Variant consistency: multi-reference same-model products must preserve shared geometry and one chosen colorway throughout a single-SKU storyboard; no switching colorway/material between frames unless collection mode is explicit.
- Cross-panel scale continuity: every product-visible storyboard frame must inherit the same furniture footprint envelope, physical aspect ratio, tier/shelf/drawer/cushion spacing, leg/post thickness, and class-level scale from `PRODUCT REFERENCE LOCK` and `PRODUCT SCALE LOCK`; close-up frames may crop tighter but must not alter the product's real proportions.
- Watermark exclusion: reference-photo overlays are not product markings.
- Convertible furniture configuration: do not lose short legs, low scale, hinge/backrest/slab structure, or gain armrests/sectional modules.
- Wrong product category, scale, color, material, finish, geometry, cushion grid, tier count, shelf count, drawer/door layout, caster/leg count, arm/back structure, fold/hinge design.
- Environment reference overpowering the product reference.
- Character reference replaced by generic model when face is visible.
- Missing clear referenced-face coverage in 3x3 when character references are supplied.
- Props/hands/books/blankets/plants/crops hiding defining product details.
- Unwanted visible text, captions, labels, watermarks, UI boxes, or ad typography.

## Media Studio Maintenance Acceptance Checklist

This checklist protects the skill from the failure that previously reduced it to a short native skeleton.

Before any maintenance apply is considered successful:
- `SKILL.md` and `skill.md` must remain mirrored.
- Existing frontmatter keys must be preserved unless explicitly deprecated.
- This file must keep the major sections for reference role lock, current-input-only rule, forensic vision, furniture geometry/material lock, storyboard grid lock, floor textile fidelity, taxonomy, prompt block order, and fatal QA gates.
- Maintenance may add narrowly scoped rules, but must not replace this prompt system with a generic native bundle template.
- The resulting markdown must be long enough to preserve product-fidelity behavior and must not shrink to a short summary.
- Proposed changes from Media Studio must be visibly represented in edited markdown.

If the maintenance proposal requests geometry/material improvement, verify that the markdown contains explicit instructions for countable parts, material category, color/finish/texture, support/base, hardware, and no-go substitutions.

If the maintenance proposal requests storyboard grid improvement, verify that the markdown contains exact panel count, equal frame dimensions, borderless grid, no divider/gutter/margin, and per-panel uniqueness constraints.

## Universal Furniture Coverage QA

Before finalizing any prompt package:
- Correct category: product category/subtype matches reference, not background or prettier archetype.
- Correct count: cushions, drawers, doors, shelves, legs, wheels, arms, panels, pillows, hooks, rails, handles, hinges, brackets, modules match reference.
- Correct small parts: tags, zippers, seams, piping, casters, caps, glides, screws, connector plates, pulls, knobs, shelf pins, rails, brackets, trim are not lost or invented.
- Correct material/color: every major and secondary visible part preserves referenced material, finish, texture scale, pattern direction, and colorway.
- Correct scale: numeric dimensions when supplied, inferred product-reference proportions when dimensions are absent, and human/room scale are plausible and consistent across every product-visible panel.
- Correct support/contact: legs, casters, plinths, floor pads, wall mounts, and feet contact surfaces naturally.
- Correct storyboard format: requested grid produces requested number of equal-sized panels.
- Correct product persistence: same product appears in most storyboard panels and never changes category.
- Correct environment role: room images supply lighting/architecture/mood, not product substitution.
- Correct text policy: no captions, numbers, labels, watermarks, or promotional copy unless explicitly requested.
- Correct occlusion: people, props, plants, pillows, blankets, or decor do not hide defining product structure in hero/detail panels.

If any item fails, rewrite the prompt before output.
