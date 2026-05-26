---
name: cosmatic-reference-storyboard
description: Imported from shared skill bundle (cosmatic_reference_storyboard.zip)
category: image_prompt_generation
version: 1.0.8
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

Input `storyboard_guide` is optional. When it is blank, keep the normal skill behavior.

When `storyboard_guide` is provided, it becomes the creative direction contract for the output. Every generated prompt or frame must follow the guide's shot order, timing, story beat, product-use action, camera intent, and continuity. Do not replace the guide with a new story, do not skip required beats, and do not introduce conflicting actions or claims. Use the guide to decide the composition and moment of each frame while still preserving all product, character, label, and environment reference locks below.

For start/stop-frame workflows, interpret the guide as one video shot: create a start-frame prompt that matches the beginning of that shot and a stop-frame prompt that matches the end state of that shot. The stop frame should be visually compatible as the next shot's start frame when Media Studio chains shots together.

Every generated prompt MUST independently repeat:
- Character identity lock
- Character reference lock block when people appear
- Product geometry lock
- Product reference color lock
- Product label transcription lock
- Environment consistency lock
- Industrial design preservation rules
- Negative constraints

This prevents image drift across storyboard frames.

Recommended mode:
separate_prompt_per_frame

## Multi-Frame Storyboard Visual Rule

When `generation_mode` is `multi_frame_storyboard`, create a prompt for a clean image-only storyboard/contact sheet.

Use `storyboard_layout_preset` together with `aspect_ratio` as the canvas contract:
- `canvas_1_1_*` presets require the final full storyboard image to be 1:1.
- `canvas_16_9_*` presets require the final full storyboard image to be 16:9.
- `canvas_9_16_*` presets require the final full storyboard image to be 9:16.
- `canvas_4_3_*` presets require the final full storyboard image to be 4:3.
- `canvas_3_4_*` presets require the final full storyboard image to be 3:4.
- `*_exact` presets require every frame to match the stated per-frame ratio exactly.
- `*_crop_safe` presets may have non-exact internal frame ratios, but every frame must include generous safe margins so each frame can be cropped after generation into 1:1, 16:9, or 9:16 without cutting off the product, face, hands, packaging, logo, or key action.
- If `storyboard_layout_preset` conflicts with `aspect_ratio`, prioritize the canvas ratio encoded in `storyboard_layout_preset` and explicitly mention that canvas ratio in the generated prompt.
- If `storyboard_layout_preset` is `auto`, choose the layout from the selected `aspect_ratio`: 1:1 uses 2x2 or 3x3 square frames, 16:9 uses 2x2 or 3x3 exact wide frames when exact per-frame ratio matters and 3x2 crop-safe frames for six-frame storyboards, 9:16 uses 2x2 or 3x3 exact vertical frames when exact per-frame ratio matters and 2x3 crop-safe frames for six-frame storyboards, 4:3 uses 4x3 square frames, and 3:4 uses 3x4 square frames.

When describing a multi-frame storyboard, state the exact grid, total frame count, final canvas aspect ratio, and whether the frames are exact-ratio or crop-safe. The storyboard must be one single generated image containing the requested grid.

The rendered image MUST NOT contain:
- frame numbers
- captions
- text boxes
- lower-third description bars
- subtitles
- overlay labels
- storyboard layout typography or visible frame descriptions

Product packaging text, logos, and brand markings are not storyboard labels. Preserve them when they are part of the referenced product.

Descriptions may exist in the generated prompt text to guide each frame, but they must not be requested as visible text inside the generated storyboard image.

## Product Fidelity Rule

Every generated prompt MUST explicitly preserve the exact product type shown in the reference images.

Reference product images are the highest-priority source of truth. Cinematic style, beauty mood, environment lighting, props, and upscale art direction may change the scene around the product, but they MUST NOT redesign, recolor, rebrand, relabel, resize, or materially reinterpret the product itself.

For bottle / cosmetic / packaging products, preserve:
- bottle silhouette and proportions
- cap color, cap shape, hinge/flip-top geometry, and top profile
- transparent or translucent material qualities
- liquid fill impression, highlights, and refraction when visible
- front/back label placement, label hierarchy, logo placement, barcode area, colored bands, and fine-print areas
- visible package text, line breaks, typography hierarchy, formula name, language-specific text, weight/volume text, trademark marks, and official-store or authenticity badges when they are part of the product reference
- product color palette and packaging finish
- full product visibility in every required product frame

## Exact Product Geometry And Scale Lock

Every generated prompt MUST include a strict product geometry lock derived from the product reference images. The geometry lock is more important than making the product look like a common cosmetic category archetype.

Preserve the product's:
- height-to-width ratio
- short, tall, squat, wide, slim, chunky, rounded, tapered, square, oval, cylindrical, or rectangular body character
- cross-section shape, such as circular, oval, square, rounded-square, rectangular, flat-sided, faceted, or fully cylindrical
- curvature continuity, including whether the body has smooth round sides, flat panels, sharp edges, chamfered corners, ribs, grooves, seams, or facets
- cap-to-body height ratio
- cap diameter relative to body diameter
- shoulder, neck, rim, thread, hinge, pump, wand, sponge-tip, doe-foot, applicator, compact, palette, or jar geometry
- base thickness, bottom profile, top profile, and visible opening size
- orientation and pose of the package relative to hands or props
- number of visible product units and their size relationship to one another

If the reference product is short and squat, keep it short and squat. Do not stretch it into a tall slim tube, lipstick, lip-gloss bottle, serum bottle, mascara tube, perfume bottle, or any other standard cosmetic silhouette. If the reference product is tall and slim, keep it tall and slim. Do not compress it into a jar or compact.

If the reference product is round, circular, oval, or cylindrical, the generated product MUST remain round/cylindrical with smooth continuous curved sides. Do not turn a round bottle, vial, jar, cap, or compact into a square, rectangular, boxy, flat-sided, faceted, prism-like, hexagonal, octagonal, or rounded-rectangle package unless those flat sides or corners are visibly present in the reference product.

If the reference product has a circular cap or cylindrical lid, preserve the cap as circular/cylindrical. Do not replace it with a flat rectangular cap, squared cap, angular cap, or boxy closure. Preserve circular rims, rings, openings, screw threads, and bottom profiles as circles/ellipses in perspective, not as rectangles.

For liquid blush / sponge-tip / cushion-tip products, preserve the exact package architecture shown in the reference:
- the body height, body width, and rounded cylinder proportions
- the metallic cap height and diameter
- the screw neck/rim/threading when opened
- the short inner applicator stem or sponge/cushion tip scale
- the relationship between the open cap and product body
- any box or secondary package proportions when visible

Do not reinterpret a short HERORANGE-style sponge-tip liquid blush as a tall soft-touch liquid blush tube. Do not replace a short cylindrical vial with a taller matte bottle just because it looks more premium. Do not lengthen the product to fit a fashion editorial layout.

## Exact Product Color And Label Lock

Every generated prompt MUST include a strict product color lock derived from the reference images. Color fidelity is more important than cinematic style, luxury mood, warm lighting, or matching the environment palette.

When `reference_product_images` are supplied, every prompt and every frame description MUST start its product section with a `PRODUCT REFERENCE LOCK:` block before the scene description. The block MUST restate the canonical product colors and materials component by component:
- container/body color and material
- lid/cap color and material
- label/printed logo color
- visible accent colors only where they appear in the reference
- explicit "do not recolor" negatives for likely drift colors

Example for a white/translucent cosmetic jar reference:
`PRODUCT REFERENCE LOCK: keep the exact referenced product: white/frosted white or translucent jar body, white cap/lid, dark warm red-brown printed YerPall logo/text only, no amber glass, no brown glass, no black jar, no gold lid, no rose-gold lid, no beige/pink/champagne product tint, warm bathroom lighting may affect the room but must not recolor the product packaging.`

Do not rely on generic phrases such as "same product" or "match reference" alone. The prompt must name the product's visible colors and materials in words so the image model has a hard local instruction in every frame.

For each referenced product, preserve:
- exact container body color and material, including white, frosted white, clear, translucent, glossy, matte, pearl, plastic, glass, paper, metal, or foil finish
- exact lid/cap color and material separately from the container body
- exact logo color, brand wordmark color, typography placement, and label hierarchy
- exact visible label text blocks, line count, approximate spacing, and weight/volume text when visible
- exact colored bands, stickers, seals, badges, gradients, and accent stripes when present
- overall product white balance as perceived in the reference, without applying scene color grading to the product surface

If the reference product is a white or translucent cosmetic jar, tube, bottle, compact, or box, the generated product MUST remain white or translucent as shown. Shadows on the product may be light gray only; they must not become brown, amber, bronze, gold, beige, peach, or warm tinted. Do not turn the container, lid, cap, label, or printed areas into blush pink, beige, peach, champagne, bronze, copper, rose gold, gold metal, amber glass, brown glass, black, or any luxury recolor unless that color is visibly present on the exact referenced product.

If the reference shows warm brown, copper-brown, red-brown, black, or dark gray printed typography on a white package, preserve the print color as print only. Do not spread that accent color onto the package body, lid, jar, cap, or background-facing product surfaces.

Never infer product color or material from a luxury scene. A warm bathroom, candlelight scene, gold faucet, marble counter, spa room, sunset, or premium cosmetic mood may change only the surrounding environment. It must not change a white package into amber glass, a white cap into a gold lid, a translucent body into brown glass, or a printed accent into full-product recoloring.

If exact product color cannot be inferred confidently, keep the closest neutral/light product appearance from the clearest product reference and avoid stylized recolor. Do not invent a new premium edition, darker jar, metallic cap, tinted glass, or alternate colorway to make the scene look more expensive.

If the reference images conflict, choose the clearest hero product reference as the canonical product and keep it consistent. Do not average conflicting references into a new product colorway. Do not invent a larger size, different weight, different product line name, new formula text, new SKU, or new premium edition.

The prompt MUST explicitly forbid:
- product recoloring
- product elongation or compression
- changing the product's height-to-width ratio
- changing the product's cross-section shape
- turning round/cylindrical packaging into square, rectangular, boxy, faceted, or flat-sided packaging
- turning circular caps, lids, rims, openings, or bases into angular or rectangular forms
- changing cap-to-body ratio
- replacing a short/squat package with a tall/slim package
- replacing the exact package architecture with a generic cosmetic tube, lipstick, lip gloss, mascara, serum, perfume, jar, or compact silhouette
- rose-gold or metallic redesigns
- warm color cast applied to the product body
- changing a white/translucent container into pink, peach, beige, bronze, copper, gold, amber glass, brown glass, black glass, or smoky glass
- changing a white cap/lid into gold, champagne, bronze, copper, rose gold, beige, black, or brown unless visible in the reference
- turning dark red-brown printed text on a white package into a brown product body
- changing label text hierarchy, weight/volume text, logo placement, or brand color
- adding fake labels, fake badges, fake seals, or invented typography
- replacing the referenced product with a prettier but different luxury product

When using warm spa, bathroom, candlelight, sunset, or luxury beauty lighting, keep the environment warm if desired but keep the product's actual package color neutral and reference-accurate. State this separation in the prompt: "warm scene lighting, but no warm tint or recolor on the product packaging; product color must match the reference, not the room color grade."

If multiple product references show different variants, formulas, scents, shades, palette layouts, or package colors, do not blend them into a single mixed product. Either choose one clear hero variant and keep it consistent in every frame, or intentionally show a neat multi-variant lineup while preserving each variant's distinct packaging color, container/case shape, cap/lid/closure, palette pan layout, formula or shade text, and label layout.

## Exact Product Label Transcription Lock

Product label fidelity is a fatal requirement for this skill. A generated storyboard is not acceptable if it preserves only the brand name but drops the visible formula name, secondary lines, non-English text, weight/volume, badges, stickers, or other readable package details from the product reference.

If `product_label_text` is supplied, treat it as the canonical label transcript. Copy those strings exactly into every `PRODUCT REFERENCE LOCK:` block and into every frame prompt where the product front label is visible. Keep capitalization, punctuation, symbols, line order, trademark marks, non-English scripts, and units exactly as supplied. Do not translate, paraphrase, shorten, romanize, or invent replacement label text.

If `product_label_text` is not supplied, inspect the product reference images and transcribe all clearly visible product/package text before writing the storyboard prompt. Include a compact `VISIBLE LABEL TEXT TO PRESERVE:` list in the output prompt package. For the provided YerPall jar example, the lock should preserve the visible hierarchy rather than only the brand:
- `YERPALL™`
- `INTENSIVE ACTIVE`
- `GINSENG HYA NIGHT CREAM`
- Korean line visible under the formula name
- `10 g`
- any retailer/authenticity badge text only if the final generated frame intentionally includes that retail frame, not as a product-label replacement

If `label_fidelity` is `full_label_lock`, every hero, macro, marketplace, hand-held product, product-on-vanity, and product-use frame must request the full visible label hierarchy. If `label_fidelity` is `brand_and_key_lines`, preserve the brand plus formula/product-name and weight/volume at minimum. If `label_fidelity` is `layout_only_when_tiny`, only relax text readability when the product is genuinely small in frame; do not relax hero or close-up frames. If `label_fidelity` is `auto`, choose `full_label_lock` whenever the user provides `product_label_text`, uploads a clear product reference with readable packaging text, or asks for ad/marketplace/product-detail output.

Every product frame must include a label instruction with this structure:
`LABEL TRANSCRIPTION LOCK: front label must remain readable with the same line hierarchy: [brand line] / [secondary line] / [formula or product-name line] / [non-English line if visible] / [weight-volume line if visible]; do not reduce the label to brand-only text; do not omit formula, Korean/Thai/Japanese/Chinese/English lines, 10 g/ml/oz, badges, seals, or small visible label blocks when the product is close enough to read.`

When the product is small, partially turned, motion-blurred, or background-only, it is acceptable for fine print to be less readable, but the prompt must still preserve the correct label layout and must not replace it with a simplified brand-only mockup. At least the hero product frame and one close-up/product-detail frame must show the full readable front label hierarchy.

Never ask the image model to create a clean blank jar and then add only the logo. Never simplify a detailed retail/product label into a minimalist luxury label unless the reference product is actually minimalist. Do not invent fake formula text, fake size text, fake certification marks, or fake retailer badges.

## Label Readability Composition Rule

When the user asks for a storyboard/contact sheet and product label fidelity matters, do not make every product appearance a tiny lifestyle prop. The prompt package must allocate enough visual area for label text:
- include at least one dedicated front-facing product label verification frame
- in that frame, the product front label must face camera nearly straight-on, with minimal perspective warp
- the jar/bottle/box must occupy at least 45% of the frame height or width, whichever makes the label larger
- use macro/product-detail framing, sharp focus, no motion blur, no frosted glare crossing the text, no fingers covering text, no props overlapping text
- keep the full label hierarchy readable on the package itself: brand, secondary lines, formula/product name, non-English line, and weight/volume
- if the storyboard has 6+ panels, do not expect all tiny lifestyle panels to show micro text; instead make at least two panels product-detail/hero panels where the label is large enough to render

Do not create separate ad headlines, claim typography, ingredient bullet lists, retail banners, or poster text around the product unless the user explicitly asks for a designed ad poster. External text such as `HYALURONIC ACID 4`, ingredient lists, badges, or corner logos must not replace or compete with the actual package label. The skill's default output is an image-only storyboard, not a new graphic-design ad layout.

For the YerPall reference, never change the formula into `VITAMIN NIGHT CREAM`, `HYALURONIC ACID`, or another invented product line. The canonical product label remains `YERPALL™ / INTENSIVE ACTIVE / GINSENG HYA NIGHT CREAM / Korean line / 10 g` unless the user supplies a different `product_label_text`.

Before finalizing the output, perform a Label Completeness QA check. Fail and rewrite if any frame that shows the product front label omits visible canonical label lines, changes line order, changes the formula name, loses the weight/volume text, removes non-English label text, changes `YERPALL™` into `YerPall`, or replaces the real label hierarchy with a generic premium logo-only design.

For mechanical or appliance products, preserve:
- visible product silhouette and proportions
- control/button layout, count, spacing, and shape
- grille, cage, base, pole, motor housing, handles, hinges, or other defining geometry
- logo/brand placement and material finish
- all key industrial-design details

The prompt MUST forbid redesigning the product, changing the container/product shape, changing cap/base/button layout, inventing new controls or packaging, changing label hierarchy, adding fake labels, changing brand markings, hiding the product behind props, or replacing the product with a different item.

Before finalizing the output, perform a Product Fidelity QA check. Product Color Fidelity is a fatal QA gate: if any frame description implies a different product silhouette, cross-section shape, curvature, roundness, height-to-width ratio, cap-to-body ratio, package architecture, package color, lid material, label color, brand typography, weight/volume, or formula text than the product references, do not output that prompt. Rewrite that frame until the product remains reference-accurate. For white/translucent product references, fail the QA if the prompt allows amber/brown/black glass, gold/bronze/rose-gold lids, beige/pink/champagne tint, or warm color cast on the product packaging.

## Character Identity And Face Lock

Reference character images are identity anchors, not mood-board images. Every generated prompt that includes a person MUST preserve the same person from the character reference images unless the user explicitly requests a different person.

When `reference_character_images` are supplied, every prompt and every frame description that shows a face or recognizable person MUST include a `CHARACTER REFERENCE LOCK:` block before the scene description. The block MUST restate the visible identity anchors from the reference image in concrete words:
- face shape, jawline, cheekbone structure, chin, and forehead proportion
- eye shape, eyelid fold, eye spacing, brow shape, and gaze character
- nose bridge/tip, nostril shape, mouth width, lip shape, smile character, and dimples or smile lines when visible
- skin tone, undertone, texture, freckles, moles, beauty marks, pores, or other distinctive marks when visible
- hair color, hair length, hairline, hair part, volume, curl/wave pattern, and styling
- apparent age range, body build, wardrobe, jewelry, and makeup when they are continuity anchors

Do not rely on generic phrases such as "same woman", "same model", or "match reference" alone. The prompt must name the face and hair anchors so the image model has a hard local identity instruction in every frame where the person appears.

Example:
`CHARACTER REFERENCE LOCK: preserve the referenced woman's exact face likeness: soft oval/heart face shape, youthful facial proportions, long dark brown wavy hair with side part and high volume over one side, large almond eyes with similar spacing and eyelid fold, defined dark brows, small straight nose, full soft lips, gentle smile with subtle dimples, smooth warm skin tone, beige blazer and white inner top continuity; no different model, no older face, no short bob haircut, no generic beauty influencer.`

Preserve the character's:
- facial identity and overall face likeness
- face shape, jawline, chin, cheekbone structure, forehead proportions, and facial symmetry/asymmetry
- eye shape, eye spacing, eyelid fold, brow shape, brow thickness, brow angle, and gaze character
- nose bridge, nose tip, nostril shape, mouth width, lip shape, cupid's bow, smile line, and teeth visibility if shown
- skin tone, undertone, skin texture, freckles, moles, beauty marks, acne marks, scars, pores, and other distinctive facial details when visible
- hair color, hairline, hair part, haircut length, curl/wave pattern, volume, flyaways, and styling
- age range, gender presentation, ethnicity cues, face proportion, and body build
- wardrobe, jewelry, nail style, and makeup style when they are intended continuity anchors

If multiple character references show the same person in different angles, combine them into one consistent identity. Do not average them into a generic model face. If references show different people, choose one clear hero character only when the user asks for one recurring character, or explicitly describe multiple distinct people without blending their identities.

If the reference has long hair, do not replace it with a bob, short haircut, different hair part, different hairline, or different volume unless the user explicitly asks for a hairstyle change. If the reference has a youthful soft face, do not age the person up, sharpen the face into a different structure, narrow/widen the jaw, alter the eyes, or change the smile into a different person's expression. Wardrobe color may be adapted only when not used as a continuity anchor; otherwise preserve it.

The prompt MUST explicitly forbid:
- changing the person's face into a different model
- beautifying into a generic influencer face
- changing face shape, eye spacing, nose, lips, jawline, skin tone, hairline, or age
- changing hair length, hair part, hair volume, or hairstyle into a different character cue
- changing a youthful face into an older face or a different facial maturity
- changing ethnicity cues or making the person look like a different nationality/ancestry
- smoothing away distinctive marks that define identity
- using the character reference only as a loose style, mood, pose, or makeup reference
- replacing the referenced person with a stock beauty model

For skincare, cosmetic, beauty, and product-use storyboards, keep the same character identity across every frame where the person appears. The person can change pose, expression, camera angle, and lighting, but must remain recognizably the same person. If the model cannot preserve identity confidently in a frame, prefer a product-only shot, hands-only shot, or partial face crop that does not invent a new face.

When the product requires application on a face, the prompt must say: "same referenced person, face identity locked, no face swap, no generic beauty model, preserve facial proportions, hair length/style, age impression, smile character, and distinctive features from the character reference."

Before finalizing the output, perform a Character Fidelity QA check. Character Identity Fidelity is a fatal QA gate: if any frame description implies a different face, different age, different hair length/style, different hairline, different facial proportions, different smile character, different ethnicity cues, or a generic beauty model replacing the reference person, do not output that prompt. Rewrite that frame until the character remains reference-accurate. If the image model may not preserve identity confidently in a frame, change that frame to product-only, hands-only, over-shoulder, back-of-head, partial-face crop, or detail shot instead of inventing a new face.

## Product Usage Intelligence Rule

The skill MUST infer how the referenced product is actually used and build storyboard beats around realistic usage.

For every multi-frame storyboard:
- identify product category from the references
- infer normal handling and application steps
- include at least two frames that show product interaction, not just product placement
- include a believable result/benefit frame
- avoid impossible or category-wrong use

Examples:
- Eyeliner / liquid liner: open cap, show applicator or pen tip, draw controlled line along upper lash line, close eye/eyelid detail, show defined eye result. Do not apply to lips or cheeks.
- Lipstick / lip tint / lip gloss: open cap or wand, apply to lips, show lip close-up and color payoff or moisturized result. Do not apply to eyes or face skin.
- Compact powder / cushion / pressed powder: open compact with mirror, use puff/sponge/brush, pat onto cheeks or T-zone, show soft matte/even complexion result. Do not pour or smear like liquid skincare.
- Eyebrow pencil / brow gel / brow mascara / brow pen: use spoolie, brush, or pencil tip, fill and shape brow hairs with short hair-like strokes, show brow close-up and natural defined-brow result.
- Eyeshadow palette / eye makeup palette: open palette, pick up a matte or shimmer shade with brush/applicator, apply gently to eyelid/crease/lower lash line or outer corner, blend softly, show polished finished eye makeup. Do not place powder inside the eye or use it as lipstick/skincare.
- Eyelash mascara: remove wand, brush lashes from root to tip, show eye/lash close-up and lifted separated lashes result. Do not confuse eyelash mascara with brow mascara.
- Face cream / moisturizer / sunscreen: open jar/tube/pump, take small amount with fingertip/spatula/back of hand, dot/spread on cheeks/forehead/neck, show hydrated/dewy/protected skin result.
- Serum / essence / ampoule: use dropper/pump, dispense a few drops onto palm/fingertips, press/pat into skin, show glow/hydration result.
- Toner / essence toner / glycolic acid toner / exfoliating acid toner: open cap/nozzle, dispense a small amount onto cotton pad or palm, gently sweep/pat across face while avoiding eye and lip areas, show smoother brighter skin texture result. Do not scrub harshly or pour directly over the face.
- Acid toner care: for glycolic acid, salicylic acid, AHA, BHA, PHA, or other exfoliating toners, show gentle thin-layer use, avoid eye area/lips/irritated skin, do not scrub harshly, and imply sensible routine care such as hydration and daytime sunscreen.
- Micellar cleansing water / makeup remover: open flip cap, pour onto cotton pad, gently wipe makeup or cleanse skin, place bottle beside cotton pad on vanity, show fresh clean-skin result. Do not treat it as perfume, lotion, drink, or hair product.
- Facial serum: open dropper/pump, dispense a small amount, apply to face, pat into skin, show hydrated glow.
- Food/drink: open/serve/eat/drink naturally, show texture and enjoyment.
- Cleaning product: apply to correct surface/tool, wipe/scrub, show clean result.

The storyboard should feel like a smart mini usage sequence: establish product, show hero detail, show real interaction, show application/use, show sensory/benefit moment, close with aspirational result.

## Hand Anatomy And Product Grip Rule

For any frame that shows hands, the prompt MUST protect hand anatomy and realistic grip.

Require:
- natural left/right hand orientation
- correct palm direction and plausible wrist rotation
- correct thumb placement
- exactly five fingers per visible hand
- no fused fingers
- no extra fingers
- no duplicated hands
- no reversed palms
- no broken or rubbery joints
- product grip that matches real use

Grip examples:
- eyeliner and eyebrow pencils are held like a pen
- mascara and lip wands are held by the handle
- compact powder is held from the edge while puff/sponge touches the face
- cotton pads are pinched naturally between fingers
- serum droppers are held vertically above palm/fingertips
- cream is applied with a simple fingertip gesture

Prefer simple readable hand poses. In close-up product-use frames, use one clearly visible active hand when possible. Avoid crossing two hands over the face, overlapping hands with bottles, or complex mirrored poses unless the anatomy remains simple and readable.
