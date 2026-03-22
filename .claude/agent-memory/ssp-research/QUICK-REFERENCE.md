# Fashion & Clothing Reviewer — Quick Reference Guide

**For**: Implementation Team
**Date**: 2026-03-10
**Purpose**: Fast lookup of key specs, fields, and legal requirements

---

## TL;DR: What to Build

**File**: `apps/web/skills/fashion-clothing-reviewer/`

**Three files**:
1. `skill.md` (335 lines) — LLM system prompt for fashion expertise
2. `schemas/ui.schema.json` (275 lines) — 5-section form with 15 fields
3. `schemas/input.schema.json` (170 lines) — Field validation schema

**Template**: Clone `beauty-skincare-reviewer` (more fields than household-product-reviewer)

**Timeline**: 4-6 hours

---

## 15 FORM FIELDS (Quick Lookup)

### Universal (Shared with all reviewers)
```
topic            textarea  optional    — Product name or description
language         select    required    — en/th (default: th)
reference_images upload    optional    — Product photos
storytelling     select    optional    — 14 narrative templates
length           select    required    — short/medium/long (default: medium)
word_count       number    optional    — Override word limit (80-3000)
output_format    select    required    — markdown or plain_text (default: markdown)
include_pricing  boolean   optional    — Add pricing analysis (default: false)
```

### Fashion-Specific (NEW)
```
clothing_type    select    required    — 12 types: tops, bottoms, dresses, outerwear,
                                         shoes, bags, accessories, watches, intimates,
                                         activewear, sleepwear, general (default: general)

fabric_material  multi     optional    — 13 options: cotton, polyester, silk, linen,
                                         denim, leather, suede, wool, nylon, spandex,
                                         recycled, synthetic_blend, other

fit_profile      select    optional    — 8 body types: petite, tall, plus_size,
                                         athletic, pear_shaped, apple_shaped,
                                         standard, general (default: general)

special_features multi     optional    — 12 properties: waterproof, water_resistant,
                                         UV_protection, breathable, stretch,
                                         wrinkle_resistant, quick_dry, thermal,
                                         reflective, hypoallergenic, pockets,
                                         adjustable_fit

condition        select    optional    — 5 states: new, secondhand_preloved,
                                         vintage, restored, handmade_custom
                                         (default: new)

care_complexity  boolean   optional    — Enable care/maintenance section
                                         (default: false)

sustainability_  boolean   optional    — Frame through eco-conscious lens
focus                                   (default: false)

review_angle     select    required    — 7 perspectives: fit_comfort,
                                         style_versatility, durability_value,
                                         quality_craftsmanship, first_impression,
                                         long_term_wear, sustainability
                                         (default: first_impression)
```

---

## UI SCHEMA: 5 SECTIONS

```
Section 1: Product Info
  └─ topic, reference_images, clothing_type, language
  └─ Icon: shopping-bag
  └─ Required: clothing_type, language

Section 2: Fit & Materials
  └─ fit_profile, fabric_material, special_features
  └─ Icon: dress
  └─ All optional

Section 3: Product Details
  └─ condition
  └─ Icon: info
  └─ Optional

Section 4: Review Style
  └─ review_angle, storytelling_style, include_pricing
  └─ Icon: message-circle
  └─ Required: review_angle

Section 5: Care & Output (Collapsed by default)
  └─ care_complexity, sustainability_focus, length, word_count, output_format
  └─ Icon: settings
  └─ Required: length, output_format
```

---

## LEGAL COMPLIANCE: PROHIBITED CLAIMS

### ILLEGAL Claims (Don't Allow in Skill Output)

| Claim Type | WRONG | RIGHT |
|------------|-------|-------|
| Fiber | "100% cotton" (unverified) | "Tag states 100% cotton" |
| Material | "Genuine leather" (no tag) | "Tag states genuine leather" |
| Authenticity | "[Brand] is authentic" (unverified) | "Appears authentic; professional verification recommended" |
| Durability | "Lasts 5+ years guaranteed" | "Designed for durability; depends on care" |
| Sizing | "Fits everyone" | "Fit my [body type] well; varies by type" |
| Sustainability | "100% eco-friendly" (no cert) | "Labeled as [cert]; verify independently" |
| Counterfeits | ANY positive review of fake | [REFUSE GENERATION] |

---

## THAI REGULATIONS: 3 KEY LAWS

### 1. Consumer Protection Act (พ.ศ. 2558)
- Fiber content must match tags (TIS 443-2558: ±3% tolerance)
- Origin, care, sizing claims must be accurate
- No false advertising or misleading claims
- **Penalty**: 5K-100K THB fine

### 2. Trademark Act (พ.ศ. 2559)
- Counterfeits prohibited (4-20 years prison + 40K-400K THB fine)
- SmartSpecPro could be liable for hosting counterfeit reviews
- **Mitigation**: Skill REFUSES counterfeits with error message

### 3. Thai Industrial Standard TIS 443-2558
- Fiber content labels required (all fibers ≥5%)
- Listed in descending weight order
- Reviews must reference the TAG, not claims

---

## SKILL.MD: KEY SECTIONS

```
Lines 1-14     Frontmatter YAML
Lines 16-30    Expert persona (fashion knowledge, fit expertise)
Lines 32-75    Input interpretation (15 fields → writing instructions)
Lines 77-140   Output requirements (format, TTS, language)
Lines 142-160  Image analysis rules
Lines 162-190  Pricing guidelines
Lines 192-300  Legal compliance table (see below)
Lines 302-340  Storytelling structures (14 templates from household/beauty)
Lines 342-365  Recommended review structure (10-11 sections)
Lines 367-end  Output format examples
```

---

## LEGAL COMPLIANCE TABLE (For skill.md)

Insert this complete table in skill.md around line 200:

```markdown
## Content Integrity & Legal Compliance (STRICT)

### 1. Fiber Content Claims (TIS 443-2558)
- NEVER claim fiber percentages unless from product tag
- NEVER claim "100% pure [fiber]" without tag verification
- Safe: "Tag states 100% cotton; care and shrinkage depend on methods"

### 2. Authenticity (Trademark Act)
- NEVER claim counterfeit products are authentic (ILLEGAL)
- NEVER write reviews of suspected fakes
- Safe: "Appears authentic based on visual inspection. Professional
  verification recommended for luxury items."

### 3. Durability Claims (Consumer Protection Act)
- NEVER guarantee longevity ("lasts 5+ years", "never fades")
- NEVER claim "indestructible" or "permanent"
- Safe: "Designed for durability; longevity depends on care frequency"

### 4. Sizing Accuracy
- NEVER claim universal fit ("fits everyone", "one-size-fits-all")
- NEVER claim sizing without body type qualifier
- Safe: "Fit my [petite/tall/plus-size] body well; sizing varies by type"

### 5. Sustainability (Hedging Required)
- NEVER claim "eco-friendly" without visible certification
- NEVER claim "fair trade" or "organic" without logos
- Safe: "Tagged as fair trade; recommend verifying certification independently"

### 6. Secondhand Authenticity
- NEVER guarantee authenticity of used luxury goods
- NEVER claim "100% authentic [brand]" without professional verification
- Safe: "Appears authentic; professional authentication recommended
  before purchase of high-value items"

### Regulated Product Categories

| Category | Prohibited | Required Disclaimer |
|----------|-----------|---------------------|
| Fiber claims (เส้นด้าย) | Unverified %, "pure" claims | "Fiber content per tag: [%]. Care/shrinkage depend on laundering methods." |
| Authenticity (ของแท้) | Unverified claims, counterfeits | "Professional verification recommended for luxury items." |
| Durability (ความทนทาน) | Guarantees, "never" claims | "Longevity depends on care frequency and methods." |
| Sizing (ขนาด) | Universal fit claims | "Review based on [body type]. Sizing varies by type." |
| Sustainability (ความยั่งยืน) | Unverified eco-claims | "Verify certifications independently (Fair Trade, GOTS, B Corp)." |
| Secondhand (มือสอง) | Unverified authenticity | "Professional authentication recommended for high-value items." |
| Counterfeits (ปลอม) | ANY positive review | [SKILL REFUSES GENERATION] |
```

---

## FIELD HANDLING: When to Show/Hide Sections

```typescript
// UI logic:

If care_complexity = true:
  → Show "Care & Maintenance" section in output
  → Include: wash methods, dry methods, storage tips, longevity projections

If sustainability_focus = true:
  → Show "Sustainability & Values" section in output
  → Include: material certifications (GOTS, Fair Trade, B Corp, etc.)
  → Require: visible certification logos (no unverified claims)

If fit_profile ≠ "general":
  → Include body type in fit discussion
  → Example: "As a petite reviewer (5'2"), sleeves ran long..."

If fabric_material specified:
  → Include material-specific care guidance
  → Example: Silk = hand-wash; Denim = cold water, color-bleed warning

If special_features specified:
  → Test and assess each feature
  → Example: "Waterproof fabric held up in light rain; seams sealed"

If condition = "secondhand_preloved" or "vintage":
  → Add authenticity assessment section
  → Include condition assessment (wear, stains, patina)
  → Add professional authentication disclaimer

If include_pricing = true:
  → Add value-for-money assessment
  → Include price-per-wear estimate for fashion
```

---

## ERROR HANDLING: When to REJECT

```
Reject if:

1. Topic + reference_images both empty
   → Error: "Provide product name or images"

2. Topic mentions counterfeit indicators:
   ("fake", "replica", "counterfeit", "knockoff", "dupe")
   AND clothing_type in [bags, accessories, watches]
   → Error: "This skill cannot review counterfeit products.
     SmartSpecPro does not support counterfeit sales."

3. clothing_type invalid enum value
   → Error: "Invalid clothing type"

4. word_count outside 80-3000 range
   → Error: "Word count must be 80-3000"

5. fabric_material contains invalid enum
   → Error: "Invalid fabric material"

6. condition = "secondhand_preloved" AND no authentication disclosure possible
   → Warning: "Recommend enabling authentication disclosure for secondhand items"
```

---

## TEST CHECKLIST (Before Deployment)

```
[ ] Generate review: Cotton T-shirt (new, simple)
    Expected: 500 words, Thai, first-impression, no deep care

[ ] Generate review: Designer denim (new, fit-sensitive)
    Expected: 800 words, English, fit + care + pricing

[ ] Generate review: Vintage leather jacket (secondhand, authentic)
    Expected: 600 words, Thai, authentication + sustainability

[ ] Generate review: Activewear (new, petite fit)
    Expected: 700 words, English, fit-specific + performance

[ ] Generate review: Luxury bag secondhand (preloved)
    Expected: 600 words, Thai, authentication + sustainability

[ ] Verify all Thai labels display correctly in UI

[ ] Verify legal compliance language is accurate

[ ] Verify counterfeit rejection works with error message

[ ] Verify care_complexity boolean toggles care section

[ ] Verify sustainability_focus toggles sustainability section

[ ] Verify all 14 storytelling templates render without template name

[ ] Check output quality matches beauty-skincare-reviewer
```

---

## LINE COUNTS (For Reference)

```
skill.md            ~335 lines
  - Household ref   ~245 lines
  - Beauty ref      ~274 lines

ui.schema.json      ~275 lines
  - Household ref   ~197 lines
  - Beauty ref      ~235 lines

input.schema.json   ~170 lines
  - Household ref   ~77 lines
  - Beauty ref      ~90 lines
```

---

## KEY FILE LOCATIONS

**Reference implementations** (for copying structure):
- `apps/web/skills/beauty-skincare-reviewer/skill.md` ← USE THIS as template
- `apps/web/skills/beauty-skincare-reviewer/schemas/ui.schema.json` ← USE THIS
- `apps/web/skills/household-product-reviewer/` ← Alternative, simpler template

**Research documents** (in `.claude/agent-memory/ssp-research/`):
- `FINDINGS-CHECKLIST.md` ← All verified findings
- `fashion-reviewer-legal-framework.md` ← Detailed Thai regulations
- `fashion-reviewer-implementation-spec.md` ← Complete field specs + JSON templates
- `fashion-clothing-reviewer-research.md` ← Full analysis + options

---

## QUICK COPY-PASTE: Frontmatter

```yaml
---
name: Fashion & Clothing Reviewer
slug: fashion-clothing-reviewer
description: Write honest, story-driven reviews for fashion and clothing items with fit, fabric, and sustainability guidance
category: article_generation
icon: dress
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only
---
```

---

## QUICK COPY-PASTE: Review Angle Options (For input.schema.json)

```json
"review_angle": {
  "type": "string",
  "enum": ["fit_comfort", "style_versatility", "durability_value",
           "quality_craftsmanship", "first_impression",
           "long_term_wear", "sustainability"]
}
```

---

**Last Updated**: 2026-03-10
**Next Review**: After implementation + testing
**Maintainer**: Implementation team

---

**End of Quick Reference**
