# Furniture Reference Storyboard Skill V3.5

This skill generates high-consistency furniture reference storyboard prompts for GPT Image 2:
- single image generation
- multi-frame storyboard generation
- separate prompt-per-frame workflows

Every prompt independently repeats:
- output format lock
- reference role lock
- character identity lock when people appear
- furniture product lock
- exact furniture geometry and scale lock
- product physical aspect-ratio and visual bounding-box lock
- product scale lock in every prompt, using numeric dimensions when supplied or inferred reference proportions when dimensions are absent
- compact/portable furniture scale guard when applicable
- exact color, material, finish, marking, and construction lock
- room scale and environment lock
- industrial design, joinery, and interaction rules
- negative constraints and fatal QA gates

Optimized for furniture, interior, showroom, marketplace, home-lifestyle, compact furniture, utility furniture, and product-detail contexts.

Product reference images are the highest-priority source of truth. Interior styling may change the room around the furniture, but it must not recolor the product, change material finish, alter proportions, add/remove cushions or tiers, change drawer/door/shelf layout, change leg/caster/base structure, invent hardware, ignore dimensions, or replace the product with a generic catalog item.

When product references are supplied, every prompt/frame must include a `PRODUCT REFERENCE LOCK:` block before the scene description. The block restates the furniture category, silhouette, primary/secondary materials, upholstery or wood/metal/plastic/glass/rattan finish, hardware/caster details, visible brand/tag/marking details, and explicit no-redesign/no-recolor negatives.

Every prompt/frame must include a `PRODUCT SCALE LOCK:` block. Numeric dimensions override generic assumptions when supplied. When dimensions are absent, the prompt must infer and lock the visible product scale class, physical aspect ratio, visual bounding-box ratio, height-width-depth relationship, shelf/cushion/drawer spacing, support/base stance, and compact/full-size class from the product reference image. The prompt must also include `PRODUCT PHYSICAL PROPORTION LOCK` inside `PRODUCT REFERENCE LOCK`. Missing either lock is a fatal prompt-quality failure. For example, a compact white two-tier side shelf/table must remain a small table-height rectangular open shelf, not a tall bookcase, cube organizer, bulky cabinet, thick-sided tower, closed cabinet, or oversized shelving tower.

For short 2-4 panel storyboards, every panel must show the referenced product. Product-absent mood, floor, bed, prop, or book-only setup frames are invalid unless explicitly requested. When multiple references show the same side table in different colorways or angles, the skill uses all references as geometry evidence but locks one output colorway for a single-SKU storyboard.

The skill separates reference roles:
- product images define the product
- character images define the recurring person
- environment images define room mood, lighting, layout, floor/wall materials, and architecture only

This prevents environment references from overpowering the product reference, such as replacing a compact floor chair with a large living-room sofa or turning a narrow storage cart into a built-in cabinet.

Existing schema fields such as `product_label_text`, `label_fidelity`, and `label_readability_mode` remain compatible. For furniture, interpret these fields as visible product markings and product facts: brand tags, maker stamps, engraved logos, care labels, SKU stickers, underside labels, assembly labels, or dimensions supplied by the user. Do not force large readable text onto furniture unless it is physically present or explicitly requested.

Character reference images are identity anchors. Face likeness, facial proportions, skin tone, hairline, distinctive marks, age range, and styling continuity must stay consistent across every frame where the person appears. If identity cannot be preserved confidently, the frame should become product-only, hands-only, over-shoulder, back-of-head, partial-face crop, or detail shot rather than inventing a new face.

For 3x3 storyboard generation, if a recognizable character reference is supplied, include the referenced person in at least 2 of 9 frames: one clear visible-face frame with the product visible, and one clear visible-face person-product interaction frame. Do not count back-of-head, over-shoulder, tiny, hidden, cropped, masked, shadowed, or blurred faces as valid identity frames. Person frames must demonstrate scale, contact, use, or lifestyle benefit without hiding the furniture.

The skill includes a silent prompt quality loop. It rewrites any draft prompt that violates fatal QA gates: wrong product category, ignored dimensions, wrong inferred proportions, wrong scale, cross-panel scale drift, wrong material/colorway, changed geometry, wrong cushion/tier/shelf/drawer/door count, invented text, environment-reference contamination, character drift, or props/hands hiding key product details.


## V1.3.0 Quality Improvements

This version adds stronger guards discovered during furniture testing:
- Default single-frame outputs must be one clean photographic scene, not a collage/contact sheet.
- Product references with ecommerce overlays are parsed carefully: watermarks, Thai promo text, marketplace banners, and dimension arrows are excluded unless they are physical markings.
- Convertible furniture, floor sofa beds, futons, and daybeds preserve active configuration, hinge/fold geometry, backrest angle, pillow position, short legs, low floor clearance, and long narrow footprint.
- Measurement annotations are forbidden by default unless the user explicitly asks for a diagram or infographic.


## Default Text Behavior

The skill now defaults to **image-only output**. Unless the user explicitly asks for text inside the image, the generated prompt should suppress all extra visible text such as captions, feature callouts, frame numbers, dimension arrows, price bubbles, sale badges, Thai/English promotional copy, or infographic overlays.

Text may still be preserved when it is a **physical part of the referenced product** (for example a sewn label, engraved logo, or care tag) or when the user explicitly requests annotated product graphics, storyboards with text, ad layouts, or infographics.


## Equal-Frame Storyboard Grids

The skill now defaults storyboard outputs to **strict equal-sized frame grids**. For example, a 3x3 vertical storyboard must contain 9 panels with identical cell dimensions, uniform gutters, and aligned rows/columns. Mixed-size editorial layouts, collages, inset panels, or mosaic boards should only be generated when the user explicitly requests them.


## Storyboard Mode Enforcement

When the user selects or asks for a storyboard layout such as 3x3, 2x3, 3x2, or 2x2, the skill must output a multi-frame storyboard prompt. It must not fall back to a single lifestyle hero image. A 3x3 request requires exactly nine equal-sized panels in one final image.

## Product-Source Dominance

The current product reference image is the product truth, even if it is a small ecommerce thumbnail. Environment images define only the room. Previous uploads and previous generations must not be used unless the user explicitly includes them in the current run.

For armless daybeds/low chaise/floor-sofa products, the skill now explicitly preserves the long rectangular slab, single backrest, pillow, short wooden legs, no-armrest design, gray fabric, low scale, and exact product class instead of substituting a generic sofa or bed.


## Universal furniture taxonomy coverage

Version 1.4.0 expands the skill beyond a few furniture examples into a broad ecommerce furniture taxonomy. It adds subtype-specific fidelity guards for seating, sleeping/convertible furniture, tables, storage/case goods, office, dining/kitchen, utility, bathroom/laundry, outdoor, kids/nursery/pet, commercial, modular, and transformable furniture.

The skill now extracts countable product attributes before prompt writing: cushion count, drawer/door/shelf count, leg/base/caster count, armrest presence, panel layout, tabletop shape, backrest/headboard geometry, support structure, material/colorway, hardware, seams, stitching, weave, joinery, and functional mechanisms.

Storyboard outputs now require product persistence: for a 3x3 storyboard, at least 7 of 9 panels should clearly show the same product, and all panels must preserve the same category, material, scale, and countable structures.


## Forensic Vision And Material Precision Upgrade

Version 1.4.1 strengthens the skill so the LLM vision layer must inspect the reference product in much finer detail before writing prompts. The system now treats the product image like a **forensic evidence source**, not just a loose visual hint.

New required behavior:
- inspect both macro structure and micro details
- preserve even small visible components if they help define the product
- preserve precise material identity instead of only general shape
- preserve finish, sheen, texture scale, weave, grain, veining, and small construction details
- avoid generic substitutions when the reference indicates a specific product surface or hardware system

The skill now explicitly checks for and preserves details such as:
- zipper pulls, stitch lines, seams, welting, piping, tufting, quilting, and edge binding
- small feet, glides, caster housings, end caps, anti-slip pads, and support brackets
- handles, hinges, rails, screws, connector plates, mesh inserts, shelf pins, hooks, and label placement
- upholstery type such as fabric, faux leather, PU leather, velvet, bouclé, mesh, or genuine leather
- hard-surface materials such as wood, laminate, powder-coated metal, plastic, acrylic, marble, granite, terrazzo, glass, and stone-like materials
- texture/pattern orientation and scale, such as wood grain direction, weave density, marble vein flow, or terrazzo chip scale

It also adds stricter QA gates so the prompt is rewritten if it would likely:
- lose small parts or countable details
- drift into the wrong material class
- omit visible texture/pattern information
- simplify a distinctive product into a generic furniture archetype
- invent decorative details not present in the reference


## Version 1.4.2 completeness review

This version fixes a markdown formatting defect from the prior taxonomy insertion and adds broader production guards for furniture coverage.

Additional coverage added:
- variant, colorway, set, and bundle handling
- multi-product isolation rules
- product visibility and occlusion control
- complementary viewpoint coverage for storyboards
- category-specific red-flag corrections for sofas, floor chairs, stools, office chairs, tables, cabinets, carts, beds, outdoor furniture, kids/pet furniture, and hard-surface products
- completeness boundary behavior for unusual or ambiguous furniture

The intended behavior is now: classify the exact product, extract countable and material attributes, preserve small parts, enforce storyboard format, keep product visibility high, and rewrite internally if any category-specific red flag appears.


## Borderless Storyboard And Customer-Journey Upgrade

Version 1.4.3 improves storyboard behavior in three important ways:

1. **Borderless storyboard presentation**
- By default, the storyboard should not show heavy white divider lines, colored borders, boxed panel frames, or contact-sheet styling.
- Panels should read as a clean premium storyboard sheet, with either no visible separators or only extremely subtle neutral spacing when unavoidable.

2. **Customer-journey storytelling**
- A storyboard is no longer treated as a set of repeated beauty shots.
- The skill must plan a product story that communicates what a buyer actually needs to understand: overview, angles, mechanism, materials, close-up details, real usage, room context, and benefit-driven scenes.

3. **Anti-redundancy frame diversity**
- Frames should not feel repetitive or nearly identical.
- At least 6 of 9 frames in a 3x3 storyboard should each serve a clearly different information role.
- The skill should especially use multi-angle product evidence, such as underside, side, folding mechanism, hardware, or detail views, when those are present in the references.


## Strict Per-Panel Uniqueness Upgrade

Version 1.4.4 adds stronger duplicate-frame prevention for 3x3 storyboards. The skill now requires a deliberate nine-panel role map before prompt writing and rejects storyboard plans where three or more panels look essentially the same.

For a 3x3 storyboard, the skill should now enforce:
- no repeated hero/product angle more than twice
- no repeated user action more than once
- at least 7 of 9 panels with clearly different visual intent
- explicit top, side, underside/back, detail, usage, and alternate-state coverage when relevant
- duplicate-frame QA before final prompt output

For functional products such as folding tray tables, rolling carts, recliners, sofa beds, adjustable desks, and folding stools, the storyboard must show the actual functional journey rather than repeating similar beauty shots.


## Hardware / component-only product handling

Version 1.4.5 adds explicit support for furniture-related products that are not complete furniture items by themselves, such as shelf brackets, caster wheels, handles, connector plates, hinges, legs, wall mounts, rails, and replacement parts.

The skill now treats the hardware/component itself as the product source of truth. Installed shelves, cabinets, walls, props, or room decor may appear as context, but must not replace the actual component as the main product. For small products, the storyboard must include more close-up and macro-detail panels so the product remains inspectable.

The borderless storyboard rule is also stricter: storyboard panels should be edge-to-edge with no visible white dividers, no gutters, no borders, and no frame outlines unless the user explicitly requests separators.


## v1.4.8 Current-Reference And Person-Product Coverage Upgrade

This version adds stricter rejection rules for storyboard frames that are visually attractive but irrelevant to the current product. It specifically prevents unrelated character-only, beach/outdoor, empty-room, or prior-output contamination frames from appearing inside product storyboards.

New behavior:
- all storyboard panels must be justified by the current references and the product customer journey
- if product and character references are both supplied, at least one 3x3 panel must clearly show the referenced person with the referenced product
- person-only frames are not accepted as substitutes for person-product interaction frames
- current input references override all earlier uploads and generated outputs
- storage furniture gets stricter drawer/lock/handle/fascia fidelity rules
- dresser/cabinet 3x3 storyboards now have a dedicated role map emphasizing front view, side/depth, open drawers, handles, locks, person scale/use, and installed room context


## Floor Textile / Rug / Mat Support Upgrade

Version 1.4.8 adds specific support for floor-textile products such as rugs, carpets, runners, bath mats, kitchen mats, entry mats, play mats, pet mats, baby mats, and anti-slip mats. The skill now treats these as furniture-adjacent products, not generic room decoration.

Key behavior added:
- preserve mat/rug shape, corner radius, edge binding, stitched border, pile height, textile softness, backing, and floor thickness
- preserve printed/woven/tufted motifs such as paw prints, animal shapes, clouds, letters, borders, and color-block patterns
- distinguish physical product text from marketplace overlay text; physical text like “WELCOME” or decorative letters can be part of the product and should be preserved
- require mat/rug products to stay on the floor and remain inspectable in storyboard frames
- prevent unrelated person-only, beach, fashion, empty-room, or luxury-room frames from replacing the product story
- add a 3x3 customer-journey map specific to floor textile products, including full-pattern view, room placement, edge detail, fiber texture, person-product interaction, use-case placement, motif detail, low side thickness view, and final lifestyle view


## Reference Relevance Ranking Upgrade — v1.4.8

Version 1.4.8 adds stricter current-reference analysis before prompt writing. The skill now ranks each image as a primary product reference, secondary context reference, or irrelevant/conflicting reference. Irrelevant portraits, travel, fashion, beach, or empty-room images must not become storyboard panels unless explicitly requested.

The skill also adds a dominant product category lock, a single-product versus product-family decision rule, and a current-product-majority fail-safe. This is especially important when a user uploads multiple product variants such as a collection of rugs, mats, or floor textiles alongside unrelated person/environment images.

For floor mat and rug collections, v1.4.8 strengthens:
- product-family / collection handling
- motif and pattern fidelity
- preservation of physical product text such as WELCOME
- visibility quotas for flat floor products
- user interaction fallback when the supplied person reference is irrelevant
- environment compatibility scoring for bath mat, entry mat, play mat, pet mat, and decorative mat use cases
- hard rejection of cross-turn contamination when the user says to use only the current image set
