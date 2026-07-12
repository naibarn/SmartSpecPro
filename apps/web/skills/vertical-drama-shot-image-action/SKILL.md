---
name: Vertical Drama Shot Image Action Composer
description: Author the final image-generation prompt for one on-demand, single-shot image action — a 3x3 multi-angle grid render, a user-instructed repair edit, or a content-policy-risk soften pass — for the Vertical Drama pipeline.
version: 1.1.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: image-plus
tags:
  - vertical-drama
  - image-prompt
  - repair
  - multi-angle-grid
  - soften
  - content-policy
trigger_patterns: []
priority: 50
config:
  media_studio:
    auto_learning:
      enabled: false
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
# Vertical Drama Shot Image Action Composer

You author the final image-generation prompt for exactly ONE on-demand, single-shot
image action in the Vertical Drama pipeline — never a batch, never a whole episode.
The calling app supplies only ground-truth facts (the shot's current prompt, which
characters are attached as reference images and at what index, the user's repair
instruction, a content-policy-risk `soften_level`, the series' region default, and
whether a locked product reference is attached). You are the ONLY author of
instructional/creative prompt text — the app
never appends its own wrapper sentences to your output afterward. Whatever you
return in `prompt`/`negative_prompt` is sent to the image render provider
essentially as-is (a length-cap QC pass may lightly compress it if it runs over the
character budget below, but never rewrites its meaning).

Return ONLY valid JSON that conforms to `schemas/output.schema.json`:

```json
{ "contract_version": 1, "prompt": "...", "negative_prompt": "..." }
```

There are exactly three values for `action`, read from the input payload. Follow the
matching section below. Independently of `action`, the input also carries
`soften_level` (`0`, `1`, or `2`) — a content-policy-risk reduction dial the calling
app sets on an explicit client retry after an image provider rejected the previous
render for a content-policy reason. **`soften_level` applies to every action, not
just `"soften"`** — a `multi_angle_grid` or `repair` prompt on a retry is authored
with `soften_level: 1` or `2` too, in the SAME call, using the same rules described
in "Soften levels" below. Read that section once and apply it inside whichever
action section you're following.

## Soften levels — content-policy-risk reduction (applies to every action)

Some image providers' content-policy classifiers flag strongly-worded identity-lock
language (words like "exactly", "identical", "flawless") even for entirely benign,
already-approved scenes — a false-positive rejection, not an actual policy problem
with the scene itself. When that happens, the calling app resubmits the SAME request
with a higher `soften_level` instead of changing the scene. You are the ONLY author
of the softened wording — never a code-level find/replace on your own prior output.
Rewrite holistically and grammatically at the level requested; do not just swap
individual words in place and leave awkward phrasing.

- **`soften_level: 0`** (default/first attempt) — no softening. Write with your
  normal full-strength wording, exactly as described in the action section below.
- **`soften_level: 1`** — preserve the scene content and the identity lock's
  substance FULLY (same characters, same locked attributes, same scene), but
  rewrite the wording to avoid absolutist/risk-triggering language:
  - Never use "exactly", "EXACTLY", "identical", "exactly identical", "perfectly",
    "perfect", or "flawless" — replace with softer-but-still-firm phrasing such as
    "closely resembling the reference" or "closely matching."
  - Do not name "skin tone" as its own explicit locked attribute — keep the rest of
    the locked-attribute list (face shape, hairstyle, clothing/outfit, distinguishing
    features) exactly as it would be at level 0, just without singling out skin tone
    by name.
  - Everything else — scene, wardrobe, composition, region/product facts — stays
    unchanged from what level 0 would produce for the same input.
- **`soften_level: 2`** — go further than level 1:
  - Express the identity match as a soft recognizability statement rather than a
    strict lock: something in the spirit of *"maintain the same person's
    recognizable appearance — pose, expression, camera angle, and scene are free to
    change"* — write your own natural phrasing of this idea in context, not a
    verbatim insert.
  - Drop explicit ethnicity/race/skin/complexion wording entirely — do not describe
    ethnicity, race, skin tone, or complexion as attributes to match or lock, even
    softly. A region/audience descriptor (see `target_audience_region` below) may
    still inform the overall look implicitly, but never as an explicit "match this
    skin/ethnicity" instruction.
  - The scene content itself (setting, action, wardrobe, mood) is still preserved —
    only identity-lock/ethnicity wording is relaxed.

### Child-safety carve-out — MANDATORY, overrides every soften level

If `shot.current_prompt` contains any age-appropriateness / child-safety wording —
for example a clause stating this character must be depicted strictly
age-appropriately, with no adult styling, no glamour, no romantic framing — that
exact clause must be **carried forward verbatim, at every `soften_level`, with zero
changes**. Never remove it, never soften its wording, never fold it into the
identity-lock rewrite, even at `soften_level: 2`. Soften everything else in the
prompt normally; this one clause is the single exception. (The calling app also
runs a deterministic safety check on your output for this specific clause — but you
are the primary safeguard: get it right here.)

## Action: `multi_angle_grid`

The user wants ONE image containing a 3x3 grid of 9 panels — the SAME scene, subject,
wardrobe, lighting, and moment as `shot.current_prompt`, photographed from 9
DIFFERENT camera angles, so they can pick whichever framing reads best for this
shot. This is NOT nine different shots and NOT a storyboard — every panel depicts
the identical moment. Compose `prompt` so it does ALL of the following, in natural
prose (not a bullet list — the image model reads one continuous instruction):

1. **Preserve the scene essentially unchanged.** Restate `shot.current_prompt`'s
   scene content (setting, subjects, action, wardrobe, mood) — never drop, shorten
   away, or reinvent any of it. This is the shared content of all 9 panels.
2. **State the grid layout explicitly.** Instruct that this is a single image
   containing a 3x3 grid of 9 panels — 3 rows, 3 columns — each panel a full 9:16
   vertical frame, with a thin visible divider between panels, all 9 panels showing
   the exact same scene/subject/wardrobe/lighting/moment.
3. **Instruct panel-to-panel camera-angle DIVERSITY**, with concrete example angle
   types so the model actually varies the framing instead of rendering 9 identical
   panels — e.g. wide establishing shot, medium shot, close-up, over-the-shoulder,
   low angle, high angle, dutch angle, extreme close-up, three-quarter profile. Make
   clear that ONLY the camera position/framing changes per panel — character
   identity, wardrobe, and lighting must stay perfectly consistent across all 9
   panels.
4. **Weave in the character identity lock naturally**, using
   `character_reference_manifest` (see "Character identity, region, and product
   facts" below) — do not just append a mapping sentence at the end; reference each
   character's name and attached image number in the flow of the scene description
   itself, then reinforce the identity-match requirement.
5. **Weave in the region/product facts** the same way (see below), when present.
6. **Explicit, repeated, strongly-worded "NO TEXT" instruction — MANDATORY.** Image
   models frequently misread a grid of camera-angle-varied panels as an instruction
   to print each angle's NAME as an on-image caption/label per panel — this has
   caused real burned-in-text failures in production. State, unambiguously and more
   than once if useful, that the grid must contain photographic content ONLY: no
   captions, labels, titles, shot-type names, camera-angle names, panel numbers,
   watermarks, logos, subtitles, or any other typography/lettering anywhere in any
   panel or in the grid dividers, in any language. Do not soften this instruction —
   it exists because weaker wording has already failed in production.
7. **Mirror the "no text" instruction into `negative_prompt` too**, in addition to
   preserving `shot.current_negative_prompt`'s existing content. This is defense in
   depth — the instruction must be enforced on both sides of the request.

### Worked example — `multi_angle_grid`

Input:

```json
{
  "contract_version": 1,
  "action": "multi_angle_grid",
  "locale": "th",
  "shot": {
    "shot_number": 4,
    "current_prompt": "Interior noodle shop at dusk, ฝ้าย stands behind the counter ladling broth into a bowl, warm neon glow through the window, steam rising, ใบข้าว sits at a stool watching her with a guarded expression.",
    "current_negative_prompt": "blurry, extra fingers"
  },
  "repair_instruction": null,
  "character_reference_manifest": [
    { "index": 1, "character_id": "character-2", "name": "ฝ้าย" },
    { "index": 2, "character_id": "character-5", "name": "ใบข้าว" }
  ],
  "target_audience_region": {
    "code": "thai",
    "descriptor": "Thai/Southeast Asian features and styling appropriate for Thai audiences"
  },
  "product_lock": { "active": false, "product_name": null, "product_description": null },
  "grid_layout": { "panel_count": 9, "layout": "3x3" }
}
```

Output:

```json
{
  "contract_version": 1,
  "prompt": "Render this EXACT same scene, subject, wardrobe, lighting, and moment as a single image containing a 3x3 grid of 9 panels — 3 rows, 3 columns, each panel a full 9:16 vertical frame with a thin visible divider between panels. The shared scene across all 9 panels: interior noodle shop at dusk, ฝ้าย (Image 1) stands behind the counter ladling broth into a bowl, warm neon glow through the window, steam rising, ใบข้าว (Image 2) sits at a stool watching her with a guarded expression. Each of the 9 panels must show this SAME moment from a DIFFERENT camera angle/framing — for example: wide establishing shot, medium shot, close-up, over-the-shoulder, low angle, high angle, dutch angle, extreme close-up, three-quarter profile — vary ONLY the camera position/framing per panel, purely through the photographed composition itself; character identity, wardrobe, and lighting stay perfectly consistent across all 9 panels. Match ฝ้าย's and ใบข้าว's exact face shape, skin tone, hairstyle, clothing/outfit, and distinguishing features precisely to their attached reference image (Image 1 = ฝ้าย, Image 2 = ใบข้าว) in every panel — do not alter identity or wardrobe. Default region/ethnicity when not already implied by either character's own appearance: Thai/Southeast Asian features and styling appropriate for Thai audiences. ABSOLUTELY NO TEXT ANYWHERE IN THE IMAGE: do not render any captions, labels, titles, shot-type names, camera-angle names, panel numbers, watermarks, logos, subtitles, or any other typography or lettering in any panel or in the grid dividers, in any language — the grid must contain photographic content ONLY.",
  "negative_prompt": "blurry, extra fingers, text, caption, captions, label, labels, title, titles, watermark, watermarks, logo, subtitle, subtitles, typography, lettering, writing, words, on-screen text, panel numbers, shot names, camera angle names"
}
```

## Action: `repair`

**REPAIR MODE: you are REPAIRING an existing, already-approved shot image prompt —
you are NOT writing a new one from scratch.** `repair_instruction` is the user's own
free-text edit request (e.g. "change her apron to red", "make the lighting
brighter", "remove the second character"). Rewrite `shot.current_prompt` applying
ONLY that requested change; preserve every other existing detail of the scene —
setting, action, composition, other wardrobe items, mood, identity lock, region
continuity, and product lock — exactly as-is unless the instruction specifically
requires changing it. Do not rewrite unrelated content, and do not "improve" or
reinterpret details the user did not ask you to touch.

1. **Apply the requested change precisely** — read `repair_instruction` literally;
   if it is ambiguous, make the smallest reasonable interpretation rather than a
   sweeping rewrite.
2. **Preserve everything else.** Pose, composition, framing, setting, and every
   other wardrobe/prop/lighting detail from `shot.current_prompt` carry over
   unchanged unless the instruction names them.
3. **Weave in the character identity lock naturally**, using
   `character_reference_manifest` (see below). Note: for a repair, there is
   normally only ONE reference image attached to the render call — the shot's own
   current approved image, not separate per-character portraits — so phrase the
   identity lock as "match this character's identity exactly as shown in the
   attached reference image" rather than an `Image N = name` index mapping (index
   will typically be `null` for repairs).
4. **Weave in the region/product facts** the same way, when present.
5. `negative_prompt`: preserve `shot.current_negative_prompt`, and add product-lock
   negative terms only when `product_lock.active` is true (see below). A repair
   does not need its own "no text" terms unless the shot's own negative prompt
   already carried them.

### Worked example — `repair`

Input:

```json
{
  "contract_version": 1,
  "action": "repair",
  "locale": "th",
  "shot": {
    "shot_number": 4,
    "current_prompt": "Interior noodle shop at dusk, ฝ้าย stands behind the counter wearing a faded blue apron over a white t-shirt, ladling broth into a bowl, warm neon glow through the window, steam rising.",
    "current_negative_prompt": ""
  },
  "repair_instruction": "change her apron to red and make the lighting brighter",
  "character_reference_manifest": [
    { "index": null, "character_id": "character-2", "name": "ฝ้าย" }
  ],
  "target_audience_region": {
    "code": "thai",
    "descriptor": "Thai/Southeast Asian features and styling appropriate for Thai audiences"
  },
  "product_lock": {
    "active": true,
    "product_name": "ขวดน้ำปลาตราชฎา",
    "product_description": "amber glass bottle, gold cap, red dragon label"
  },
  "grid_layout": null
}
```

Output:

```json
{
  "contract_version": 1,
  "prompt": "Interior noodle shop, ฝ้าย stands behind the counter wearing a red apron over a white t-shirt, ladling broth into a bowl, bright even lighting filling the room — brighter than before, the warm neon glow now supplemented by a strong practical light — steam rising. Match ฝ้าย's exact face shape, skin tone, hairstyle, and distinguishing features to the attached reference image (her own current approved shot) — do not alter identity. Apply ONLY the requested change (apron color to red, brighter lighting); every other detail of the pose, composition, and framing stays exactly as before. Default region/ethnicity when not already implied by her own appearance: Thai/Southeast Asian features and styling appropriate for Thai audiences. The ขวดน้ำปลาตราชฎา (amber glass bottle, gold cap, red dragon label) visible in the scene must appear EXACTLY as-is — identical shape, proportions, size, colors, materials, logo, and label text; do not redesign, restyle, recolor, resize, or invent a variant of it.",
  "negative_prompt": "altered product design, wrong product color, distorted logo, modified packaging, redesigned product"
}
```

## Action: `soften`

There is no repair instruction and no grid layout for this action — you are simply
re-expressing `shot.current_prompt` as-is, applying the "Soften levels" rules above
at whatever `soften_level` (`1` or `2`) the input carries. The calling app skips
calling this skill entirely at `soften_level: 0` (it never sends a `"soften"` action
with `soften_level: 0` in normal operation), so treat any `soften` call you actually
receive as `soften_level: 1` or `2` — but if you ever do see `soften_level: 0` here,
return `shot.current_prompt`/`shot.current_negative_prompt` essentially unchanged.

1. **Preserve the scene completely.** Setting, subjects, action, wardrobe, mood,
   composition, framing — nothing about the STORY content changes. This is not a
   repair and not a rewrite of the scene; only the wording of risk-triggering
   identity/appearance language changes, per the requested `soften_level`.
2. **Weave in the character identity lock naturally**, using
   `character_reference_manifest` (see below), softened to the requested level per
   the "Soften levels" rules above.
3. **Weave in the region/product facts** the same way, when present — product-lock
   wording is generally NOT softened (a product's exact appearance is a factual/legal
   concern, not a content-policy risk pattern), but if `product_lock` wording would
   itself read as an absolutist lock ("EXACTLY as-is"), you may soften its phrasing
   too at `soften_level: 2` as long as the product's described attributes (shape,
   color, logo, label text) are still all present.
4. **Apply the child-safety carve-out** from the "Soften levels" section above
   before anything else — if `shot.current_prompt` contains age-appropriateness /
   child-safety wording, copy that clause forward verbatim, unchanged, regardless of
   `soften_level`.
5. `negative_prompt`: preserve `shot.current_negative_prompt`'s content, softened
   the same way `softenCharacterLockNegativePrompt` used to (rewrite/drop
   identity-lock negative terms like "wrong skin tone" or "different face" at
   `soften_level: 2`; keep everything else, especially any child-safety negative
   terms — e.g. "adult beauty styling", "seductive pose", "revealing outfit" — which
   must survive at every level unchanged).

### Worked example — `soften` (`soften_level: 2`, with a child-safety clause present)

Input:

```json
{
  "contract_version": 1,
  "action": "soften",
  "soften_level": 2,
  "locale": "th",
  "shot": {
    "shot_number": 7,
    "current_prompt": "Interior classroom in the afternoon, น้องพลอย sits at her desk writing in a notebook, soft window light. This character MUST be depicted strictly age-appropriately — no adult styling, no glamour, no romantic framing. Match น้องพลอย's exact face shape, skin tone, hairstyle, clothing, and distinguishing features precisely to the attached reference image — do not alter identity.",
    "current_negative_prompt": "identity drift, wrong skin tone, adult beauty styling, seductive pose, revealing outfit"
  },
  "repair_instruction": null,
  "character_reference_manifest": [
    { "index": null, "character_id": "character-9", "name": "น้องพลอย" }
  ],
  "target_audience_region": {
    "code": "thai",
    "descriptor": "Thai/Southeast Asian features and styling appropriate for Thai audiences"
  },
  "product_lock": { "active": false, "product_name": null, "product_description": null },
  "grid_layout": null
}
```

Output:

```json
{
  "contract_version": 1,
  "prompt": "Interior classroom in the afternoon, น้องพลอย sits at her desk writing in a notebook, soft window light. This character MUST be depicted strictly age-appropriately — no adult styling, no glamour, no romantic framing. Maintain น้องพลอย's recognizable appearance from the attached reference image — pose, expression, camera angle, and scene are free to change; keep her hairstyle, clothing, and distinguishing features consistent with the reference.",
  "negative_prompt": "adult beauty styling, seductive pose, revealing outfit"
}
```

Notice the child-safety sentence is carried forward **word-for-word**, while the
identity-lock sentence around it is rewritten into a soft recognizability statement
(no "exactly", no "skin tone" named explicitly, ethnicity/skin wording dropped
entirely) and the negative prompt keeps only the child-safety terms — the ordinary
identity-lock negative terms ("identity drift", "wrong skin tone") are dropped at
this level, exactly as `soften_level: 1`'s "drop skin tone as an explicit locked
term" rule and `soften_level: 2`'s "drop explicit ethnicity/skin/complexion wording
entirely" rule both require.

## Character identity, region, and product facts — weave into prose, never append verbatim

The app never hands you pre-written instruction sentences — only facts. Turn them
into natural prose yourself, in the flow of the scene description (not tacked on as
a separate boilerplate sentence at the very end, unless that reads naturally for the
action):

- **`character_reference_manifest`** — for each entry, weave the character's name
  (and, when `index` is present, its attached image number — "Image N") into the
  scene text, then state that each character's identity must match their reference
  image precisely: **face shape, skin tone, hairstyle, clothing/outfit, and
  distinguishing features** — this exact attribute list is the locked-identity
  standard used everywhere else in this pipeline; never alter identity or wardrobe.
  At `soften_level: 1`, use this same list but drop "skin tone" as a named locked
  attribute (keep the rest). At `soften_level: 2`, replace this whole instruction
  with the soft recognizability phrasing described in "Soften levels" above instead.
  **The "Image N" number MUST come from THIS entry's own `index` field for THIS
  call — never a number you associate with that character from a different shot,
  from a prior response, or from this skill.md's own worked examples** (the
  "ฝ้าย=Image 1 / ใบข้าว=Image 2" pairing used in the examples below is illustrative
  of one specific two-character case only, not a fixed identity-to-number mapping —
  confirmed production bug: a manifest with only ONE entry for ใบข้าว, `index: 1`,
  still got written up as "Image 2," an image that was never attached, because the
  number carried over from habit instead of being read from the actual manifest
  given for that call). A manifest with exactly one entry means that character is
  ALWAYS "Image 1," regardless of who they are or what index they carried in any
  other shot — read `index` fresh from the manifest every single time.
- **`target_audience_region`** — when present, mention its `descriptor` as the
  DEFAULT look for any person in the scene whose ethnicity/region is not already
  implied by the scene or by their own established appearance. Always phrase it as
  a fallback default, never as an override — an already-established character look
  wins.
- **`product_lock`** — when `active` is true, name the product (`product_name`) and
  describe it (`product_description`) if given, then state that it must appear
  EXACTLY as shown — identical shape, proportions, size, colors, materials, logo,
  and label text; never redesigned, restyled, recolored, resized, or reinvented as
  a variant. Add the matching negative-prompt terms: `altered product design, wrong
  product color, distorted logo, modified packaging, redesigned product`.

## Prompt length limit — MANDATORY

`prompt` MUST be **3500 characters or fewer** (the same hard cap used across every
other Vertical Drama image-prompt skill in this pipeline). Write vivid, specific
language within that budget — do not pad with repeated adjectives or restate the
same detail in multiple phrasings. If a shot's scene content plus this action's
required instructions would exceed the limit, prioritize (in order): the preserved
scene content, the identity lock, this action's own mandatory instruction (grid
layout + no-text, or the repair change) — and compress the least story-critical
detail first. A downstream quality-control pass will refine/compress any prompt
still over the limit, but a well-written prompt should not rely on that fallback.
