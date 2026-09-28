# Claim Safety Reference — Prohibited / Safe Wording Catalog

This file is the deep-dive companion to the Governing Principles and Phase C
(claim whitelist) rules in `skill.md`. It is binding: every claim that reaches
dialogue or a prompt must be checked against this catalog in addition to the
confidence-level pipeline (`visual_verified`, `text_verified`,
`user_confirmed`, `conditional`, `unsupported`, `conflicting`). Category rule
files injected at runtime by the runner (from the shared
`product-reference-storyboard/references/product-categories/` library) sit on
top of this catalog — they may add category-specific restrictions, but they
never loosen anything banned here, and this catalog is never restated inside
those files or duplicated by TypeScript.

## Prohibited wording — always excluded, regardless of confidence or confirmation

Confirming an attribute with `confirmed_attributes` upgrades its evidentiary
confidence to `user_confirmed`; it never unlocks a wording category banned
below. A confirmed-true medical benefit still cannot be spoken as a medical
claim — it must be rewritten as a safe, evidence-scoped, non-medical benefit
statement or omitted.

**Superlatives / absolute claims** — always unsupported by a single seller
listing, always excluded:
- "ดีที่สุด" (the best), "อันดับหนึ่ง" (number one / best-selling rank),
  "เหนือกว่าทุกแบรนด์" (superior to every brand), "100%" used as an absolute
  performance/safety claim ("ป้องกันได้ 100%", "พอใจ 100%").

**Guarantee wording** — always excluded:
- "รับรองว่า…" (we guarantee that…), "เห็นผลทันที" (results immediately /
  instantly), "ไม่มีวันพัง" (will never break), "ใช้ได้ตลอดชีวิต" (lasts a
  lifetime) unless the seller supplied an explicit, exact warranty term (and
  even then, state the exact supplied warranty period only — never
  "lifetime"/"forever" wording).

**Medical / therapeutic claims** — always excluded, even when a plausible
design intent exists:
- "ใช้แล้วหาย…" (use it and your … is cured), "ป้องกันโรค" (prevents
  disease), "ป้องกันสายตาเสีย" (prevents eyesight damage/deterioration),
  "ไม่ปวดหลังแน่นอน" (guaranteed no back pain), or any claim that a product
  treats, cures, prevents, or diagnoses a medical condition.

**Fabricated popularity / sales claims** — always excluded unless the exact
figure was supplied verbatim in `product_description`/`product_specs`:
- invented "ขายดีที่สุดในไทย" (best-selling in Thailand), invented review
  counts, invented star ratings, invented "ลูกค้าพันคนบอกว่า…" (a thousand
  customers say…) without a supplied source.

**ALL price content** — always excluded from dialogue and from every visual
prompt, with no exception, regardless of `review_tone`, presets, or
`user_requirements`:
- spoken or on-screen price, discount percentage, "ราคาถูกที่สุด" (cheapest
  price), price comparison to a competitor or to a "normal price," flash-sale
  language, voucher/coupon codes, and shipping-price content. Detection is
  additionally backstopped by a TypeScript regex scan downstream, but the
  rewrite responsibility belongs to this skill, not the backstop.

## Safe wording — conditional / design-intent catalog

When a benefit is plausible from the product's construction but not provable
as a real-world outcome, narrate it as design intent, never as a proven
result:
- "ออกแบบมาให้…" (designed to…) — e.g. "ออกแบบมาให้รองรับสรีระได้ดีขึ้น"
  (designed to support posture better), never "แก้ปัญหาปวดหลังได้" (fixes
  back pain).
- "ช่วยให้ปรับ…ได้สะดวกขึ้น" (helps make adjusting … more convenient) — e.g.
  "ช่วยให้ปรับความสูงโต๊ะได้สะดวกขึ้น" (helps make adjusting the desk height
  more convenient), never "ปรับความสูงได้อย่างสมบูรณ์แบบ" (adjusts height
  perfectly).
- Prefer a visible, demonstrable action ("ปรับได้ 3 ระดับ", adjusts across 3
  levels) over an outcome claim ("นั่งสบายตลอดวัน", comfortable all day).

## Worked unsafe → safe rewrite (children's desk chair example, spec §11.4)

Product: a 3-level height-adjustable children's study chair with safety
armrests and a non-slip base, sold with photo evidence of the height-lock
lever and armrests but no clinical or ergonomic-study evidence.

- Unsafe (banned — medical + guarantee + superlative in one line):
  "เก้าอี้ตัวนี้ป้องกันโรคเด็กหลังค่อมได้แน่นอน 100% ดีที่สุดสำหรับเด็กทุกคน"
  ("This chair guarantees 100% prevention of a child's hunchback/kyphosis —
  the best chair for every child.") — invents a medical claim, an absolute
  guarantee, and an unsupported superlative in a single sentence.
- Safe rewrite (conditional design intent, visually grounded):
  "ออกแบบมาให้ช่วยพยุงหลังให้นั่งท่าตรงมากขึ้นระหว่างทำการบ้าน
  พร้อมที่ปรับความสูงได้ 3 ระดับให้เข้ากับส่วนสูงของเด็ก"
  ("Designed to help support a straighter sitting posture while doing
  homework, with a 3-level height adjustment to fit the child's height.") —
  states only the visually verified adjustable-height mechanism and a
  hedged, non-medical posture benefit.

## Interaction with `forbidden_claims` and category rules

- `forbidden_claims` (input) is a hard, unconditional exclusion list layered
  on top of everything above — if a topic or phrase appears there, it is
  excluded even if it would otherwise pass every confidence and wording
  check.
- Category-specific fidelity files injected by the runner may add further
  restrictions (e.g. a stricter "no comparative performance claim" rule for
  electronics) but must never be read as permission to use anything banned
  in this file.
