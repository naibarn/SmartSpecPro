# Fashion & Clothing Reviewer Skill — Implementation Specification

**Date**: 2026-03-10
**Status**: Ready for Code Implementation
**Effort Estimate**: 4-6 hours
**Files to Create**: 3 (skill.md, ui.schema.json, input.schema.json)

---

## 1. FIELD SPECIFICATION TABLE

Complete reference for all form fields in fashion-clothing-reviewer skill.

### Universal Fields (Shared with all reviewers)

| Field ID | Type | Required | Default | Options/Validation | Label EN | Label TH |
|----------|------|----------|---------|-------------------|----------|----------|
| topic | textarea | No | — | min 1, max 500 chars | Product Name or Description | ชื่อสินค้า หรือรายละเอียดสินค้า |
| language | select | Yes | "th" | "en", "th" | Language | ภาษา |
| reference_images | image upload | No | [] | max 5 files, 10MB total | Product Images (Optional) | รูปสินค้า (ไม่บังคับ) |
| storytelling_style | select | No | — | 14 options (HPSO, AIDA, etc.) | Storytelling Structure (optional) | โครงสร้างการเล่าเรื่อง (ไม่บังคับ) |
| length | select | Yes | "medium" | "short", "medium", "long" | Review Length | ความยาวรีวิว |
| word_count | number | No | — | min 80, max 3000, step 10 | Maximum Words (optional) | จำนวนคำสูงสุด (ไม่บังคับ) |
| output_format | select | Yes | "markdown" | "markdown", "plain_text" | Output Format | รูปแบบผลลัพธ์ |
| include_pricing | boolean | No | false | — | Include Pricing Info | ระบุราคาโดยประมาณ |

### Fashion-Specific Fields (NEW)

| Field ID | Type | Required | Default | Options/Validation | Label EN | Label TH | Help Text EN | Help Text TH |
|----------|------|----------|---------|-------------------|----------|----------|--------------|--------------|
| clothing_type | select | Yes | "general" | tops, bottoms, dresses, outerwear, shoes, bags, accessories, watches, intimates, activewear, sleepwear, general | Product Type | ประเภทสินค้า | Choose the main clothing category to tailor review tone and fit context | เลือกหมวดหมู่เสื้อผ้าหลักเพื่อปรับสไตล์รีวิวและบริบทการแต่งตัว |
| fabric_material | multi-select | No | [] | cotton, polyester, silk, linen, denim, leather, suede, wool, nylon, spandex, recycled, synthetic_blend, other | Fabric & Material | ผ้าและวัสดุ | Select all primary materials. Helps tailor care guidance and sustainability discussion | เลือกวัสดุหลักทั้งหมด ช่วยให้สามารถปรับแนะนำการดูแลและการอภิปรายเรื่องความยั่งยืน |
| fit_profile | select | No | "general" | petite, tall, plus_size, athletic, pear_shaped, apple_shaped, standard, general | Fit Profile / Body Type | รูปแบบตัว | Frame the fit experience for this body type perspective | ปรับประสบการณ์การแต่งตัวจากมุมมองของรูปแบบตัวนี้ |
| special_features | multi-select | No | [] | waterproof, water_resistant, UV_protection, breathable, stretch, wrinkle_resistant, quick_dry, thermal, reflective, hypoallergenic, pockets, adjustable_fit | Special Features | คุณสมบัติพิเศษ | Select technical features present in the product for performance review | เลือกคุณสมบัติด้านเทคนิคของสินค้าเพื่อรีวิวประสิทธิภาพ |
| condition | select | No | "new" | new, secondhand_preloved, vintage, restored, handmade_custom | Product Condition | สภาพสินค้า | Track whether this is new, secondhand, or vintage; affects authenticity and value assessment | ติดตามว่าสินค้านี้เป็นของใหม่ มือสอง หรือวินเทจ ส่งผลต่อการประเมินความเป็นของแท้และมูลค่า |
| care_complexity | boolean | No | false | — | Include Care & Maintenance | รวมเรื่องการดูแลและบำรุงรักษา | Enable detailed care instructions section (wash, dry, storage, longevity) | เปิดใช้งานส่วนคำแนะนำการดูแลโดยละเอียด (ซัก ตากแห้ง เก็บ อายุการใช้) |
| sustainability_focus | boolean | No | false | — | Include Sustainability | รวมเรื่องความยั่งยืน | Frame the review through eco-conscious and ethical production lens | ดำเนินการเขียนรีวิวผ่านเลนส์ของความสำนึกด้านสิ่งแวดล้อมและการผลิตแบบจริยธรรม |
| review_angle | select | Yes | "first_impression" | fit_comfort, style_versatility, durability_value, quality_craftsmanship, first_impression, long_term_wear, sustainability | Review Angle / Focus | จุดเน้นรีวิว | Primary narrative perspective for the review | มุมมองการเล่าเรื่องหลักสำหรับรีวิว |

---

## 2. UI SCHEMA STRUCTURE (5 Sections)

```json
{
  "version": "1.0",
  "skillId": "fashion-clothing-reviewer",
  "title": "Fashion & Clothing Reviewer",
  "titleTh": "รีวิวเสื้อผ้าและแฟชั่น",
  "description": "Write honest, story-driven reviews for fashion and clothing items with fit, fabric, and sustainability guidance",
  "descriptionTh": "เขียนรีวิวเสื้อผ้าแบบเล่าเรื่องจริงใจ พร้อมแนวทางเกี่ยวกับการแต่งตัว ผ้า และความยั่งยืน",

  "sections": [
    {
      "id": "product",
      "title": "Product Info",
      "titleTh": "ข้อมูลสินค้า",
      "icon": "shopping-bag",
      "fields": [
        { topic field },
        { reference_images field },
        { clothing_type field },
        { language field }
      ]
    },
    {
      "id": "fit",
      "title": "Fit & Materials",
      "titleTh": "การแต่งตัว และวัสดุ",
      "icon": "dress",
      "fields": [
        { fit_profile field },
        { fabric_material field },
        { special_features field }
      ]
    },
    {
      "id": "product_details",
      "title": "Product Details",
      "titleTh": "รายละเอียดสินค้า",
      "icon": "info",
      "fields": [
        { condition field }
      ]
    },
    {
      "id": "style",
      "title": "Review Style",
      "titleTh": "สไตล์รีวิว",
      "icon": "message-circle",
      "fields": [
        { review_angle field },
        { storytelling_style field },
        { include_pricing field }
      ]
    },
    {
      "id": "options",
      "title": "Care & Output",
      "titleTh": "การดูแล และผลลัพธ์",
      "icon": "settings",
      "collapsed": true,
      "defaultCollapsed": true,
      "fields": [
        { care_complexity field },
        { sustainability_focus field },
        { length field },
        { word_count field },
        { output_format field }
      ]
    }
  ],

  "outputMapping": {
    "topic": "topic",
    "reference_images": "reference_images",
    "language": "language",
    "clothing_type": "clothing_type",
    "fit_profile": "fit_profile",
    "fabric_material": "fabric_material",
    "special_features": "special_features",
    "condition": "condition",
    "care_complexity": "care_complexity",
    "sustainability_focus": "sustainability_focus",
    "review_angle": "review_angle",
    "storytelling_style": "storytelling_style",
    "include_pricing": "include_pricing",
    "length": "length",
    "word_count": "word_count",
    "output_format": "output_format"
  }
}
```

---

## 3. INPUT SCHEMA (JSON Schema Validation)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.local/skills/fashion-clothing-reviewer/schemas/input.schema.json",
  "title": "Fashion & Clothing Reviewer - Input Schema",
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "topic": {
      "type": "string",
      "title": "Product Name or Description",
      "description": "The fashion or clothing product to review. Can be a product name, brand and model, color/size, or general description."
    },
    "language": {
      "type": "string",
      "title": "Language",
      "description": "Output language. Use 'en' for English or 'th' for Thai.",
      "enum": ["en", "th"],
      "default": "th"
    },
    "clothing_type": {
      "type": "string",
      "title": "Product Type",
      "description": "The main clothing category.",
      "enum": ["tops", "bottoms", "dresses", "outerwear", "shoes", "bags", "accessories", "watches", "intimates", "activewear", "sleepwear", "general"],
      "default": "general"
    },
    "fabric_material": {
      "type": "array",
      "title": "Fabric & Material",
      "description": "Primary material(s) in the product. Helps guide care and sustainability discussion.",
      "items": {
        "type": "string",
        "enum": ["cotton", "polyester", "silk", "linen", "denim", "leather", "suede", "wool", "nylon", "spandex", "recycled", "synthetic_blend", "other"]
      },
      "default": []
    },
    "fit_profile": {
      "type": "string",
      "title": "Fit Profile / Body Type",
      "description": "Frame the fit experience for this body type. Helps personalize fit guidance.",
      "enum": ["petite", "tall", "plus_size", "athletic", "pear_shaped", "apple_shaped", "standard", "general"],
      "default": "general"
    },
    "special_features": {
      "type": "array",
      "title": "Special Features",
      "description": "Technical or special properties of the garment.",
      "items": {
        "type": "string",
        "enum": ["waterproof", "water_resistant", "UV_protection", "breathable", "stretch", "wrinkle_resistant", "quick_dry", "thermal", "reflective", "hypoallergenic", "pockets", "adjustable_fit"]
      },
      "default": []
    },
    "condition": {
      "type": "string",
      "title": "Product Condition",
      "description": "Is the product new, secondhand, vintage, etc.?",
      "enum": ["new", "secondhand_preloved", "vintage", "restored", "handmade_custom"],
      "default": "new"
    },
    "care_complexity": {
      "type": "boolean",
      "title": "Include Care & Maintenance",
      "description": "Whether to include detailed care instructions section.",
      "default": false
    },
    "sustainability_focus": {
      "type": "boolean",
      "title": "Include Sustainability",
      "description": "Whether to frame review through eco-conscious lens.",
      "default": false
    },
    "review_angle": {
      "type": "string",
      "title": "Review Angle / Focus",
      "description": "The main angle or focus of the review.",
      "enum": ["fit_comfort", "style_versatility", "durability_value", "quality_craftsmanship", "first_impression", "long_term_wear", "sustainability"],
      "default": "first_impression"
    },
    "storytelling_style": {
      "type": "string",
      "title": "Storytelling Style",
      "description": "The narrative structure for the review. Leave empty for random selection.",
      "enum": ["hpso", "aida", "pas", "hook_insight_tip", "before_after", "story_flow", "my_why", "complain_recall", "fab", "star", "scr", "inverted_pyramid", "listicle", "qa_flow"]
    },
    "include_pricing": {
      "type": "boolean",
      "title": "Include Pricing Info",
      "description": "Whether to include approximate pricing and value-for-money assessment.",
      "default": false
    },
    "length": {
      "type": "string",
      "title": "Length",
      "description": "Approximate review length.",
      "enum": ["short", "medium", "long"],
      "default": "medium"
    },
    "word_count": {
      "type": "integer",
      "title": "Maximum words (optional)",
      "description": "If provided, the review must not exceed this word count. Overrides length preset.",
      "minimum": 80,
      "maximum": 3000
    },
    "output_format": {
      "type": "string",
      "title": "Output Format",
      "description": "Preferred output format. Markdown uses headings and formatting. Plain text is optimized for text-to-speech.",
      "enum": ["markdown", "plain_text"],
      "default": "markdown"
    },
    "reference_images": {
      "type": "array",
      "title": "Product Images",
      "description": "Optional product images. When provided, the review will be based on visual analysis of the actual product shown.",
      "items": {
        "type": "string",
        "format": "uri"
      }
    }
  }
}
```

---

## 4. SKILL.MD FRONTMATTER & KEY SECTIONS

### Frontmatter (Lines 1-14)

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

### Expert Persona (Lines 16-30)

```
You are a fashion and clothing review expert who specializes in honest,
storytelling-based reviews. Your tone is warm, knowledgeable, and conversational
— like a trusted friend sharing their real fit experience and styling insights.
You never hard-sell or pressure the reader. Instead, you build trust through
genuine stories, relatable styling moments, honest fit assessments, and practical
insights about materials and care.

Your domain covers: clothing (tops, bottoms, dresses, outerwear), footwear (shoes,
sneakers, boots, heels), accessories (bags, jewelry, watches, scarves, hats),
and activewear. You specialize in fit guidance for different body types (petite,
tall, plus-size, athletic), fabric care expertise, sustainability assessment,
and secondhand/vintage authenticity.
```

### Input Interpretation (Lines 32-75)

```
The user's message will contain "Form inputs:" followed by key-value pairs.
Use them as writing instructions:

- **topic** — the product name, brand, or description to review (required)
- **language** — `en` = English, `th` = Thai. Write the entire review in this language
- **clothing_type** — the main garment category: tops, bottoms, dresses, outerwear,
  shoes, bags, accessories, watches, intimates, activewear, sleepwear, or general.
  Use this to set fit context and expectations
- **fabric_material** — the primary materials (cotton, silk, leather, polyester, etc.).
  Tailor care guidance, durability expectations, and sustainability discussion
- **fit_profile** — the body type perspective: petite, tall, plus_size, athletic,
  pear_shaped, apple_shaped, standard, or general. Write from this body type's
  fit experience (e.g., "As a petite reviewer, sleeves ran long...")
- **special_features** — technical properties (waterproof, UV protection, breathable,
  stretch, etc.). Include performance assessment for these features
- **condition** — product state: new, secondhand_preloved, vintage, restored, or
  handmade_custom. If secondhand/vintage, emphasize authenticity concerns and
  character wear; if new, standard review
- **care_complexity** — if `true`, include detailed care & maintenance section
  covering wash/dry methods, storage, longevity projections
- **sustainability_focus** — if `true`, frame review through eco-conscious lens,
  highlight certifications (Fair Trade, GOTS, organic), discuss environmental impact
- **review_angle** — main focus: fit_comfort (how does it fit?), style_versatility
  (can you style it multiple ways?), durability_value (quality-to-price ratio?),
  quality_craftsmanship (construction and seams?), first_impression (unboxing feel?),
  long_term_wear (after repeated wearing/washing?), or sustainability (eco-impact?).
  This shapes the narrative arc
- **storytelling_style** — narrative structure (14 templates: HPSO, AIDA, PAS, etc.)
  Do NOT mention structure name — just follow it naturally
- **include_pricing** — if `true`, mention approximate pricing and value-per-wear
- **length** — `short` (~300 words, 1 min), `medium` (~500 words, 1.5 min),
  `long` (~800 words, 3 min)
- **output_format** — `markdown` (default) or `plain_text` (TTS-friendly)
- **reference_images** — optional product images. Analyze carefully: identify
  product color, fabric texture, logo, branding, size tag/care label visible.
  Use visual details to write a review that matches the actual product shown
```

### Output Requirements (Lines 77-140)

```
Standard output requirements (similar to household/beauty, with fashion focus):

### Output format
- markdown (default): Use proper Markdown (#, ##, ###, paragraphs)
- plain_text: No Markdown; TTS-friendly narration

### Text-to-speech safe writing rules
- Write as if spoken aloud — review is designed for voiceover narration
- Avoid symbolic shorthand (/,  &, %, ->, etc.)
- Replace with words: "/" → "or", "&" → "and", "%" → "percent", "-" → "to"
- Write numeric ranges as spoken: "two hundred to three hundred baht"
- Write prices fully: "around 299 baht", not "~299"
- Keep punctuation simple for breathing pauses

### Language
- language: en → English throughout
- language: th → Casual, conversational Thai (middle-school level)
  Do NOT use "ครับ" or "ค่ะ" endings. Use "นะ", "เลย", "จริงๆ" naturally

### Length policy
- If word_count provided: stay at or below that number
- Otherwise follow length preset (short/medium/long)
- Keep sections focused and conversational

### Tone and style rules
- Write like a friend sharing real fashion experience — genuine, honest
- Never over-claim or exaggerate fit, quality, or durability
- Never use hard-sell language ("Buy now!", "Don't miss out!")
- Include real-life scenarios: "I was getting dressed for work and thought,
  'This shirt finally fits my shoulders properly...'"
- Mention specific sensory/fit details: how it drapes, how sleeves hit the arm,
  where it sits on the body, how it moves, how the fabric feels
- If the product has limitations, acknowledge honestly — builds trust
```

### Image-Based Review Rules (Lines 142-160)

```
When reference images are provided:
1. Analyze the image carefully: product color, logo/branding visible, fabric
   texture appearance, how it drapes on a model (if applicable), packaging
   style, care/content tags visible
2. Note any visible text: care instructions, fiber content %, country of origin,
   brand markings, size label
3. Incorporate visual details naturally: "The tag states 100% silk, and the
   drape confirms it"; "The color appears to be a deep burgundy with subtle
   sheen"; "The stitching is clean and even throughout"
4. If the brand/model is identifiable, use that for a specific review
5. If you cannot clearly identify the product, focus on what you observe and
   write based on visible characteristics
```

### Content Integrity & Legal Compliance (Lines 200-290)

[Use the comprehensive table from fashion-reviewer-legal-framework.md]

### Storytelling Structures (Lines 292-340)

[Reuse 14 templates from household-product-reviewer, but add fashion-specific guidance]

### Recommended Review Structure (Lines 342-365)

For fashion/clothing, suggest 10-11 sections:

```markdown
1. **Title** (product name + compelling hook)
2. **Opening Hook** (relatable fashion moment or challenge)
3. **First Impressions** (unboxing, packaging, initial feel)
4. **Product Introduction** (what it is, key features, claimed composition)
5. **Fit & Sizing** (if fit_profile specified — how it fits this body type)
6. **Fabric & Materials** (if fabric_material specified — tactile, quality, tag info)
7. **Performance & Features** (if special_features specified — waterproof, stretch, etc.)
8. **Styling & Versatility** (how to wear it, outfit combinations, versatility)
9. **Care & Maintenance** (if care_complexity true — wash, dry, storage, longevity)
10. **Sustainability & Values** (if sustainability_focus true — materials, certifications)
11. **Soft Close** (personal recommendation, who this is best for, repurchase decision)

Adapt based on storytelling_style. Not every section required — select 6-9
that flow naturally for the review.
```

---

## 5. LINE COUNT TARGETS

```
skill.md:
  - Frontmatter: 14 lines
  - Expert persona: 12 lines
  - Input interpretation: 45 lines
  - Output requirements: 65 lines
  - Image analysis: 20 lines
  - Storytelling structures: 40 lines
  - Recommended structure: 24 lines
  - Legal compliance: 95 lines
  - Output format examples: 20 lines
  ────────────────────────
  TOTAL: ~335 lines (vs 245-274 for household/beauty)

ui.schema.json:
  - Structure boilerplate: 10 lines
  - Section 1 (Product): 50 lines
  - Section 2 (Fit & Materials): 70 lines
  - Section 3 (Details): 20 lines
  - Section 4 (Review Style): 55 lines
  - Section 5 (Options): 50 lines
  - outputMapping: 20 lines
  ────────────────────────
  TOTAL: ~275 lines

input.schema.json:
  - Schema boilerplate: 8 lines
  - 8 universal fields: 75 lines
  - 7 fashion-specific fields: 85 lines
  - Closing: 2 lines
  ────────────────────────
  TOTAL: ~170 lines
```

---

## 6. TESTING SCENARIOS

### Test Case 1: Cotton T-Shirt (New, Simple)

```
Input:
- topic: "Basic white cotton t-shirt, Medium"
- language: "th"
- clothing_type: "tops"
- fabric_material: ["cotton"]
- fit_profile: "standard"
- condition: "new"
- care_complexity: false
- sustainability_focus: false
- review_angle: "first_impression"
- include_pricing: true

Expected: 500-word Thai review of cotton tee with pricing focus,
simple first-impression structure, no deep care guidance
```

### Test Case 2: Designer Denim (New, Fit-Sensitive)

```
Input:
- topic: "Acne Studios slim fit dark indigo denim, size 30"
- language: "en"
- clothing_type: "bottoms"
- fabric_material: ["denim"]
- fit_profile: "standard"
- special_features: ["stretch"]
- condition: "new"
- care_complexity: true
- sustainability_focus: false
- review_angle: "fit_comfort"
- include_pricing: true

Expected: 800-word English review emphasizing fit experience,
stretch performance, denim care (color bleeding, shrinkage),
premium pricing justification, detailed care section
```

### Test Case 3: Vintage Leather Jacket (Secondhand, Authenticity)

```
Input:
- topic: "Vintage Schott leather moto jacket, brown, size M"
- language: "th"
- clothing_type: "outerwear"
- fabric_material: ["leather"]
- fit_profile: "general"
- special_features: ["water_resistant"]
- condition: "vintage"
- care_complexity: true
- sustainability_focus: true
- review_angle: "quality_craftsmanship"
- include_pricing: false

Expected: 600-word Thai review emphasizing authenticity assessment,
vintage wear character, leather care, sustainability of vintage
shopping, craftmanship details, refurbishment notes
```

### Test Case 4: Activewear (New, Performance Features)

```
Input:
- topic: "Nike Dri-FIT running leggings, black, size S"
- language: "en"
- clothing_type: "activewear"
- fabric_material: ["polyester", "spandex"]
- fit_profile: "petite"
- special_features: ["breathable", "quick_dry", "UV_protection"]
- condition: "new"
- care_complexity: true
- sustainability_focus: false
- review_angle: "style_versatility"
- include_pricing: true

Expected: 700-word English review from petite perspective,
feature performance testing (breathability during exercise,
quick-dry test), multiple styling options beyond gym,
synthetic care requirements
```

### Test Case 5: Secondhand Luxury Bag (Preloved, Sustainability)

```
Input:
- topic: "Gucci Marmont shoulder bag, velvet, medium, secondhand"
- language: "th"
- clothing_type: "bags"
- fabric_material: ["velvet", "leather"]
- fit_profile: "general"
- special_features: ["adjustable_fit"]
- condition: "secondhand_preloved"
- care_complexity: true
- sustainability_focus: true
- review_angle: "sustainability"
- include_pricing: false

Expected: 600-word Thai review emphasizing:
  - Authenticity assessment methodology (tag check, stitching,
    hardware verification, serial number if visible)
  - Condition assessment (color vibrant, no stains, minor patina)
  - Sustainability angle (secondhand luxury = slower fashion)
  - Care for delicate materials (velvet, leather conditioning)
  - Authentication disclaimer for expensive items
```

---

## 7. ERROR HANDLING & VALIDATION

### Input Validation Rules

```typescript
// Before skill execution, validate:

1. topic: required if reference_images is empty
   Error: "Please provide either a product name or product images"

2. clothing_type: must be valid enum
   Error: "Invalid clothing type. Please select from the provided list"

3. fabric_material: if specified, must be valid enum values
   Error: "One or more fabric materials are invalid"

4. fit_profile: if not "general", special fit guidance will be added
   Warning: (info only, no error)

5. word_count: if provided, must be 80-3000
   Error: "Word count must be between 80 and 3000"

6. condition: if "secondhand_preloved" or "vintage" and include_pricing = true
   Warning: "Note: Secondhand pricing can vary widely. Review will note
            market variability."

7. Counterfeit detection (heuristic):
   If topic contains: "fake", "replica", "counterfeit", "knockoff",
   "inspired", "dupe", AND clothing_type is bags/accessories
   → Prompt user: "This appears to be a counterfeit product.
     SmartSpecPro cannot review counterfeit items. Please review only
     authentic products."
```

---

## 8. NEXT STEPS FOR IMPLEMENTATION

1. **Create folder structure**
   ```
   mkdir -p apps/web/skills/fashion-clothing-reviewer/schemas
   ```

2. **Create skill.md** (~335 lines)
   - Use this spec as outline
   - Reference household/beauty skills for tone
   - Emphasize fit, fabric, authenticity throughout

3. **Create ui.schema.json** (~275 lines)
   - Copy beauty schema as template
   - Update field IDs and labels
   - Add 7 new fields with bilingual text
   - Test field rendering in UI

4. **Create input.schema.json** (~170 lines)
   - Copy beauty schema structure
   - Add fashion-specific enum values
   - Validate against spec

5. **Testing**
   - Test with 5 sample products (scenarios above)
   - Verify Thai language display
   - Check legal compliance language accuracy
   - Validate output quality matches beauty/household

6. **Documentation**
   - Add skill to registry (if auto-sync)
   - Verify icon displays
   - Test end-to-end form → review → output

---

**End of Implementation Specification**
