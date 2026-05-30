# Orchestra Contracts

## Production Reference Storyboard Input Contract

- Removed input: `scene_descriptions`
- Added input: `voiceover_script`
- Primary storyboard-content precedence:
  1. `storyboard_guide` for visual shot order, timing, story beat, action, camera, layout/frame allocation, and continuity.
  2. `voiceover_script` for spoken line/narration/dialogue per shot.
  3. `production_concept_details` for product concept, audience, problem, hook, selling points, product facts, and claim safety.
  4. Reference images for visual locks: product references override environment references; character references preserve recurring identity; environment references define only mood/location/lighting.

## Sync Boundary

Media Studio production reference storyboard auto-fill must send `voiceover_script` and must not send `scene_descriptions`.

## Skill Boundary

All `apps/web/skills/*-reference-storyboard/` mirrored `SKILL.md` and `skill.md` files must remain byte-identical per existing tests.

## Cinematic Quality And Fidelity Contract

All production reference storyboard skills must require:
- `CINEMATIC REALISM LOCK`: cinematic photorealistic product-film quality, dimensional lighting, realistic lens/depth, grounded shadows, material-accurate reflections, and camera choices derived from `storyboard_guide` + `voiceover_script`.
- `CHARACTER FACE AND IDENTITY LOCK`: same referenced face across shots, clear visible human-realistic face when a face appears, no identity swaps, waxy/plastic/CG-looking skin, blurred/cropped/tiny/hidden face substitutions, or invented new person.
- immutable product evidence: `reference_product_images` must preserve exact product geometry, proportions, material class, texture, colorway, scale, labels, markings, parts, ports, seams, caps, handles, packaging, and structure. The prompt may change placement/use/lighting only when the physical product remains intact.

## Shot Mapping And Product Fidelity Contract

All production reference storyboard skills must require:
- Parse numbered/timed `storyboard_guide` + `voiceover_script` into an internal shot-by-shot map before writing prompts, even when whitespace is collapsed.
- For 3x3/9-frame storyboards, write `Frame 1` through `Frame 9` in the same order as the supplied guide/script.
- Each frame must carry the source shot timing/title when available, visual beat/action, spoken meaning, camera/lens/lighting direction, product role/fidelity note, character-face rule when relevant, and environment continuity.
- Category default 3x3 maps are fallback-only and must not override explicit Storyboard Guide or Voiceover Script shot lists.
- Explicit storyboard runs must not be reduced to a single generic `SCENE DESCRIPTION:` block.
- Product-visible frames must repeat the canonical product fidelity facts from current references and Product Concept Details: category/subtype, countable parts, silhouette/bounding box, material/color/finish, support/base/leg/post structure, markings/labels, scale class, and no-go substitutions.
- Every explicit storyboard frame must carry camera/light/color intent so output feels like a cinematic product-film sequence, not catalog or real-estate listing photography.
- Video-bound person frames must show a clear front-facing or three-quarter referenced face, or be hands-only/partial-body-without-head; back-of-head/over-shoulder-with-hair/no-face product-use frames are not valid identity frames.
- Lifestyle/result/confirmation/overview/CTA frames must show the same canonical product instance as earlier product frames; a correct person beside a wrong similar product is a fatal failure.
- Non-infographic no-text mode must suppress readable text on non-product props/backgrounds such as mugs, books, screens, wall art, signage, and UI.

## Unified Product Reference Storyboard Contract

- Production should use `product-reference-storyboard` as the single active reference storyboard skill.
- Legacy `*-reference-storyboard` category skills remain as compatibility files but should not appear in Production skill selection.
- `product_category` is the category selector for product-specific fidelity rules. Valid values are `auto` plus the 20 product categories in the schema.
- Client routing must detect product category separately from skill id: skill id stays `product-reference-storyboard`; category becomes `product_category`.
- Server execution must append the selected `references/product-categories/<category>.md` rule file when the unified skill receives a concrete `product_category`.
- If `product_category` is `auto`, the skill must infer from Product Detail, product title, marketplace context, and reference images without inventing category facts.
- Category rules are fallback constraints only. Current `reference_product_images` and Product Detail always override category defaults.
