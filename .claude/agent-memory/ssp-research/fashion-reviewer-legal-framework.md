# Fashion & Clothing Reviewer — Thai Legal & Regulatory Framework

**Last Updated**: 2026-03-10
**Focus**: Thai-specific regulations, penalties, and required disclaimers for fashion product reviews

---

## 1. THAI TEXTILE & FASHION REGULATIONS

### 1.1 Consumer Protection Act (พระราชบัญญัติคุ้มครองผู้บริโภค พ.ศ. 2558)

**Scope**: All fashion/textile goods sold in Thailand
**Enforcing Agency**: Thai FDA (Food and Drug Administration) + Department of Consumer Protection

**Key Provisions for Fashion Reviews**:

| Provision | What's Protected | Violation | Penalty |
|-----------|-----------------|-----------|---------|
| **Fiber Content Claims** | Accuracy of material composition | Claiming "100% cotton" when actual is 65% cotton/35% polyester | Fine 5,000-100,000 THB |
| **Origin Labeling** | Country of manufacture | Claiming "Made in Italy" when made in Vietnam | Fine 5,000-100,000 THB |
| **Care Instructions** | Accuracy of wash/dry guidance | Misleading care instructions that damage product | Fine 5,000-100,000 THB |
| **Size Accuracy** | Garment dimensions match labeled sizes | Labeling S but actual chest is 48" (XL) | Fine 5,000-100,000 THB |
| **Brand Names** | Trademark protection | Selling counterfeit branded goods as authentic | Fine 100,000-1M THB + seizure |
| **False Advertising** | No misleading product claims | "Fabric stretches infinitely" or "never stains" | Fine 5,000-100,000 THB |

**Liability Question for SmartSpecPro**:
- If a user requests a review of a counterfeit product (fake Gucci bag)
- And the skill writes a positive review without disclosing counterfeiting
- **SmartSpecPro could be liable** as publisher (per ประกาศ สำนัก มหาดไทย)

**Mitigation**:
- Skill must refuse generation for suspected counterfeits
- Provide clear error messaging: "This skill cannot review counterfeit products"

---

### 1.2 Thai Industrial Standard TIS 443-2558 (Fiber Composition in Textiles)

**Standard**: Defines how fiber content must be labeled on clothing

**Requirements for Reviews**:

```
Fiber Content Labeling (from TIS 443-2558):
- Must list ALL fibers ≥ 5% by weight
- Listed in descending order of weight %
- Example: "60% Cotton, 35% Polyester, 5% Elastane"
- Tolerance: ±3% variation from stated composition
```

**What Reviews CANNOT Claim**:
- "100% pure cotton" (unless tag explicitly states this)
- "Genuine leather" (must say "leather" — "genuine" is vague)
- "Silk blend" (must specify % silk)
- "Natural fibers" (must list which; polyester is not natural)
- "Organic cotton" (must show certification tag/logo)

**Safe Review Language**:
```
INCORRECT: "This dress is pure silk with incredible drape"
CORRECT:   "The tag states 100% mulberry silk. In my experience,
           it drapes beautifully and feels luxurious."

INCORRECT: "Soft leather construction"
CORRECT:   "The tag states genuine leather. The leather feels soft
           and well-tanned."

INCORRECT: "Organic sustainable cotton"
CORRECT:   "The tag indicates organic cotton certification.
           The fabric feels premium and environmentally conscious."
```

---

### 1.3 Trademark Act (พระราชบัญญัติเครื่องหมายการค้า พ.ศ. 2559)

**Risk Area**: High-value designer/branded fashion

**Counterfeiting Penalties in Thailand**:
- Criminal: 4-20 years imprisonment + 40,000-400,000 THB fine
- Civil: Damages up to 5x actual loss
- Goods seizure + destruction

**What Makes a Review Problematic**:
1. Knowingly reviewing a counterfeit item as authentic
2. Helping buyers identify where to purchase fakes ("great fake bags on Shopee")
3. Praising counterfeit quality ("This fake Gucci is indistinguishable from real")

**Secondhand Fashion Challenge**:
Many secondhand platforms have counterfeits mixed with authentic items.
- User buys from Shopee/Facebook, claims it's authentic
- Requests positive review
- SmartSpecPro skill doesn't verify authenticity
- Risk: Unknowingly helping distribute counterfeit review

**Skill Protection**:
```
REQUIRED DISCLAIMER for all product reviews:

"This review is for [PRODUCT NAME/BRAND] as advertised.
If the product is counterfeit, counterfeit, replica, or 'inspired by'
a branded item, this skill cannot generate a review.
SmartSpecPro does not support the sale or promotion of counterfeit goods."
```

---

### 1.4 Thailand's E-Commerce & Consumer Rights Framework

**Ministry of Commerce Guidelines** (2023+):

1. **Platform Liability**: E-commerce platforms can be held liable for:
   - Hosting counterfeit product reviews
   - Facilitating sales of mislabeled goods
   - Not removing fraudulent reviews

2. **Review Content Standards**:
   - Reviews must match the actual product advertised
   - Misleading reviews can be removed/reported
   - Platforms should verify authenticity of reviewed items

3. **Consumer Rights**:
   - Right to authentic, non-counterfeit goods
   - Right to accurate material/composition info
   - Right to sue reviewers for misleading recommendations

**SmartSpecPro Implications**:
- If reviews are published and sold/shared, platform may have liability
- Skill should refuse clearly problematic inputs
- User warning: "Ensure the product is authentic before requesting a review"

---

## 2. INTERNATIONAL STANDARDS (If Reviews Cross Borders)

### 2.1 ISO 1833 — Fiber Composition Testing

**Standard**: International method for determining fiber percentages

**Review Guidance**:
- Don't claim "tested for fiber content" unless you actually ran ISO 1833 analysis
- Use tag claims only: "The tag states 70% wool, 30% nylon"
- Hedging: "The fabric feels and behaves like the labeled composition"

### 2.2 EU Textile Regulation (1007/2011)

**Applies if**: Reviews are used in EU marketing or cross-border sales

**Key Rules**:
- Fiber percentages ±3% tolerance (same as Thai TIS 443-2558)
- "Genuine leather" must be substantiated
- Sustainability claims must be verified
- No "eco-friendly" without specific certification (GOTS, Fair Trade, etc.)

---

## 3. PROHIBITED CLAIMS BY PRODUCT CATEGORY

### Authentic & Secondhand Items

| Claim | Status | Safe Alternative |
|-------|--------|-------------------|
| "100% authentic [brand]" (unverified) | Prohibited | "Appears authentic based on product tag and construction details. For high-value items, recommend professional authentication." |
| "Genuine [brand] merchandise" (without cert) | Prohibited | "Labeled as [brand]; tag indicates [country of origin]." |
| "Authentic vintage [designer]" (unverified) | Prohibited | "Vintage piece labeled [brand]; visual inspection suggests [era]. Professional authentication recommended for valuable items." |
| "Real leather" (without tag verification) | Prohibited | "Tag states leather. Feels and wears like genuine leather." |
| "Cannot be counterfeit" | Prohibited | (Do not write this review at all) |

### Durability & Longevity Claims

| Claim | Status | Safe Alternative |
|-------|--------|-------------------|
| "Will last 5+ years guaranteed" | Prohibited | "Designed for durability; longevity depends on care frequency and methods." |
| "Never fades" | Prohibited | "Resists fading with proper care; some color change is typical with repeated washing." |
| "Indestructible" | Prohibited | "High-quality construction; wear resistance varies by care and use patterns." |
| "Lasts longer than [competitor]" | Prohibited | "Built to last; durability comparable to similarly-priced items." |

### Sizing & Fit Claims

| Claim | Status | Safe Alternative |
|-------|--------|-------------------|
| "Fits everyone" | Prohibited | "Fit my [body type] well; fit varies by body type." |
| "True to size (universally)" | Prohibited | "True to size for this brand; sizing varies by style within their collection." |
| "Perfect fit guaranteed" | Prohibited | "The fit was perfect for my proportions; fit is subjective." |
| "Runs true to size for all people" | Prohibited | "Runs true to [brand]'s size chart. Fit experience may vary." |

### Fabric & Material Claims

| Claim | Status | Safe Alternative |
|-------|--------|-------------------|
| "100% [fiber]" (unverified) | Prohibited | "Tag states 100% [fiber]." |
| "Genuine silk" (without tag) | Prohibited | "Labeled as silk; feels like authentic silk." |
| "Real leather" (without tag) | Prohibited | "Tag indicates genuine leather; construction suggests quality leather." |
| "All-natural" (without cert) | Prohibited | "Composed of natural fibers per tag; natural materials may still use synthetic dyes." |
| "Hypoallergenic" (without certification) | Prohibited | "May be suitable for sensitive skin; always patch test. For known allergies, consult product care label." |

### Sustainability & Eco Claims

| Claim | Status | Safe Alternative |
|-------|--------|-------------------|
| "100% eco-friendly" | Prohibited | "Company claims sustainable practices; recommend verifying certifications independently." |
| "Carbon neutral" (unverified) | Prohibited | "Company states carbon-neutral manufacturing; certification not visible on tag." |
| "Saves the environment" | Prohibited | "Using secondhand/quality garments extends product lifecycle, reducing waste." |
| "Fair trade certified" (without logo) | Prohibited | "Labeled as fair trade; verify certification logo on tag." |
| "Organic cotton" (no GOTS logo) | Prohibited | "Tag states organic cotton; look for GOTS or similar certification for assurance." |

---

## 4. REQUIRED DISCLAIMERS BY SCENARIO

### Scenario 1: New Branded Item Review

```
"Reviewed as purchased: [Product Name] by [Brand], labeled [Color/Size/Material].
Fiber content per tag: [%]. All material claims based on product labeling,
not independent testing. Individual care results may vary based on laundering
practices. Durability assessment based on [X months/wears] of personal use."
```

### Scenario 2: Secondhand/Vintage Item Review

```
"This review covers a secondhand item labeled [Brand] [Style].
Authenticity assessed based on visual inspection of construction,
tags, and labeling. For valuable items, professional authentication
recommended before purchase. Condition as worn; vintage pieces may
show character wear consistent with age."
```

### Scenario 3: Fit-Specific Review (for petite/tall/plus-size)

```
"Review from [body type] perspective: [height/measurements].
Fit experience based on personal body proportions; fit varies
significantly by individual body type. I recommend checking
size chart and user reviews from similar body types before purchase."
```

### Scenario 4: Care-Intensive Product Review

```
"Garment labeled: [Fiber composition]. Care instructions per tag: [hand wash/dry clean/etc.].
Longevity projections based on recommended care. Actual garment lifespan depends on
laundry frequency, water temperature, drying method, and storage. I recommend
following tag care instructions to preserve garment integrity."
```

### Scenario 5: Sustainability-Focused Review

```
"Sustainability claims reviewed: [List visible certifications or company statements].
Label shows [specific eco-claims/certifications]. I recommend verifying these
claims independently through [Fair Trade Certified, GOTS, B Corp, etc.] websites.
Not all eco-friendly claims are certified or regulated."
```

---

## 5. SKILL.MD LEGAL COMPLIANCE TABLE (COMPLETE)

For the skill.md file, include this comprehensive table:

```markdown
### 3. Regulated Product Categories (Special Legal Restrictions)

| Category | Prohibited Claims | Required Disclaimer |
|----------|-------------------|---------------------|
| Fiber Content (เส้นด้าย) | "100% pure [fiber]" (unverified), "Genuine leather" (unverified), "Cashmere blend" (incorrect %), false origin claims | EN: "Fiber content per product tag: [specify]. Care and shrinkage depend on laundering methods. Verify tag before purchase." / TH: "ส่วนประกอบเส้นด้ายตามฉลาก: [ระบุ] การดูแลและการหดตัวขึ้นอยู่กับวิธีการซัก ตรวจสอบฉลากก่อนซื้อ" |
| Durability Claims (ความทนทาน) | "Will last X years guaranteed", "Never fades", "Indestructible" | EN: "Longevity depends on care frequency and methods. Results vary by individual use." / TH: "ความทนทานขึ้นอยู่กับความถี่และวิธีการดูแล ประสบการณ์แตกต่างกันในแต่ละคน" |
| Authenticity (ความเป็นของแท้) | Claiming counterfeit is authentic, "100% genuine [brand]" (unverified), "Authentic [brand] replica" | EN: "Authenticity based on visual inspection only. Professional authentication recommended for high-value items before purchase." / TH: "การตรวจสอบความเป็นของแท้อิงตามการตรวจสอบด้วยสายตาเท่านั้น สำหรับสินค้ามูลค่าสูง แนะนำให้ตรวจสอบโดยผู้เชี่ยวชาญก่อนซื้อ" |
| Sizing Accuracy (ขนาด) | "Fits everyone", "Runs exactly true to size" (varies by brand), "Perfect fit guaranteed" | EN: "Fit is subjective and varies by body type. Review based on [petite/tall/standard/plus-size] fit experience. Size variation exists within and between brands." / TH: "ความพอดีเป็นเรื่องส่วนตัวและแตกต่างกันตามยี่ห้อ รีวิวอิงตามประสบการณ์ของ [ประเภทร่างกาย] ความแตกต่างของขนาดมีอยู่ในและระหว่างยี่ห้อ" |
| Origin/Manufacturing (ที่มา) | "Made in [country]" (if tag differs), "Imported from [country]" (unverified) | EN: "Country of origin per product label: [country]. Verify label for actual manufacturing location." / TH: "ประเทศผลิตตามฉลาก: [ประเทศ] ตรวจสอบฉลากเพื่อยืนยันสถานที่ผลิต" |
| Secondhand Authenticity (สินค้ามือสอง) | Claiming secondhand brand item is 100% authentic without professional verification | EN: "Authenticity of secondhand items based on visual inspection of tags, construction, and labeling. Professional authentication strongly recommended for luxury items before purchase." / TH: "การตรวจสอบความเป็นของแท้ของสินค้ามือสองอิงตามการตรวจสอบฉลาก การก่อสร้าง และฉลากสินค้า แนะนำให้ตรวจสอบโดยผู้เชี่ยวชาญสำหรับสินค้าหรูหราก่อนซื้อ" |
| Sustainability (ความยั่งยืน) | "100% eco-friendly", "Carbon neutral" (unverified), "Saves the environment", "Fair trade" (without certification) | EN: "Sustainability claims based on product labeling and company statements. Verify certifications independently (Fair Trade, GOTS, Bluesign, B Corp, etc.). Not all eco-claims are regulated or certified." / TH: "การอ้างสิทธิด้านความยั่งยืนอิงตามฉลากและข้อความของบริษัท ตรวจสอบการรับรองอย่างอิสระ (Fair Trade, GOTS, Bluesign, B Corp ฯลฯ) ไม่ใช่การอ้างสิทธิด้านเอกโลกทั้งหมดที่ได้รับการควบคุมหรือรับรอง" |
| Material Safety (ความปลอดภัยของวัสดุ) | "100% safe for sensitive skin" (untested), "Hypoallergenic guaranteed" (uncertified) | EN: "Suitability for sensitive skin varies by individual. Recommend patch testing. For known allergies, review fiber content and dyes per label." / TH: "ความเหมาะสำหรับผิวแพ้ง่ายขึ้นอยู่กับแต่ละบุคคล แนะนำให้ทดลองพื้นที่เล็กน้อยก่อน สำหรับภูมิแพ้ที่ทราบ ให้ตรวจสอบเส้นด้ายและสีย้อมตามฉลาก" |
| Counterfeit Products (สินค้าปลอม) | ANY positive review of products known/suspected to be counterfeit or replica | EN: "This skill cannot review counterfeit, replica, or counterfeit products. SmartSpecPro does not support the sale or promotion of illegal counterfeit goods. Review only authentic products." / TH: "ทักษะนี้ไม่สามารถเขียนรีวิวสินค้าปลอม นำเข้าซ้ำ หรือสินค้าเลียนแบบได้ SmartSpecPro ไม่สนับสนุนการขายหรือการส่งเสริมสินค้าปลอมที่ผิดกฎหมาย เขียนรีวิวเฉพาะสินค้าที่เป็นของแท้" |

### 4. Thai-Specific Fashion & Textile Regulations

Per Consumer Protection Act (พระราชบัญญัติคุ้มครองผู้บริโภค พ.ศ. 2558) and Thai Industrial Standard TIS 443-2558:

- **NEVER claim fiber content accuracy** beyond what the tag states. Example: Do NOT say "This is 100% cotton and will last forever." Instead: "The tag states 100% cotton. In my experience, it has held up well over 6 months."
- **NEVER claim "Made in [country]"** unless the tag explicitly states that country. If the tag says "Made in Vietnam" but you think it looks Italian, trust the tag.
- **NEVER claim authenticity** of branded items without professional verification. Counterfeit luxury goods are common in secondhand markets.
- **NEVER claim sizing accuracy** as universal. Always qualify: "True to size for this brand / fit my [body type] well / typically runs large."
- **NEVER use "genuine" or "authentic"** casually. Use only when verified by product tags or professional authentication.
- **NEVER claim "organic", "fair trade", or "eco-friendly"** without visible certification logos on the tag (GOTS, Fair Trade, etc.).

### 5. Originality & Authenticity of Reviews

- **NEVER reproduce text from brand websites, Shopee listings, Lazada descriptions, or other published reviews.**
- The review voice must be original and reflect personal experience.
- Do not use marketing language verbatim from product listings.
```

---

## 6. IMPLEMENTATION CHECKLIST FOR SKILL.MD

When drafting the skill.md file:

- [ ] Line ~170: Start "Content Integrity & Legal Compliance (STRICT)" section
- [ ] Line ~175: Add Brand & Trademark Protection subsection
- [ ] Line ~185: Add No Exaggerated Claims subsection
- [ ] Line ~200: Add Regulated Product Categories table (use full table above)
- [ ] Line ~250: Add "Thai-Specific Fashion & Textile Regulations" subsection
- [ ] Line ~260: Add "Authenticity & Secondhand Concerns" subsection
- [ ] Line ~270: Add "Originality" subsection
- [ ] Ensure Thai language is correct and culturally appropriate (test with native speaker)
- [ ] Include examples of WRONG vs CORRECT claim phrasing throughout

---

## 7. ERROR HANDLING & USER GUIDANCE

### When to REJECT a Review Request

Skill should refuse (return error) if:

1. **Suspected Counterfeit**
   ```
   "This product appears to be a counterfeit, replica, or inspired-by item.
   This skill can only review authentic products. Please verify the product's
   authenticity and try again."
   ```

2. **Missing Required Info for Safety**
   ```
   "Please provide product fiber content information (from tag) or upload
   a photo showing the care/content label before generating a review."
   ```

3. **Impossible/Nonsensical Request**
   ```
   "Example: clothing_type = 'shoes' with care_complexity = false
   Response: 'Shoe reviews typically benefit from care guidance.
   Enable care_complexity for a more complete review.'"
   ```

### Error Messages (Thai + English)

```typescript
// Skill validation errors

COUNTERFEIT_ERROR_EN: "This skill cannot review counterfeit,
  replica, or fake products. SmartSpecPro does not support
  the sale or promotion of counterfeit goods. Review only
  authentic products."

COUNTERFEIT_ERROR_TH: "ทักษะนี้ไม่สามารถเขียนรีวิวสินค้าปลอม
  นำเข้าซ้ำ หรือสินค้าเลียนแบบได้ SmartSpecPro ไม่สนับสนุน
  การขายหรือการส่งเสริมสินค้าปลอมที่ผิดกฎหมาย
  เขียนรีวิวเฉพาะสินค้าที่เป็นของแท้เท่านั้น"

MISSING_INFO_EN: "For a complete review, please provide the fiber
  content from the product tag or upload a photo of the care label."

MISSING_INFO_TH: "สำหรับรีวิวที่สมบูรณ์ กรุณาระบุส่วนประกอบเส้นด้าย
  จากฉลากสินค้าหรือแนบรูปฉลากดูแล"
```

---

## 8. SUMMARY: KEY REGULATIONS FOR SKILL.MD

**Most Important for Fashion Reviewer**:

1. **Fiber Content** (TIS 443-2558): Always verify against tag; never make up percentages
2. **Authenticity** (Trademark Act): Refuse to review counterfeits; for secondhand, recommend professional verification
3. **Durability** (Consumer Protection Act): Never guarantee; always hedge with "depends on care"
4. **Sizing** (Consumer Protection Act): Always note body type variation; never claim universal fit
5. **Sustainability** (Various): Require visible certification logos; don't trust company claims alone
6. **Origin** (Consumer Protection Act): Trust the tag; don't assume based on appearance

**Liability Mitigation**:
- Skill refuses suspicious counterfeits
- All claims hedged appropriately
- Thai regulations cited explicitly
- Users warned about authentication for expensive items
- No reproduction of manufacturer/retailer text

---

**End of Legal Framework**
