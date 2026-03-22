# Fashion & Clothing Reviewer Skill — Comprehensive Research

**Date**: 2026-03-10
**Status**: Analysis Complete — Ready for Implementation Planning
**Recommendation**: Build Fashion-Clothing-Reviewer skill using Option B (Fashion-Specific Customization)

---

## 1. EXISTING REVIEW SKILL PATTERN ANALYSIS

### Structure & Architecture

All reviewer skills in SmartSpecPro follow an identical 3-file pattern:

#### skill.md (System Prompt)
- **Lines**: 245-274 lines per skill
- **Structure**:
  1. Frontmatter YAML metadata (name, version, author, category, icon, execution_mode)
  2. Expert persona introduction (tone, domain scope, product categories)
  3. "How to interpret the form inputs" section (mapping of form fields to writing instructions)
  4. "Output requirements" (format rules, TTS safety, language-specific guidance)
  5. Tone & style guidelines (genuineness, hedging language, anti-hard-sell)
  6. Specialized handling rules (image analysis, pricing, ingredients/materials)
  7. 14 Storytelling narrative structures (HPSO, AIDA, PAS, FAB, STAR, etc.)
  8. "Recommended review structure" (suggested 5-11 sections)
  9. "Content Integrity & Legal Compliance (STRICT)" — mandatory rules per category
  10. Output format examples (markdown vs plain_text)

#### ui.schema.json (Custom Form UI)
- **Format**: SkillInputSchema with sections, fields, bilingual labels
- **Typical sections**: 3-4 collapsible sections (product, skin/fit profile, style, options)
- **Fields per section**: 2-5 form fields
- **Bilingual**: All labels, help text, placeholders translated to Thai
- **Icons**: Visual organization with Lucide icon names

#### input.schema.json (Validation Schema)
- **Format**: JSON Schema (draft 2020-12)
- **Size**: ~90 lines per skill
- **Validation**: enum constraints, min/max for numbers, required fields
- **Direct mapping**: Matches ui.schema field IDs to input.schema properties

### Shared Universal Fields (All Reviewers)

```
topic                  (textarea, required)     — Product name or description
language               (select, required)       — en/th language choice
reference_images       (image upload, optional) — Product photos for AI analysis
storytelling_style     (select, optional)       — 14 narrative structure templates
length                 (select, required)       — short/medium/long duration
word_count             (number, optional)       — Override for exact length
output_format          (select, required)       — markdown or plain_text (TTS)
include_pricing        (boolean)                — Add pricing and value assessment
```

### Domain-Specific Fields

#### Household Product Reviewer adds:
- **product_category**: 12 options
  - cleaning, kitchen, laundry, organization, tools, baby_kids, elderly_care, bathroom, bedroom, cookware, gadgets, general
- **review_angle**: 5 perspectives
  - problem_solution, daily_life, comparison, first_impression, long_term

#### Beauty & Skincare Reviewer adds:
- **product_type**: 9 types
  - skincare, makeup, haircare, bodycare, fragrance, sunscreen, tools, supplement, general
- **skin_type**: 7 types (TARGET AUDIENCE personalization)
  - oily, dry, combination, sensitive, normal, acne_prone, all
- **review_focus**: 7 angles (extends storytelling perspective)
  - ingredients, texture, routine_fit, value, comparison, first_impression, long_term
- **include_ingredients**: boolean toggle
  - Triggers dedicated ingredient analysis section in output

---

## 2. FASHION/CLOTHING DOMAIN REQUIREMENTS

### Unique Characteristics vs. Other Domains

| Aspect | Household | Beauty | Fashion | Impact |
|--------|-----------|--------|---------|--------|
| **Variability** | Same product across buyers | Skin type variation | Sizing + fit variation | Need fit_profile field |
| **Fit/Comfort** | N/A | Application comfort | CRITICAL (S/M/L, runs large) | New primary field |
| **Materials** | Usage-agnostic | Ingredient-specific | CRITICAL (cotton, synthetic) | New field: fabric_material |
| **Care/Maintenance** | Usage instructions | Skincare routine | CRITICAL (wash, dry-clean) | New field: care_complexity |
| **Product Lifecycle** | Mostly new | Mostly new | new + secondhand + vintage | New field: condition |
| **Special Properties** | Generic features | Skin benefits | Technical (waterproof, stretch) | New field: special_features |
| **Sustainability** | Generic eco-claims | Supplement-specific | MAJOR marketing angle | New field: sustainability_focus |
| **Authenticity Risk** | Low (mass-produced) | Low (brands regulated) | HIGH (counterfeits common) | Special legal section required |

### Critical Fashion-Specific Form Fields

#### 1. clothing_type (Replaces product_type)
**Purpose**: Genre-specific review angle tailoring

**Options (9-12 types)**:
- tops (shirts, blouses, sweatshirts, t-shirts, crop tops)
- bottoms (jeans, pants, skirts, leggings, shorts)
- dresses (casual, formal, midi, maxi, bodycon)
- outerwear (jackets, coats, blazers, vests, cardigans)
- shoes (sneakers, heels, flats, boots, sandals, loafers)
- bags (handbags, backpacks, crossbody, clutches, totes, wallets)
- accessories (scarves, hats, belts, gloves, sunglasses)
- watches
- intimates (underwear, socks, bras, shapewear)
- activewear (sports, yoga, gym clothes)
- sleepwear
- general

**UI Impact**: Changes example images, tone, fit context

#### 2. fabric_material (NEW — Multi-select or Array)
**Purpose**: Material-specific durability, care, and sustainability guidance

**Options (Select multiple)**:
- cotton (breathable, washable, may shrink)
- polyester (durable, synthetic, easy-care)
- silk (luxe, delicate, dry-clean often)
- linen (breathable, wrinkles, natural)
- denim (heavy, durable, indigo bleed risk)
- leather (luxury, requires conditioning, animal product)
- suede (delicate, stains easily)
- wool (warm, natural, may itch, pilling risk)
- nylon (synthetic, durable, water-resistant)
- spandex/elastane (stretch, support)
- recycled materials (sustainability angle)
- synthetic blend (specify in topic)
- other

**Output Impact**:
- Triggers "care and maintenance" section
- Sustainability messaging if recycled materials selected
- Durability expectations based on fabric type

#### 3. fit_profile (Replaces skin_type — Target Audience Personalization)
**Purpose**: Tailor fit/sizing experience to specific body types

**Options (7-8 types)**:
- petite (shorter, smaller proportions)
- tall (longer, taller proportions)
- plus_size (inclusive sizing perspective)
- athletic (muscular, defined fit)
- pear_shaped (wider hips, narrower shoulders)
- apple_shaped (carry weight in torso)
- standard (average proportions)
- general (unspecified, neutral tone)

**Output Impact**:
- Example: "As a petite reviewer, the sleeves were too long, but the waist hit at perfect proportion"
- Helps reviewers understand if product fits their body type
- Addresses a real gap in traditional reviews ("does it fit small people?")

#### 4. special_features (NEW — Checkbox Multi-Select)
**Purpose**: Technical properties that affect usability

**Options**:
- waterproof (rain, moisture protection)
- water_resistant (splash-resistant only)
- UV_protection (sun protection level)
- breathable (airflow, moisture-wicking)
- stretch (elasticity, movement)
- wrinkle_resistant (low-maintenance)
- quick_dry (fast moisture evaporation)
- thermal (insulation, warmth)
- reflective (visibility, safety)
- sustainable (eco-friendly claim)
- hypoallergenic (low-irritant materials)
- pockets (surprisingly important!)
- adjustable_fit (customization)

**Output Impact**: Triggers performance assessment sections in review

#### 5. condition (NEW — Select)
**Purpose**: Product lifecycle stage — new vs secondhand affects expectations

**Options**:
- new (unworn, with tags)
- secondhand_preloved (gently used, no damage)
- vintage (older item, retro/classic)
- restored (secondhand, professionally cleaned/repaired)
- handmade_custom (bespoke, artisan)

**Output Impact**:
- New: Standard review with durability predictions
- Secondhand/Vintage: Authenticity concerns, condition assessment, finding value
- Vintage: Historical/retro appeal, rarity, wear as character
- Restored: Quality of restoration, original vs renewed aesthetics

#### 6. care_complexity (NEW — Boolean Toggle)
**Purpose**: Determines if detailed care guidance is needed

**Default**: false
**When true**: Triggers "Care & Maintenance" section covering:
- Washing instructions (machine vs hand-wash)
- Drying methods (air dry, tumble, flat)
- Ironing/heat requirements
- Storage tips
- Color-bleeding risks
- Shrinkage expectations
- Longevity projections based on care

**Output Impact**: Affects section count and depth of care guidance

#### 7. sustainability_focus (NEW — Boolean Toggle)
**Purpose**: Emphasize eco-friendly and ethical aspects

**Default**: false
**When true**: Triggers "Materials & Sustainability" section covering:
- Organic certification (if verifiable from tag/images)
- Recycled content (% if visible, or qualified guesses)
- Fair-trade claims (with hedging: "claimed as fair-trade")
- Carbon footprint/shipping impact
- Company sustainability record (if well-known)
- Durability-sustainability tradeoff
- Secondhand as sustainability option

**Output Impact**: Frames entire review through eco-conscious lens

---

## 3. LEGAL COMPLIANCE & REGULATORY REQUIREMENTS

### Thai-Specific Fashion/Textile Regulations

#### 3.1 Consumer Protection Act (พระราชบัญญัติ คุ้มครองผู้บริโภค พ.ศ. 2558)
- **Applies to**: Fiber content claims, durability claims, sizing accuracy
- **Key requirement**: Fiber content must be labeled; claims must match label
- **Violation**: Overstating quality, false origin, misrepresenting fit
- **Penalty**: Fines up to 100,000 THB, product seizure

#### 3.2 Textile Product Labeling Standards (Thai Industrial Standard TIS 443-2558)
- **Requires**: Fiber composition % on garment tags
- **Acceptable claims**: Only claims matching actual fiber composition
- **Example**: Can claim "cotton/polyester blend" only if tag shows the %
- **Violation**: Claiming "100% cotton" when tag says "65% cotton / 35% polyester"

#### 3.3 Trademark & Counterfeiting Protection (Trademark Act, B.E. 2559)
- **High risk area**: Fashion brands (Gucci, Louis Vuitton, Nike, etc.)
- **Review concern**: Reviews of counterfeit goods are illegal to knowingly publish
- **Recommended approach**:
  - Never explicitly claim a product is a "fake" or "replica"
  - If authenticity is doubtful, frame as "appears authentic based on product images" or "tag indicates [brand]"
  - For secondhand: "seller claims authentic; cannot personally verify" approach
  - If product obviously fake: DO NOT WRITE THE REVIEW

#### 3.4 E-commerce Platform Liability (Ministry of Commerce Guidelines)
- **Platforms accountable**: If they knowingly host counterfeit product reviews
- **SmartSpecPro risk**: Users may request reviews of counterfeit items
- **Safeguard**: Skill must explicitly warn against writing reviews of suspected fakes

### EU/International Textile Standards (if reviews reach EU market)

#### ISO 1833 — Fiber Composition Testing
- Prescribes methods for determining fiber percentages in textiles
- Reviews should not claim "100% pure" unless verified by ISO 1833 testing
- Safe language: "Labeled as 100% cotton" not "Guaranteed 100% cotton"

#### GDPR/Consumer Rights Directive
- If reviews are used in commercial marketing, must comply with misleading advertising rules
- All percentage claims (fiber %, shrinkage) must be hedged: "typically", "may", "label states"

### Skill.md Regulatory Table for Fashion

**Critical addition to fashion-clothing-reviewer skill.md**:

| Category | Prohibited Claims | Required Disclaimer |
|----------|-------------------|---------------------|
| Fiber Content Claims (เส้นด้าย/ผ้า) | "100% pure cotton" (unverified), "genuine leather" (unverified), "cashmere blend" (incorrect %), false origin ("Italian made" if made elsewhere) | EN: "Fiber content per product tag: [list percentages]. Actual care/shrinkage may vary. Verify tag before purchase." / TH: "ส่วนประกอบเส้นด้ายตามฉลาก: [ระบุ%] การดูแลและการหดตัวอาจแตกต่างกัน ตรวจสอบฉลากก่อนซื้อ" |
| Durability Claims (ความทนทาน) | "Will last 5 years guaranteed", "never fades", "indestructible" | EN: "Longevity depends on care frequency and methods. Personal experience may vary." / TH: "ความทนทานขึ้นอยู่กับความถี่และวิธีการดูแล ประสบการณ์อาจแตกต่างกัน" |
| Authenticity (ของแท้) | Claiming counterfeit is authentic, "100% genuine [brand]" without certification, "authentic designer replica" | EN: "Authenticity assessment based on visual inspection only. For high-value items, recommend professional authentication." / TH: "การตรวจสอบความเป็นของแท้อิงตามการตรวจสอบด้วยสายตาเท่านั้น สำหรับสินค้ามูลค่าสูง แนะนำการตรวจสอบโดยผู้เชี่ยวชาญ" |
| Sizing Accuracy (ขนาด) | "Fits everyone", "runs exactly true to size" (variation exists by brand), "perfect fit guaranteed" | EN: "Fit is subjective and varies by body type. This review based on [specific body type] fit experience." / TH: "ความพอดีของสินค้าเป็นเรื่องส่วนตัว และแตกต่างกันตามยี่ห้อ รีวิวนี้อิงตามประสบการณ์ของ [ประเภทร่างกาย]" |
| Origin Claims (ที่มา) | "Made in [country]" (if tag differs), "imported from [country]" without verification | EN: "Origin per product label: [country]. Verify label for actual manufacturing location." / TH: "ประเทศผลิตตามฉลาก: [ประเทศ] ตรวจสอบฉลากเพื่อยืนยันสถานที่ผลิต" |
| Secondhand/Vintage Authenticity (สินค้ามือสอง) | Claiming secondhand brand item is 100% authentic without professional verification | EN: "Authenticity of secondhand items based on visual inspection. For valuable items, professional authentication recommended before purchase." / TH: "การตรวจสอบสินค้ามือสองอิงตามการตรวจสอบด้วยสายตา สำหรับสินค้ามูลค่าสูง แนะนำให้ตรวจสอบโดยผู้เชี่ยวชาญก่อนซื้อ" |
| Sustainability Claims (ความยั่งยืน) | "100% eco-friendly", "carbon neutral" (unverified), "saves the environment" (broad claim), "fair trade" without certification | EN: "Sustainability claims based on product labeling and company statements. Recommend verifying certifications independently (Fair Trade, GOTS, B-Corp, etc.)." / TH: "การอ้างสิทธิด้านความยั่งยืนอิงตามฉลากสินค้าและข้อความของบริษัท แนะนำให้ตรวจสอบการรับรองอย่างอิสระ (Fair Trade, GOTS, B-Corp ฯลฯ)" |
| Counterfeit Products (สินค้าปลอม) | ANY positive review of a product known/suspected to be counterfeit | EN: "This review is for the advertised [brand] product only. Counterfeit products are illegal and cannot be reviewed." / TH: "รีวิวนี้เป็นสำหรับสินค้า [แบรนด์] ตามที่โฆษณา สินค้าปลอมเป็นสิ่งผิดกฎหมายและไม่สามารถเขียนรีวิวได้" |

---

## 4. DETAILED FIELD MAPPING & OUTPUT STRUCTURE

### Form Fields to Skill Prompt Mapping

```typescript
// Input fields → How skill.md uses them

topic                  → "Product name or description to review (required)"
language               → "Write entire review in this language (en/th)"
clothing_type          → "Tailor review tone, fit context, sizing expectations"
fabric_material[]      → "Include care requirements, durability, sustainability"
fit_profile            → "Write from perspective of [petite/tall/plus/standard] reviewer"
special_features[]     → "Highlight performance: waterproof, stretch, breathability"
condition              → "If secondhand/vintage: assess authentication, rarity, condition"
care_complexity        → "If true: include detailed care & maintenance section"
sustainability_focus   → "If true: frame through eco-conscious lens, highlight certifications"
review_angle           → "Storytelling perspective: fit_comfort, style_versatility, durability_value, quality_craftsmanship, first_impression, long_term_wear, sustainability"
storytelling_style     → "Narrative structure (14 templates: HPSO, AIDA, PAS, etc.)"
include_pricing        → "If true: add value-for-money, price-per-wear estimate"
length                 → "short (~300 words, 1 min) / medium (~500 words, 1.5 min) / long (~800 words, 3 min)"
word_count             → "Optional maximum; overrides length preset"
output_format          → "markdown (default) or plain_text (TTS-friendly)"
reference_images       → "Analyze product photos: color, fit, fabric texture, branding, tags visible"
```

### Recommended Review Structure (11 Sections)

For fashion/clothing reviews, suggest:

1. **Title** — Product name + compelling hook
   - Example: "Silk Slip Dress That Actually Stayed in Place — Finally!"

2. **Opening Hook** — Relatable fashion moment or frustration
   - "I've tried dozens of slip dresses that slipped right off at the dinner table..."

3. **First Impressions** — Unboxing, packaging, initial tactile feel
   - "The packaging arrived in a beautiful dust bag. The dress felt luxurious immediately."

4. **Product Introduction** — What it is, key claims, who it's for
   - "This is [Brand] silk charmeuse slip dress in blush, size M. Advertised as 100% silk."

5. **Fit & Sizing** (if fit_profile specified)
   - "As a petite reviewer (5'2"), the hem fell to mid-calf (longer than expected)..."

6. **Fabric & Materials Analysis** (if fabric_material specified)
   - "The tag confirms 100% mulberry silk. Seams are finished with raw-edge detailing."

7. **Performance & Special Features** (if special_features specified)
   - "Despite being slip dress, the fabric has enough weight to feel stable when moving."

8. **Real Wear Experience** — Styling, comfort, versatility
   - "I've worn it to dinners, layered under blazers, and as a beach cover-up..."

9. **Care & Maintenance** (if care_complexity = true)
   - "Hand-wash recommended per tag. Drip dry recommended, not tumble-dry."

10. **Sustainability & Values** (if sustainability_focus = true)
    - "The brand claims ethical sourcing; the tag states 'produced in [country]'..."

11. **Long-term Assessment** — Durability, repurchase decision, who would love it
    - "After 6 months of regular wear, the fabric still drapes beautifully. No pilling, no discoloration."

---

## 5. MISLEADING FASHION CLAIMS TO PREVENT

### Common Fashion Marketing Deceptions

| Deceptive Claim | How to Hedge in Review | Example Correction |
|---|---|---|
| "Designer quality" (no affiliation) | "evokes designer aesthetic" + avoid name-dropping | "For the price point, the construction feels upscale" |
| "Luxury fabric" (unverified) | "feels premium" + verify by tag, not marketing | "The tag confirms silk content; the drape feels luxurious" |
| "Fits all body types" | Specify: "fit my [body type] well, others may differ" | "As a pear-shaped reviewer, the hip room was generous" |
| "True to size" (brand variation) | "ran true to size (for this brand)" + caveat | "True to size for [brand], though fit varies by style within their range" |
| "Authentic [brand] inspired" | Never use this phrasing (implies fake or replica) | "Similar style to [brand]" or "inspired silhouette" |
| "High-quality leather" (untested) | "Labeled as leather" + honest assessment | "The tag states genuine leather; it feels substantial" |
| "Will last for years" | "Designed for longevity; longevity depends on care" | "With proper care, similar fabrics typically last several seasons" |
| "Ethically made" (unverified) | "Company claims ethical production; verify independently" | "The brand's website states fair-trade practices; recommend independent verification" |
| "Exclusive/limited edition" (marketing) | Never use; always note if it's still available | "Advertised as limited edition; check availability before purchase" |
| "Perfect for [activity]" (overstated) | "Suitable for [activity]; suitability varies by personal preference" | "Great for casual outdoor wear; more active sports may require technical gear" |

---

## 6. IMPLEMENTATION CHECKLIST

### Phase 1: Skill File Creation (2-3 hours)

- [ ] Create folder: `apps/web/skills/fashion-clothing-reviewer/`
- [ ] Create `skill.md` (280-300 lines)
  - [ ] Frontmatter YAML (name, version, author, category, icon)
  - [ ] Expert persona (fashion knowledge, authenticity awareness, size/fit expertise)
  - [ ] Input interpretation (map all 9 new + 8 shared fields)
  - [ ] Output requirements (TTS, markdown, language)
  - [ ] Tone & style (genuine fit experience, no hard-sell, honest about trade-offs)
  - [ ] Image analysis rules (analyze color, logo, tags, fabric texture)
  - [ ] Pricing guidelines (price-per-wear for fashion context)
  - [ ] 14 Storytelling structures (reuse from household/beauty)
  - [ ] Recommended review structure (11 sections, fashion-specific)
  - [ ] Legal Compliance section (fabric, authenticity, sizing, sustainability, counterfeit)
  - [ ] Output format examples

- [ ] Create `schemas/ui.schema.json` (220-250 lines)
  - [ ] Section 1: Product Info (topic, reference_images, clothing_type, language)
  - [ ] Section 2: Fit Profile (fit_profile, fabric_material, special_features)
  - [ ] Section 3: Review Angle (review_angle, storytelling_style, include_pricing)
  - [ ] Section 4: Care & Sustainability (care_complexity, sustainability_focus)
  - [ ] Section 5: Options (length, word_count, output_format)
  - [ ] All labels bilingual (EN + TH)
  - [ ] Help text for each field
  - [ ] Icons for sections
  - [ ] outputMapping section

- [ ] Create `schemas/input.schema.json` (130-150 lines)
  - [ ] topic: string (required)
  - [ ] language: enum ["en", "th"] (default "th")
  - [ ] clothing_type: enum (12 options, required, default "general")
  - [ ] fabric_material: array of enums (optional)
  - [ ] fit_profile: enum (7 options, default "general")
  - [ ] special_features: array of enums (optional)
  - [ ] condition: enum (5 options, default "new")
  - [ ] care_complexity: boolean (default false)
  - [ ] sustainability_focus: boolean (default false)
  - [ ] review_angle: enum (7 options, required)
  - [ ] storytelling_style: enum (14 options, optional)
  - [ ] include_pricing: boolean (default false)
  - [ ] length: enum ["short", "medium", "long"] (default "medium")
  - [ ] word_count: integer, min 80, max 3000 (optional)
  - [ ] output_format: enum ["markdown", "plain_text"] (default "markdown")
  - [ ] reference_images: array of URIs (optional)

### Phase 2: Testing & Validation (1-2 hours)

- [ ] Test with 5 sample products:
  - [ ] Cotton T-shirt (new, simple)
  - [ ] Designer denim (new, premium, fit-sensitive)
  - [ ] Vintage coat (vintage, secondhand, authentication concern)
  - [ ] Synthetic activewear (new, special features: breathable, quick-dry)
  - [ ] Secondhand luxury bag (preloved, sustainability focus)

- [ ] Validate skill.md compliance:
  - [ ] No trademark violations
  - [ ] All claims hedged appropriately
  - [ ] Thai regulations cited correctly
  - [ ] No counterfeit-supporting language

- [ ] Test UI/schema generation:
  - [ ] Fields render correctly
  - [ ] Thai labels display properly
  - [ ] Dependencies work (e.g., care_complexity reveals care section)

### Phase 3: Documentation & Deployment (1 hour)

- [ ] Add skill to registry (if auto-syncing)
- [ ] Verify skill.md icon displays in skill picker
- [ ] Add to skill library/menu if applicable
- [ ] Test end-to-end: form fill → review generation → output format

---

## 7. OPEN QUESTIONS & FUTURE ENHANCEMENTS

### Q1: Counterfeit Product Reviews — What's the right policy?
**Issue**: Users may request reviews of counterfeits. Should the skill:
- Refuse outright?
- Allow with prominent disclaimer?
- Allow visual analysis only ("appears to be labeled as [brand]")?

**Recommendation**: Refuse generation with error message:
```
"This skill cannot review counterfeit, fake, or replica products.
Please review only authentic products. If unsure of authenticity,
use the Authenticity Disclosure option to frame as 'appears authentic
based on labeling.'"
```

### Q2: Video Generation for Fashion Reviews — Visual styling component?
**Issue**: Fashion reviews benefit from outfit styling footage, try-on footage, fabric close-ups.
**Question**: Should there be a sister skill "fashion-review-video-generator" that:
- Takes the written review
- Generates AI try-on footage (pose model in outfit)?
- Includes fabric texture close-ups?
- Shows styling combinations?

**Current state**: Unknown — would need coordination with media generation services.

### Q3: Size Chart Integration — Should we pull real data?
**Issue**: "True to size" claims vary widely. Could SmartSpecPro:
- Embed brand size charts in the review context?
- Have users enter their size + typical size they wear?
- AI generates "this runs 1 size large" guidance?

**Current state**: Not implemented. Possible future feature.

### Q4: Secondhand Pricing Analysis — Price-per-wear calculation
**Issue**: Secondhand pricing is highly variable (eBay, Depop, ThriftPlus, etc.).
**Question**: Should care_complexity or condition fields trigger:
- Resale value guidance?
- How to evaluate secondhand pricing?
- Depreciation/durability ROI?

**Current state**: Not in plan, but valuable for secondhand-focused reviews.

### Q5: Sustainability Certification Lookup — Automated verification
**Issue**: Many sustainability claims are false (greenwashing).
**Question**: Could skill.md be enhanced with:
- List of verified certifications (Fair Trade Certified, GOTS, B Corp, etc.)?
- Links to certification databases?
- Warnings about unverified claims?

**Current state**: Only text-based hedging currently.

### Q6: Regional Size Standards — Per-market guidance
**Issue**: US vs EU vs Asian sizing differs drastically. Currently:
- fit_profile covers body types, not regional sizing
- Could add sizing_standard field: US, EU, Asian, UK?

**Current state**: Not included in field set; could be future addition.

### Q7: Fabric Care Database — Automated laundering guidance
**Issue**: Different fabrics need different care. Could:
- fabric_material selection auto-populate expected care guidance?
- Warn about incompatible care (e.g., wool + high heat = shrinkage)?

**Current state**: Manual care_complexity section; automation possible.

---

## 8. COMPARISON: IMPLEMENTATION OPTIONS SUMMARY

### Option A: Minimal Adaptation (NOT RECOMMENDED)
- Clone household-product-reviewer
- Swap product_category → clothing_type
- Rename review_angle fields
- **Cost**: 1-2 hours
- **Gap**: Missing fabric, fit, care, sustainability, authenticity fields
- **Quality**: Lower specificity; reads like generic product review

### Option B: Fashion-Specific Customization (RECOMMENDED)
- Clone beauty-skincare-reviewer structure (richer field set)
- Add 7 new fields (fabric_material, fit_profile, special_features, condition, care_complexity, sustainability_focus)
- Custom legal compliance section (counterfeit, fiber claims, sizing, authenticity)
- Custom storytelling angles (fit_comfort, style_versatility, durability_value, quality_craftsmanship)
- **Cost**: 4-6 hours
- **Coverage**: All fashion-specific domains
- **Quality**: High specificity; genuinely useful review structure

### Option C: Reusable Product Specifier Component (FUTURE)
- Create `@smartspec/product-specs` package
- Define spec templates (household, beauty, fashion, appliances, books, etc.)
- Refactor existing skills to use templates
- **Cost**: 8-12 hours
- **Benefit**: Scales to future reviewers; centralizes legal compliance
- **Timing**: Post-fashion-skill; overkill now

---

## 9. REFERENCE IMPLEMENTATIONS

### Key Files to Reference While Building

**Household Product Reviewer**:
- `/home/dev/projects/SmartSpecPro/apps/web/skills/household-product-reviewer/skill.md` (245 lines)
- `/home/dev/projects/SmartSpecPro/apps/web/skills/household-product-reviewer/schemas/ui.schema.json` (197 lines, 3 sections)
- `/home/dev/projects/SmartSpecPro/apps/web/skills/household-product-reviewer/schemas/input.schema.json` (77 lines)

**Beauty & Skincare Reviewer** (Use as template):
- `/home/dev/projects/SmartSpecPro/apps/web/skills/beauty-skincare-reviewer/skill.md` (274 lines, richer structure)
- `/home/dev/projects/SmartSpecPro/apps/web/skills/beauty-skincare-reviewer/schemas/ui.schema.json` (235 lines, 4 sections with dependencies)
- `/home/dev/projects/SmartSpecPro/apps/web/skills/beauty-skincare-reviewer/schemas/input.schema.json` (90 lines)

**Legal Compliance Examples**:
- Household skill.md lines 154-190 (Brand protection, regulated categories, Thai rules)
- Beauty skill.md lines 208-243 (Cosmetics-specific regulations, ingredient warnings)

---

## 10. SUMMARY & NEXT STEPS

**Current Status**: Research complete, ready for implementation planning

**Recommendation**: **Option B — Fashion-Specific Customization**
- Estimated effort: 4-6 hours
- Deliverables: 3 files (skill.md, ui.schema.json, input.schema.json)
- Quality: High specificity for fashion domain
- Risk: Low (proven pattern, established legal framework)

**Next Phase**:
1. Get stakeholder approval on field set (7 new fields)
2. Validate Thai regulation compliance with legal team if available
3. Create implementation plan with detailed section-by-section breakdown
4. Begin skill.md drafting with fashion expertise prompt

**Key Success Criteria**:
- [ ] Reviews differentiate for fit profiles (petite, tall, plus-size)
- [ ] Fabric/material guidance is clear and verifiable
- [ ] Care instructions are actionable
- [ ] Sustainability claims are hedged appropriately
- [ ] Counterfeit products are explicitly rejected
- [ ] Secondhand/vintage reviews work smoothly
- [ ] Output quality matches or exceeds beauty-skincare-reviewer

---

**End of Research Brief**
