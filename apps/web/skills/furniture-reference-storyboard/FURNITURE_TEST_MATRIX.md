# Furniture Skill Coverage Test Matrix

This matrix defines representative furniture categories the skill is expected to support in storyboard generation. Use it as a QA checklist for prompt-level and visual regression testing.

## Core category suite

1. Sofa / loveseat / sectional
2. Armchair / lounge chair / accent chair
3. Office chair / gaming chair / task chair
4. Floor chair / floor sofa / futon
5. Daybed / chaise / sofa bed / convertible bed
6. Bed frame / platform bed / bunk bed / loft bed / crib
7. Dining chair / bar stool / counter stool / bench
8. Dining table / coffee table / side table / desk / console
9. TV stand / media console / sideboard / credenza
10. Wardrobe / dresser / chest of drawers / filing cabinet
11. Bookcase / wall shelf / cube organizer / modular shelf
12. Utility rack / shoe rack / garment rack / laundry cart
13. Bathroom vanity / over-toilet rack / towel rack / linen cabinet
14. Outdoor patio set / sun lounger / garden bench / rattan chair
15. Kids furniture / nursery furniture / pet bed / cat tree
16. Commercial furniture / cafe set / waiting bench / salon chair
17. Modular, foldable, extendable, stackable, rolling, and transformable furniture

## Required storyboard QA for each category

- The output must be a multi-frame storyboard when storyboard is selected.
- The grid must have the requested panel count and equal-sized panels.
- The product must not be replaced by environment furniture.
- Product category, material, color, support structure, and countable parts must remain consistent.
- No extra text, captions, labels, numbers, or watermarks appear unless explicitly requested.
- At least 7 of 9 panels in a 3x3 storyboard must show the referenced product clearly.


## Expanded v1.4.2 coverage checklist

Use this checklist to test broad retail furniture support. For each product, run at least one 3x3 storyboard and check: correct category, correct countable parts, correct material, correct small details, equal frame grid, no unwanted text, and product persistence.

### Seating
- 3-seat sofa
- loveseat
- L-shaped sectional
- chaise lounge
- recliner with footrest
- accent armchair
- rocking chair
- swivel lounge chair
- dining chair
- bar stool with footrest
- storage bench
- ottoman / pouf
- floor chair / floor sofa
- folding chair
- outdoor chair

### Sleeping / convertible
- platform bed
- headboard only
- storage bed
- daybed
- futon
- sofa bed
- bunk bed
- loft bed
- trundle bed
- crib / toddler bed

### Tables / desks
- coffee table
- round side table
- console table
- dining table
- extendable dining table
- writing desk
- computer desk
- standing desk
- vanity table
- nesting tables
- folding table
- lift-top table

### Storage / case goods
- wardrobe
- dresser
- sideboard / buffet
- TV stand
- media console
- bookcase
- cube organizer
- wall shelf
- display cabinet
- shoe cabinet
- filing cabinet
- rolling storage cart
- utility rack

### Utility / bathroom / laundry
- over-toilet rack
- laundry shelf
- hamper rack
- towel rack
- bathroom vanity cabinet
- medicine cabinet
- kitchen island cart
- pantry rack
- coat rack / hall tree

### Outdoor / commercial / special
- rattan patio set
- outdoor storage box
- garden bench
- sun lounger
- restaurant booth
- cafe table/chair
- salon chair
- massage table
- retail display shelf
- cat tree / pet bed
- kids table/chair set

### Material-specific stress tests
- PU leather sofa vs woven fabric sofa
- velvet chair vs linen chair
- mesh office chair vs upholstered office chair
- rattan/cane cabinet door vs solid wood door
- glass-top table vs marble-top table
- marble vs granite vs terrazzo table
- powder-coated steel rack vs chrome rack
- acrylic chair vs plastic chair
- oak veneer vs walnut veneer


## Storyboard-specific regression checks

For each representative furniture category, verify that a 3x3 vertical storyboard:
- produces exactly 9 equal-sized frames
- avoids visible white/colored divider lines by default
- avoids overlay text unless requested
- preserves the same product identity across panels
- uses at least 6 meaningfully different frame purposes
- includes mechanism/underside/detail evidence when such evidence exists in the references
- communicates a useful customer journey rather than repeating near-duplicate hero shots


## Duplicate-frame regression checks

For each 3x3 storyboard test, inspect whether:
- any 3 panels are near-duplicates; this is a failure
- adjacent panels repeat the same camera angle; this is a failure unless a comparison was requested
- at least 7 of 9 frames have distinct visual intent
- the storyboard includes a planned role map rather than a set of repeated hero shots
- functional furniture includes mechanism, folded/alternate state, detail, and usage frames


## Hardware and small-component stress tests

Test products:
- L-shaped shelf bracket pair
- concealed floating shelf bracket
- folding shelf bracket
- caster wheel set
- furniture legs / riser set
- cabinet handles / drawer pulls
- hinge / connector plate set

Required checks:
- component remains the product, not the shelf/cabinet/room
- screw-hole count and placement are preserved when visible
- pair or set count is preserved
- metal/plastic/rubber finish is preserved
- at least 4 of 9 storyboard panels are close-up/detail for small products
- installed context is present but does not dominate the storyboard
- no visible white dividers or panel borders by default


## v1.4.6 Regression Checks

For any 3x3 storyboard using product + character + environment references, verify:
- no unrelated character-only or fashion-only panel
- no unrelated beach/outdoor/empty-room panel
- at least one panel shows person and product together clearly
- at least seven panels show the product clearly
- every panel contributes to product understanding or customer journey
- dresser/cabinet tests preserve drawer count, keyholes, handle cutouts, panel gaps, finish, and open-drawer state


## Floor textile regression cases

Test rug/mat/floor textile storyboards with:
- child play mat with animal/paw/cartoon motifs
- entry mat with physical “WELCOME” text
- bath mat with plush pile and rounded corners
- kitchen runner with anti-slip backing
- pet mat with printed pattern
- plain modern area rug with subtle weave

For each test, verify:
- the product remains a floor textile, not a blanket or generic carpet
- the full pattern and border are visible in at least one frame
- texture/pile/detail is visible in multiple frames
- any physical product letters are preserved while marketplace overlays are removed
- at least one frame has person + product interaction when a person reference is supplied
- no unrelated person-only, beach, fashion, or empty-room frame appears


## v1.4.8 Reference Relevance Tests

Test cases to verify:
- Mat/rug collection + unrelated beach portrait: storyboard must focus on mat collection; no beach/fashion panels.
- Mat/rug collection + room reference: room may be adapted only when the mat remains visible and plausible.
- Multiple product variants: storyboard must use collection mode or clearly choose one requested variant; no hybrid product.
- Physical text on mat: preserve product text such as WELCOME while excluding marketplace overlays.
- Person reference irrelevant to product: use generic hands/feet/user interaction with product; do not force unrelated identity.
- Use-current-set-only request: no prior product, prior room, or generated image may appear.
