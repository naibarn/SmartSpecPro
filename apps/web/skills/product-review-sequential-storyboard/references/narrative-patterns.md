# Narrative Patterns Reference — Category-Conditional 9-Shot Structures

This file is the deep-dive companion to Phase D (Plan Narrative) and Phase E
(Write Continuous Dialogue) in `skill.md`. It elaborates how the default
nine-shot structure re-weights per product category. It never overrides
evidence, claim-safety, or guardian rules — it only shapes which beat gets
emphasis and how much screen time it earns.

## Default nine-shot structure (baseline)

1. Hook — no fabricated emergency, fear, unsupported health warning, false
   scarcity, or price hook.
2. Product reveal.
3. Who it suits (driven by `target_audience` when supplied).
4. Primary function demo.
5. Secondary function demo.
6. Design / construction feature.
7. Material / tactile detail.
8. Real-use demo + result.
9. Balanced summary + soft CTA (no price, no urgency).

Feature-selection priority when choosing what fills beats 4-7: visually
demonstrable → primary purchase-decision driver → seller-described →
safely explainable → fits the shot's `duration_seconds` budget. A feature
that cannot be demonstrated within evidence is narrated as a benefit
(`benefit_narration`) instead of staged as a demo.

## Category-conditional emphasis

The structure above is the fallback for every category. The following
categories re-weight beats; all other categories keep the default order and
emphasis unless the runner-injected category rule file says otherwise:

- **Furniture** — emphasize scale/dimension proof (a hand or object for
  scale), adjustment mechanisms (height/recline/fold), and movement (drawer
  slide, door swing, wheel roll) across beats 4-6. Assembly beats default
  **OFF**: unless `evidenceProfile.assembly_documented` is true, do not stage
  assembly, disassembly, or exploded-parts beats — pivot to
  `benefit_narration`/`problem_solution` over the finished, fully-assembled
  piece (see `demonstration-evidence.md`).
- **Electronics** — emphasize ports/inputs, physical controls, and stated
  (not invented) compatibility across beats 4-6. Never invent on-screen UI,
  app screenshots, or unverified compatibility claims.
- **Child products** — every beat that could show a child on-screen must
  route through the guardian-presence rules (`guardian-presence.md`) first;
  age-appropriate usage and visible adult supervision take priority over a
  "wow" demo shot. Beat 3 ("who it suits") should state the intended age
  range only when supplied or clearly visible, never invented.
- **Food / beverage** — beats 4-7 may only show the supplied ingredients,
  portion, and packaging; taste/flavor may be narrated but never claimed as
  a health or nutritional outcome. No "tastes better than X" comparative
  claims.
- **Fashion / apparel, cosmetics, and other visually led categories** —
  keep the default order; let beats 6-7 (design feature, material/tactile
  detail) carry most of the category-specific proof (fabric texture, finish,
  weave, print placement, etc.) since these categories rarely have a
  mechanical "function demo" beat 4-5 in the traditional sense — in that
  case beats 4-5 may become "how it's worn/used" and "fit/comfort" instead
  of a literal mechanical demo, still visually demonstrable from the
  references.

## Worked example: children's desk chair (spec §11.4)

Product: a height-adjustable children's study chair with a mesh backrest, a
padded seat, adjustable armrests, casters and a footrest ring. The references
show the height lever, the armrests and the caster base clearly. The captured
text lists dimensions and the height range but contains **no assembly steps
and no parts list**, and no parts/diagram image is attached — therefore
`assembly_documented = false`. `child_subject_policy.productChildRelated =
true` and `childDepictionPlanned = true`, with an adult guardian reference
supplied.

This is the canonical teaching case for the assembly guard, so read the next
paragraph before the beat list. A production failure this skill exists to
prevent: for furniture, a planner with no assembly evidence invented an
assembly review — parts spreads, fasteners, step-by-step builds — showing
components that do not exist on the real product. Here the evidence documents
how the chair **operates** (lever, armrests, casters) but never how it
**assembles**. So: operation demos are allowed, assembly demos are forbidden,
and the beat that would normally show construction PIVOTS to benefit /
problem-solution framing over the finished, fully assembled chair.

1. **Hook** (`finished_product_showcase`) — the assembled chair in a bright
   study corner, no child yet, no fabricated urgency.
2. **Product reveal** (`finished_product_showcase`) — full silhouette, 3
   height-lock positions visible, non-slip base foot visible.
3. **Who it suits** (`benefit_narration`) — guardian is present in frame with
   the chair (no unaccompanied child yet); dialogue states the supported
   age/height range only if supplied.
4. **Primary function demo** (`usage_demo`) — the guardian's hands operate
   the height-lock lever moving between two of the three documented levels;
   this is an operation demo, not assembly, because the mechanism is already
   built and visibly operable in the references.
5. **Secondary function demo** (`feature_closeup`) — close-up on the safety
   armrests and non-slip base feet.
6. **Design / construction feature — THE PIVOT** (`problem_solution`, NOT
   `assembly_demo`) — `assembly_documented = false`, so no exploded view, no
   fasteners, no parts spread, no "easy to assemble" claim, and no
   what's-in-the-box beat. Instead, frame the visible construction of the
   FINISHED chair against the problem it solves: the mesh backrest and the
   fixed footrest ring shown as they appear in the references, with dialogue
   about the desk-fit problem they address. If the only interesting thing you
   can say about construction requires knowing how the parts join, say
   nothing about construction and narrate a benefit instead.
7. **Material / tactile detail** (`feature_closeup`) — seat material texture
   and finish.
8. **Real-use demo + result** (`usage_demo`) — the child is now shown seated
   correctly, with the guardian visible in the same frame per
   `guardian-presence.md`; if a guardian-safe framing is not achievable for
   this beat, pivot to hands-only or product-only instead of dropping the
   guardian.
9. **Balanced summary + soft CTA** (`benefit_narration`) — guardian and
   finished product together, no price, no urgency, one calm closing line.

Claims to exclude or soften in this example (spec §11.4):

- "ป้องกันสายตาเสีย" — unsupported medical claim, excluded outright.
- A load-capacity figure — usable only when text-verified, and then only in
  conditional wording, never as a guarantee.
- A pillow or headrest mentioned in the title but absent from the reference
  images — never depicted, never spoken (image-over-text policy).
- "กันลัดหัน 90 องศา" stated as a guarantee — rewrite as conditional design
  wording grounded in the visible armrest mechanism.

Unsafe → safe rewrite for this product:

```text
Unsafe: "ช่วยเด็กคงท่านั่ง 90 องศาและป้องกันสายตา"
Safe:   "ปรับระดับให้เหมาะกับโต๊ะได้ง่ายขึ้น และควรจัดโต๊ะกับเก้าอี้ให้เหมาะกับสรีระของผู้ใช้"
```

This example doubles as the real-LLM gate fixture teaching anchor (see
section-12): it is the canonical case that exercises assembly-evidence
gating (via the pivot at beat 6), guardian-presence gating, and category
re-weighting in one pass. A generated pack for this fixture that contains any
`assembly_demo` beat, any fastener/parts imagery, or an unaccompanied-minor
frame is a gate FAILURE.

## Furniture assembly default-off reminder

Restated because it is the most common category mistake: furniture products
frequently ship with assembly instructions in the real world, but this skill
must not assume assembly evidence exists just because the category is
furniture. Only `product_specs`/`product_description` explicit steps, a
supplied parts/exploded-diagram reference, or an explicit user confirmation
may set `assembly_documented = true`. Absent that evidence, every furniture
review defaults to showing the finished, fully-assembled piece.
