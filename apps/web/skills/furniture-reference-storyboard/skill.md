---
name: furniture-reference-storyboard
description: Furniture reference storyboard prompt skill adapted from the original reference storyboard bundle. Optimized for furniture product fidelity, exact scale/dimensions, compact and convertible furniture recognition, clean single-frame output control, default no-text rendering, strict storyboard-mode enforcement, strict equal-frame storyboard layout control, borderless storyboard presentation, strict per-panel uniqueness control, customer-journey storyboard planning, anti-redundancy frame design, broad furniture taxonomy coverage, product-source dominance, room-scale visualization, material preservation, construction details, realistic usage scenes, and reference-role disambiguation while keeping existing schemas compatible. Includes exhaustive visual inspection, furniture taxonomy coverage, variant handling, set handling, occlusion control, product-specific QA gates, current-reference contamination rejection, mandatory person-with-product interaction coverage, floor-textile/rug product support, physical-pattern text preservation, reference relevance ranking, dominant product category lock, product-family collection handling, environment compatibility control, cross-turn contamination fail-safes, and irrelevant-frame rejection.
category: image_prompt_generation
version: 1.4.16
icon: sofa
tags:
  - shared-skill
  - imported
  - furniture
  - interior
  - product-fidelity
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

This skill writes high-fidelity image prompts for furniture, furniture-adjacent products, floor textiles, storage units, hardware, and storyboard/contact-sheet outputs. It must preserve the product from the current reference images instead of turning it into a generic catalog archetype.

Every generated prompt MUST independently repeat:
- Character identity lock when people appear.
- Character reference lock block when recognizable people appear.
- Furniture product geometry lock.
- Furniture material, color, finish, texture, and pattern lock.
- Visible brand/marking/tag preservation lock when present.
- Room, scale, and environment consistency lock.
- Numeric dimension lock when user-supplied dimensions exist.
- Compact/portable/convertible furniture scale guard when applicable.
- Single-frame vs storyboard/collage output guard.
- Default no-extra-text rendering guard.
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
Do not return JSON, YAML, Markdown fences, labels, metadata, review notes, or wrapper fields such as `output`, `prompt`, `prompts`, `scenes`, or `scene_descriptions`.

The final answer must be directly usable in the Media Studio prompt textarea. If the request needs a storyboard, write a human-readable storyboard prompt as normal text with clear scene or panel sections. Do not serialize those sections as JSON.

Allowed shape:

PRODUCT REFERENCE LOCK:
...

STORYBOARD PROMPT:
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
- Scene descriptions define action and composition, but they MUST NOT authorize redesigning the product unless the user explicitly requests a new product concept rather than reference fidelity.

When a reference set contains furniture-like objects in the environment image, treat those as background context unless they are also present in product references. Do not accidentally replace the referenced product with an unrelated sofa, table, cabinet, bed, shelf, stool, cart, rug, or decorative furniture from the room image.

When product references show multiple colorways or variants, choose the variant requested by the user. If the user does not specify, infer the dominant/clearest product variant from product references and state it in `PRODUCT REFERENCE LOCK`. Do not blend variants into a new hybrid colorway or mixed construction.

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

Generated images must be image-only by default. If the user does not explicitly request text inside the image, do not render visible extra text.

Forbidden by default:
- captions, headlines, subheads, bullet points.
- product feature callouts.
- spec labels, frame numbers, measurement numbers, arrows.
- Thai or English promotional text.
- badges, banners, stickers, price bubbles, sale marks.
- infographic labels, UI chrome, card labels, mockup text.

Allowed only when physically part of the referenced product/environment:
- sewn brand tags.
- engraved logos or maker marks.
- printed care labels.
- physical product text or pattern text on mats/rugs.
- tiny incidental background text not emphasized.

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

If identity preservation is not important for a product-detail frame, prefer hands-only, side/back/over-shoulder, or partial-body interaction instead of describing or inventing a new face.

## Required Prompt Block Order

For each generated prompt, use this order:
1. `OUTPUT FORMAT LOCK` - aspect ratio, single image vs storyboard, exact grid when requested, no captions/labels unless explicitly requested.
2. `TEXT RENDERING POLICY` - no extra visible text by default; only requested or physical product text.
3. `REFERENCE ROLE LOCK` - product images are product truth, character images are identity truth, environment images are scene truth only.
4. `CHARACTER REFERENCE LOCK` - only when a recognizable referenced person appears.
5. `PRODUCT REFERENCE LOCK` - exact category, silhouette, construction, color/material/finish, visible markings.
6. `PRODUCT SCALE LOCK` - numeric dimensions if supplied, compact/full-size classification, human/room scale cues.
7. `STORYBOARD GRID LOCK` - mandatory for storyboard requests; exact grid, equal panels, borderless, no single-frame fallback.
8. `SCENE DESCRIPTION` - action, environment, camera, lighting, composition.
9. `NEGATIVE CONSTRAINTS` - no redesign, no recolor, no wrong scale, no invented text, no anatomy errors.
10. `QA BEFORE OUTPUT` - rewrite internally if product, scale, character, storyboard, or environment fidelity fails.

Do not output analysis or QA notes as visible text inside generated images.

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
- Current-reference contamination: no old products, old rooms, old generated outputs, unrelated people, beach/fashion/travel frames unless supplied in current run.
- Irrelevant frame rejection: every panel must contribute to product story, detail, function, room placement, scale, or customer journey.
- Person-with-product coverage: if product and relevant character references are supplied for 3x3, include at least one clear person-product interaction.
- Storage furniture fidelity: drawer count, handle position, lock/keyhole placement, material, and base stance must match reference.
- Watermark exclusion: reference-photo overlays are not product markings.
- Convertible furniture configuration: do not lose short legs, low scale, hinge/backrest/slab structure, or gain armrests/sectional modules.
- Wrong product category, scale, color, material, finish, geometry, cushion grid, tier count, shelf count, drawer/door layout, caster/leg count, arm/back structure, fold/hinge design.
- Environment reference overpowering the product reference.
- Character reference replaced by generic model when face is visible.
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
- Correct scale: numeric dimensions and human/room scale are plausible and consistent.
- Correct support/contact: legs, casters, plinths, floor pads, wall mounts, and feet contact surfaces naturally.
- Correct storyboard format: requested grid produces requested number of equal-sized panels.
- Correct product persistence: same product appears in most storyboard panels and never changes category.
- Correct environment role: room images supply lighting/architecture/mood, not product substitution.
- Correct text policy: no captions, numbers, labels, watermarks, or promotional copy unless explicitly requested.
- Correct occlusion: people, props, plants, pillows, blankets, or decor do not hide defining product structure in hero/detail panels.

If any item fails, rewrite the prompt before output.
