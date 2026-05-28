# Cosmatic Reference Storyboard Skill V2

This skill generates highly consistent cosmetic reference storyboard prompts for GPT Image 2:
- Single image generation
- Multi-frame storyboard generation
- Separate prompt-per-frame workflows

Every prompt independently repeats:
- Character Lock
- Character Identity And Face Lock
- CHARACTER REFERENCE LOCK block per people frame
- Product Lock
- Exact Product Geometry And Scale Lock
- Exact Product Color And Label Lock
- PRODUCT REFERENCE LOCK block per frame
- Environment Lock
- Geometry Preservation Rules
- Rendering Style
- Negative Constraints

Optimized for GPT Image 2 consistency.

Product reference images are treated as the highest-priority source of truth. Cinematic styling may change the scene around the product, but it must not recolor the package, lid, cap, logo, label hierarchy, visible text, or material finish.

When product references are supplied, every prompt/frame must include a `PRODUCT REFERENCE LOCK:` block before the scene description. The block restates the product body color/material, lid/cap color/material, printed logo/text color, and explicit no-recolor negatives. For example, a white/translucent cosmetic jar must remain white/frosted white or translucent with a white cap/lid; warm bathroom or luxury lighting must not turn it into amber/brown glass or add a gold lid.

The skill also locks package geometry: cross-section shape, roundness/flat-sidedness, height-to-width ratio, cap-to-body ratio, short/tall/squat/slim silhouette, applicator architecture, and visible unit scale must match the product references. This prevents round cosmetic vials from becoming boxy packages and prevents short cosmetic vials from being stretched into generic tall tubes.

Character reference images are identity anchors. Face likeness, facial proportions, skin tone, hairline, distinctive marks, age range, and styling continuity must stay consistent across every frame where the person appears.

When character references are supplied, every frame that shows a face or recognizable person must include a `CHARACTER REFERENCE LOCK:` block before the scene description. The block restates face shape, eye/brow/nose/lip anchors, smile character, skin details, hair length/part/volume/style, age impression, wardrobe, and no-different-model negatives. If the model cannot preserve identity confidently, the frame should become product-only, hands-only, over-shoulder, back-of-head, partial-face crop, or detail shot rather than inventing a new face.

For 3x3 storyboard generation, if a recognizable character reference is supplied, include the referenced person in at least 2 of 9 frames. At least one person frame must show a clear visible face, front-facing or three-quarter, sharp, well lit, unobstructed, and large enough to recognize. Do not count back-of-head, over-shoulder, tiny, hidden, cropped, masked, shadowed, or blurred faces as valid identity frames.
