# Missing Product Reference & Place/Venue Promotion — v7

## 1. Core rule

A missing product image is not automatically a failure.

The system first answers a more important question:

> What is actually being promoted, reviewed, demonstrated or narrated?

The result becomes `PromotionTargetResolution`.

## 2. Decision matrix

| Situation | Resolution | Can continue? | Production rule |
|---|---|---:|---|
| Generic product named in idea, no product image | `physical_product` + `generic_allowed` | Yes | Use generic/unbranded visual; no real logo/packaging invention |
| Named branded product, no image, exact look not important | `physical_product` + `text_only_unverified` | Yes, with warning | Facts may be researched; visual identity remains non-exact |
| Named branded product, exact packaging/logo required | `physical_product` + `insufficient` | Planning yes, exact generation blocked | Require user/source-of-truth/verified official visual |
| Product visible inside Start Frame/scene | `physical_product` + `visible_in_scene` | Yes | Derive/crop target evidence; do not invent unseen sides/text |
| Idea is about the shop/location shown in scene image | `place_venue` | Yes | Reclassify environment image as promoted-place source-of-truth |
| Place image only shows one interior angle | `place_venue` | Yes, bounded | Stay within visible geometry or explicitly request/research more views |
| No product/place/service is promoted | `narrative_no_promotion` | Yes | Skip product/experience commercial models |

## 3. Product branch with no dedicated product image

### 3.1 Generic/unbranded product

Example:
`ผู้หญิงเอาครีมมาทาหน้า`

No brand is requested.

The Skill may invent only the minimum neutral prop needed for the action:

```text
generic cosmetic cream container
neutral packaging
no real trademark
no invented efficacy claim
```

Then normal ProductMechanism / Demonstration planning proceeds.

### 3.2 Named product, facts available but visual identity absent

Example:
`ยืนอธิบายโทรศัพท์ ExamplePhone X Pro`

The system separates:

```text
FACT IDENTITY
model/features/specifications
        from
VISUAL IDENTITY
shape/color/camera island/logo/UI/packaging
```

Research can establish the first. It does not automatically establish the second.

If exact visual identity is not required, the storyboard can continue with a placeholder/non-exact visual and an explicit warning.

If exact identity is required, generation of product-facing shots remains blocked until an appropriate source-of-truth visual exists.

### 3.3 Product visible inside another image

If a Start Frame or scene contains the product, the system may derive a product crop/reference.

Use it for:
- visible geometry;
- color;
- current orientation;
- relationship to the actor;
- visible brand marks when readable.

Do not infer:
- unseen rear packaging;
- unreadable label copy;
- unavailable UI screens;
- exact alternate colorways.

## 4. Place / shop / venue branch

When the idea says things such as:

- พาชมร้านนี้
- รีวิวบรรยากาศร้านตามภาพ
- แนะนำคาเฟ่นี้
- พาชมห้องพัก
- พาชมโชว์รูม
- ชวนมาเที่ยวสถานที่นี้

the `environment_reference` may be the commercial target itself.

The resolver records a semantic reclassification:

```text
original role:
environment_reference

semantic commercial role:
place_identity
venue_layout
visible_feature
place_atmosphere
```

The original role is retained for provenance.

## 5. What can be produced from one place image

A surprisingly useful multi-shot sequence is possible without pretending the model knows the whole venue.

Safe shot vocabulary:
- static presenter;
- subtle push-in / pull-out;
- modest pan / tilt;
- small arc/parallax;
- crop/detail insert;
- presenter points to visible features;
- seated interaction;
- visible counter/table interaction;
- signage close-up when actually visible;
- graphic callout;
- virtual map/location callout when factual data exists;
- reaction/testimonial shot.

Example 30 seconds:

```text
Shot 1 — 8s
Establish visible atmosphere + presenter hook

Shot 2 — 8s
Presenter naturally moves within the verified visible area and highlights seating/decor

Shot 3 — 8s
Detail-oriented view / interaction using elements that are actually visible

Shot 4 — 6s
Presenter reaction + verified CTA / venue hero
```

## 6. What one place image cannot safely prove

One interior image does not establish:
- exterior;
- parking;
- toilet;
- kitchen;
- private room;
- upper floors;
- pool/garden;
- other branches;
- nearby landmarks;
- accessibility facilities;
- operating hours;
- price/menu/service list.

Those need:
- another visual reference;
- a supplied fact;
- verified research;
- or a clearly marked stylized reconstruction.

## 7. Camera-motion limitation from a single image

A generated 3D-like camera move can reveal pixels/geometry that were never present in the source.

Therefore:

### Low-risk
- gentle push;
- gentle pull;
- moderate pan/tilt within frame context;
- small parallax;
- presenter movement against mostly stable environment.

### Higher-risk
- 180° orbit;
- walking through a doorway into unseen room;
- strong dolly around furniture;
- revealing the exterior from an interior-only reference.

High-risk moves require additional references or must be treated as synthetic/non-factual visualization.

## 8. Place dialogue policy

Dialogue is split into:

### Visible observation
Can be drafted from the image:
`มุมนี้ดูโปร่ง มีโต๊ะหลายแบบให้เลือกนั่ง`

### Subjective reaction
Can be drafted as character opinion:
`บรรยากาศตรงนี้ให้ความรู้สึกสบายมาก`

### Factual business claim
Needs user/research evidence:
`เปิด 24 ชั่วโมง`
`มีที่จอดรถ 50 คัน`
`มีห้องประชุมส่วนตัว`
`ราคาเริ่มต้น ...`

The Dialogue Agent receives the evidence class so it does not convert a visual guess into a business fact.

## 9. H3 relevance

MiniMax H3 can use place/venue images just as it uses product/person images in Ref2VA.

A venue reference can be mapped to:
- place identity;
- visible layout;
- atmosphere;
- style;
- signage.

When the venue image is also the hard Start Frame, the same H3 hard-frame vs Ref2VA exclusivity applies. The H3 Reference Planner resolves it using the v6/v7 rules.

Exact store signage and small text are still safer as verified post-composites when generation fidelity matters.

## 10. Narrative-only branch

Characters + scene + story do not imply a commercial.

Example:
`เด็กนั่งคุยกับแม่ในห้องนั่งเล่น`

If there is no promoted target:
- no ProductMechanism;
- no PlaceExperience;
- no forced Hero Product;
- no forced CTA;
- normal Script → Sequence → Shot → Video → QC remains available.
