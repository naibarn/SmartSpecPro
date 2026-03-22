# Product Reviewer Skills Analysis

**Date**: 2026-03-11
**Scope**: All 15 product reviewer skills in apps/web/skills/
**Status**: Complete architectural analysis

---

## Executive Summary

SmartSpecPro has **15 production-ready product reviewer skills** covering diverse categories. All follow a consistent **storytelling-based review architecture** with:

- **Unified system prompt pattern**: Narrative voice + domain expertise + instruction-driven review generation
- **14 story-driven skills** (agriculture through sports) using same 13 storytelling templates
- **1 analytical skill** (real-estate) using structured analysis instead of narrative
- **Shared compliance layer**: Legal disclaimers, Thai regulations, prohibited claims tables
- **TTS-safe formatting**: All skills designed for text-to-speech narration

**Key architectural insight**: These skills are **template-heavy, domain-specific implementations** of a single core pattern. Extensibility is high; adding a new product category requires only new frontmatter + legal table.

---

## Frontmatter Configuration (All Skills)

**Standard across all 15 skills:**

```yaml
category: product_review              # Unified category
icon: [domain-specific]              # Lucide icon name
version: "1.0.0"
author: SmartAIHub
isAutoTrigger: false
enabledByDefault: true
priority: 50
creditMultiplier: 1.0
execution_mode: llm-only             # All are LLM-only execution
```

**Variation**: `icon` and `slug` (domain-specific), `name` and `description` (domain-specific).

No category-specific execution modes or credit multipliers — all uniform baseline.

---

## System Prompt Structure (Storytelling Model)

### Pattern (Used in 14 of 15 skills)

All story-driven skills follow this architecture:

1. **Tone + domain intro** (100-200 words)
   - Persona: "warm, honest, conversational"
   - Domain coverage: explicit product categories
   - "You never hard-sell or pressure the reader"

2. **Form inputs interpretation** (15-20 key fields)
   - `topic` (required)
   - `language` (en/th)
   - `product_category` (domain-specific enum)
   - `review_angle` (5 options: problem_solution, daily_life, comparison, first_impression, long_term)
   - `include_pricing` (boolean)
   - `storytelling_style` (13 template names: HPSO, AIDA, PAS, etc.)
   - `length` (short/medium/long)
   - `word_count` (optional override)
   - `output_format` (markdown/plain_text)
   - `product_specs` (optional free-text specs)
   - `reference_images` (optional image URLs)

3. **Output requirements section** (250-400 words)
   - Markdown vs plain-text formatting rules
   - TTS-safe writing rules (symbol replacement, numeric ranges)
   - Language guidance (casual Thai, no formal endings)
   - Length policy (word count limits)
   - Tone rules (no hard-sell, honesty priority)
   - Domain-specific guidance (e.g., skin type for beauty; fabric analysis for fashion)

4. **Storytelling structures** (1500-2000 words)
   - 13 narrative templates with 2-3 sentence descriptions
   - HPSO, AIDA, PAS, Before-After, Story Flow, Hook-Insight-Tip, My Why-My Way-Your Turn, Complain-Recall-Press-Gentle, FAB, STAR, SCR, Inverted Pyramid, Listicle, QA Flow
   - **Key rule**: "Do NOT mention the structure name in the output — just follow it naturally"

5. **Recommended review structure** (8-12 sections)
   - Typical flow: Title → Opening Hook → Problem → Product Intro → Real Usage Experience → Honest Assessment → Value/Pricing → Soft Close
   - Not all required; adapt per storytelling style
   - 5-8 sections flow naturally per story structure

6. **Content Integrity & Legal Compliance** (1000-2000 words)
   - **Brand protection**: No competitor names, no dupes/alternatives claims, no trademarked references
   - **No exaggerated claims**: Use hedging (in my experience, many find, designed to)
   - **Regulated categories table**: Prohibited claims + required disclaimers per product type
   - **Disclosure & transparency**: Price notes, affiliate framing
   - **Originality**: No reproduction from manufacturer websites

---

## Domain-Specific Variations

### 1. **Agriculture & Garden Reviewer**
- **Categories**: tool, seed, fertilizer, pesticide, irrigation, planter, lawn, hydroponic, greenhouse, compost
- **Special guidance**: Germination rates, soil texture, seasonal dependency
- **Legal table**: Pesticides/herbicides (read label, PPE) + Fertilizers (dosage, runoff)
- **TTS rule note**: "/" → "or", ranges as spoken ("three to five days")

### 2. **Baby & Kids Reviewer**
- **Categories**: clothing, stroller, nursing, diaper, bath_skin, toy, safety, furniture, school
- **Special guidance**: Safety FIRST, never "completely safe", no developmental exaggeration
- **Product specs**: Certifications (OEKO-TEX, safety), age ranges, materials
- **Legal table**: Car seats (installation), baby food (not replaces breastfeeding), skincare (patch test)
- **Key distinction**: 4 regulated categories with stricter disclaimers than other products

### 3. **Beauty & Skincare Reviewer**
- **Categories**: skincare, makeup, haircare, bodycare, fragrance, sunscreen, supplement, tools
- **Special fields**: `skin_type` (oily/dry/combination/sensitive/normal/acne_prone/all)
- **Special field**: `review_focus` (ingredients, texture, routine_fit, value, comparison, first_impression, long_term)
- **Include field**: `include_ingredients` → dedicates section to active ingredients with accessible language
- **Skin guidance**: Detailed mapping (oily → oil control, pore appearance, humidity; dry → hydration, flakiness reduction)
- **Legal table**: Whitening claims (ช่วยให้ผิวดูกระจ่างใส only, not ทำให้ผิวขาว), sunscreen (reapply 2h), supplements (Thai FDA ประกาศ 293)
- **Thai-specific rules**: 8 sub-rules including no ยา (medicine) word, no ถาวร (permanent), no fake before-afters
- **Real estate**: Most stringent regulation set (8 categories with disclaimers)

### 4. **Electronics Reviewer**
- **Categories**: smartphone, laptop_pc, tablet, camera, headphones, wearable, smart_device, peripheral, gaming, power
- **Special guidance**: Benchmark context (no fabricated scores), tactile details (weight, vibration, feel)
- **Legal table**: Wireless devices (no FCC claims unless verified), batteries (follow manufacturer), wearables health-tracking (not medical)

### 5. **Fashion & Clothing Reviewer**
- **Categories**: tops, bottoms, dresses, outerwear, activewear, intimates, shoes, bags, accessories, jewelry, watches
- **Product specs fields**: fabric composition, weight (GSM), special features, sizing, care, certifications
- **Fabric material**: cotton, polyester, silk, linen, denim, leather, faux_leather, suede, wool, nylon, spandex_elastane, recycled, synthetic_blend
- **Special features**: waterproof, water_resistant, uv_protection, breathable, stretch, wrinkle_resistant, quick_dry, thermal, reflective, antimicrobial, recycled_material, organic
- **Condition field**: new, secondhand_preloved, vintage, restored, handmade_custom
- **Fit profile**: petite, tall, plus_size, standard, athletic, all
- **Review focus**: fit_comfort, material_quality, styling_versatility, durability_value, first_impression, long_term, comparison
- **Special section**: Include care guide (fabric-specific washing advice)
- **Fabric analysis rules**: Texture, weight, drape, stretch, transparency, temperature (detailed guidance per term)
- **Image analysis**: Weave pattern, construction quality, visible stitching, hem finish, color accuracy
- **Condition-specific rules**: 5 adaptations (new/secondhand/vintage/restored/handmade)
- **Legal table**: Authenticity (never claim genuine leather without spec), counterfeit warning, textile labeling (มอก. 443-2558, Thai consumer protection law penalties)
- **Most complex skill**: 15+ specialized form fields + textile regulations

### 6. **Food & Grocery Reviewer**
- **Categories**: snack, beverage, instant_meal, condiment, ingredient, frozen, canned, bakery, dairy, health_food, imported
- **Special guidance**: Taste, texture, aroma, appearance, mouthfeel, aftertaste, portion size, shelf life, preparation, pairing
- **Legal table**: Food supplements (Thai FDA), alcoholic beverages (age warning), baby food (not replaces breastfeeding)
- **Simplest legal section**: Only 3 regulated categories

### 7. **Hardware & Renovation Reviewer**
- **Categories**: power_tool, hand_tool, measuring, toilet, faucet, sink, plumbing, material, safety_equip, bathroom_fixture
- **Special guidance**: Weight in hand, vibration, grip comfort, water pressure, noise level, project realism
- **Legal table**: Power tools (follow manufacturer), electrical tools (verify voltage), construction chemicals (ventilation)
- **Focus**: "seasoned DIYer or handyman talking to a friend"

### 8. **Health & Wellness Reviewer**
- **Categories**: supplement, vitamin, health_device, fitness_equip, personal_care, massage, sleep, weight
- **Special guidance**: Timeline realism (weeks/months), taste/texture, ease of use, app connectivity
- **CRITICAL INSERTION RULE**: Mandatory Thai FDA disclaimer at end for supplements + medical devices
- **Disclaimer pattern**: "Eat variety 5 food groups. Product has no effect in disease prevention/treatment. Read warnings."
- **Legal table**: Supplements (cures/treats prohibited), medical devices (not medical grade diagnosis), weight mgmt (no guaranteed loss), sleep aids (no cure insomnia)
- **Key distinction**: Only skill with auto-inserted mandatory regulatory disclaimers

### 9. **Hobby & Craft Reviewer**
- **Categories**: art, craft, board_game, model, music, diy, stationery, collectible, gaming
- **Special guidance**: Learning curve, beginner-friendly, creative potential, community resources
- **Legal table**: Children's supplies (non-toxic certification), sharp tools (adult supervision), electrical (manufacturer guidelines)

### 10. **Home Appliance Reviewer**
- **Categories**: laundry, cooling, refrigeration, cooking, cleaning, water, air, small
- **Special guidance**: Noise level, filter cleaning, control panel, installation experience, electricity consumption
- **Thai sensitivity note**: "Thai households are sensitive to electricity costs"
- **Legal table**: All electrical (follow manufacturer), gas appliances (certified technician), high-voltage (no DIY repair)

### 11. **Home Decor & Textile Reviewer**
- **Categories**: furniture, bedding, curtain, rug, lighting, wall_decor, towel_bath, plant, table_linen
- **Special guidance**: Room aesthetics (minimalist, Scandinavian, boho, contemporary), color accuracy vs photos, new fabric smell
- **Legal table**: Electrical (follow guidelines), children's furniture (age recommendations), textile cleaning chemicals (manufacturer instructions)

### 12. **Household Product Reviewer**
- **Categories**: cleaning, kitchen, laundry, organization, tools, baby_kids, elderly_care, bathroom, bedroom, cookware, gadgets
- **Special guidance**: Texture, weight, smell, sound, hand feel, actual usage
- **Legal table**: Medical devices (cures prohibited), cleaning chemicals (100% safe denied), electrical (follow guidelines), children's (supervision), food products (5 food groups, disease claims)
- **Note**: Most diverse category scope (catch-all product type)

### 13. **Pet Products Reviewer**
- **Categories**: dog_food, cat_food, accessory, grooming, toy, health, carrier, aquarium, cat_specific, small_animal
- **Special guidance**: Pet reaction, energy levels, coat shine, enthusiasm at mealtime, interaction style
- **Pet-specific scenarios**: "My dog refused to eat anything for two days until..."
- **Legal table**: Supplements (consult vet), flea-tick (dosage caution), pet food (allergen check, transition gradually), dental (vet check-ups)

### 14. **Real Estate Reviewer** (EXCEPTION: Analytical, not Storytelling)
- **Categories**: single_house, townhouse, condo_highrise, condo_lowrise, land_residential, land_agricultural, land_commercial, estate, mixed_use
- **Review angles**: buyer_perspective, investor_perspective, family_perspective, comparison_area, site_visit
- **Output format**: STRUCTURED ANALYSIS (NOT storytelling templates)
- **Structure sections** (8 sections, mandatory order):
  1. Title
  2. Location Analysis (transit, amenities, future infrastructure)
  3. Project Overview (developer, units, construction quality)
  4. Facilities & Common Areas
  5. Price Analysis & Value (with hedging)
  6. Pros and Cons (bullet-style)
  7. Investment Perspective (rental yield, appreciation, risks)
  8. Who Is This Suitable For?
- **Key differences**:
  - No storytelling templates (different instruction model)
  - No narrative tone (informative, balanced, consultative)
  - Structured analytical framework instead of narrative arc
  - Decimal section lengths for different review types
  - Investment-specific guidance + risk factors
  - Disclaimers: prices subject to change, consult professionals
- **Legal table**: Guaranteed prices (prohibited), title deed (verify with Land Dept), investment returns (past performance ≠ future)

### 15. **Sports & Outdoor Reviewer**
- **Categories**: fitness, running, cycling, swimming, camping, team_sport, outdoor, protective, sportswear
- **Special guidance**: Weight during hike, grip during wet workout, breathability on hot day, pack-down size
- **Athletic persona**: "training partner sharing real experience after testing gear"
- **Legal table**: Protective gear (follow fit guidelines), supplements alongside (no health claims), electrical equipment (follow manufacturer), children's products (age recommendations)

---

## Shared Pattern Analysis

### Input Fields (Core to All Story-Driven Skills)

| Field | Type | Required | Options | Purpose |
|-------|------|----------|---------|---------|
| topic | string | YES | — | Product name/description |
| language | enum | YES | en, th | Output language |
| product_category | enum | YES | domain-specific | Tailor review angle |
| review_angle | enum | NO | 5 options | Narrative perspective |
| include_pricing | boolean | NO | true/false | Include price analysis |
| storytelling_style | enum | NO | 13 templates | Narrative structure |
| length | enum | NO | short/medium/long | Word count preset |
| word_count | integer | NO | — | Override length |
| output_format | enum | NO | markdown/plain_text | Formatting mode |
| product_specs | text | NO | — | Factual specifications |
| reference_images | array | NO | URLs | Image analysis basis |

**Real Estate variation**: Uses `property_details` (not product_specs), `review_angle` has 5 different options.

### TTS-Safe Writing Rules (Uniform Across All)

```
/ → "or" (English), "หรือ" (Thai)
& → "and" (English), "และ" (Thai)
% → "percent" (English), "เปอร์เซ็นต์" (Thai)

Numbers:
  3-5 days → "three to five days"
  1000-1500 baht → "one thousand to one thousand five hundred baht"

Prices: ~299 → "around 299 baht" / "ประมาณ 299 บาท"
Ranges: 4-6h → "four to six hours"
```

**Real estate variation**: Larger numbers spelled out (millions, thousands).

### Language Guidance (Uniform Thai)

```
- Casual, middle-school comprehensible level
- NO formal endings (ครับ, ค่ะ, ค่อ)
- Natural conversational particles (นะ, เลย, จริงๆ, ก็)
- NOT academic Thai
- Professional enough for domain (real estate exception: clearer professional tone)
```

---

## Legal Compliance Architecture

### Three-Layer Structure

**Layer 1: Brand Protection**
- Never name competitor brands ("better than X", "unlike Y")
- Never use trademarked names (even positively)
- Never "dupe", "alternative to [Brand]", "similar to [Brand]"
- Use generic terms ("similar products in price range")

**Layer 2: Claim Control**
- No guarantees (WILL/100%/permanent)
- No fabricated testimonials/statistics
- No "#1", "best", "unbeatable" claims
- Hedging language required ("in experience", "many find", "designed to")

**Layer 3: Regulated Categories (Domain-Specific)**

**Most regulated skills** (by count of categories with special rules):

1. **Beauty & Skincare**: 6 regulated categories
   - Skincare (cures acne → "may help improve appearance")
   - Makeup (permanent coverage prohibited)
   - Sunscreen (no 100% UV block)
   - Supplements (no guaranteed whitening)
   - Acne treatment (consult dermatologist if persists)
   - Hair loss (results vary, consult doctor)
   - **Thai-specific**: ประกาศ อย. 2564 — no ยา word, no ถาวร, no fake before-afters, no อย. approval claims

2. **Health & Wellness**: 4 regulated categories
   - Supplements (Thai FDA ประกาศ 293)
   - Medical devices (consult healthcare professional)
   - Weight management (no guaranteed loss)
   - Sleep aids (consult healthcare professional if persistent)

3. **Household Products**: 5 categories
   - Medical devices, cleaning chemicals, electrical, children's, food products

4. **Real Estate**: 3 categories
   - All properties (verify with Land Dept for title), investment (no guarantees)

**Least regulated**:
- **Food & Grocery**: 3 categories (supplements, alcohol, baby food)
- **Electronics**: 3 categories (wireless, batteries, wearables)

### Disclaimer Insertion Rules

**Standard pattern** (used in 14 skills):
- Naturally woven into Soft Close section
- Framed as practical guidance, not intrusive block

**Exception — Health & Wellness**:
- **Mandatory auto-insertion** at end of review (not optional)
- Thai FDA text for supplements: "ควรกินอาหารหลากหลายครบ 5 หมู่..."
- Medical device text: "สังเกตคำเตือนในฉลาก..."

---

## Storytelling Templates (13-15 Patterns)

All story-driven skills support **14 templates** (same 14 across all domains):

| Template | Acronym | Arc | Use Case |
|----------|---------|-----|----------|
| Hook-Problem-Solution-Outcome | HPSO | Linear | Clear problem → clear solution |
| Attention-Interest-Desire-Action | AIDA | Sales funnel | Engagement-focused |
| Problem-Agitate-Solution | PAS | Emotional | Pain point emphasis |
| Hook-Insight-Tip | HIT | Educational | Knowledge-driven |
| Before-After-Bridge | BA | Transformation | Visual comparison |
| Story Flow | SF | Narrative arc | Character journey |
| My Why-My Way-Your Turn | MWYMT | Personal | Relatable perspective |
| Complain-Recall-Press-Gentle | CRPG | Comparative | Old vs new contrast |
| Features-Advantages-Benefits | FAB | Logical | Spec-driven |
| Situation-Task-Action-Result | STAR | Case study | Concrete example |
| Situation-Complication-Resolution | SCR | Drama | Obstacle resolution |
| Inverted Pyramid | IP | News-style | Verdict-first |
| Listicle | L | Structured | Numbered points |
| Question-Explore-Answer-Takeaway | QA | Inquiry | Skeptical audience |

**Real estate variation**: No templates. Structured analytical framework instead.

---

## Model-Specific Considerations

**Observations from skill.md files**:

- **NO model-specific instructions** in 14 story-driven skills (LLM-agnostic design)
- **ALL skills compatible with Claude** (instruction-following emphasis, hedging language support)
- **Heavy on narrative structure** (14 templates suggest GPT-3.5+ era design, not Claude native)
- **Real Estate exception**: Structured analysis suggests newer design (analytical framework stronger)

**Recommendations for Claude optimization**:
- Structure-heavy skills (real estate, beauty ingredient analysis) map well to Claude's thinking
- Narrative skills rely on "natural structure following" — Claude excels at this
- TTS-safety rules ensure readable output regardless of model

---

## Thai Language & Regulatory Specifics

### Thai FDA Regulations

**ประกาศ สธ. ฉบับที่ 293** (Health Supplement FDA Announcement 293):
- Required disclaimer for all supplements in any review
- Auto-inserted at end of health & wellness reviews
- Text: "ควรกินอาหารหลากหลายครบ 5 หมู่ ในสัดส่วนที่เหมาะสมเป็นประจำ ผลิตภัณฑ์นี้ไม่มีผลในการป้องกันหรือรักษาโรค อ่านคำเตือนในฉลากก่อนบริโภค"

**ประกาศ อย. 2564** (Cosmetics Advertising Announcement 2564):
- Beauty & skincare specific (8 sub-rules)
- Prohibits: ยา (medicine word), ถาวร (permanent claims), fake before-afters
- No อย. "certification" claims (อย. registers but doesn't approve efficacy)
- Whitening must use ช่วยให้ผิวดูกระจ่างใส (appear brighter), never ทำให้ผิวขาว (make white)

**มอก. 443-2558** (Fiber Content Textile Standard):
- Fashion skill specific
- Fiber content labeling ±3% tolerance
- All fibers ≥5% must be listed
- Violation penalties: 5,000-100,000 baht

**พ.ร.บ.คุ้มครองผู้บริโภค พ.ศ. 2522** (Consumer Protection Act, amended 2558):
- Fashion: false fiber/origin/care claims → 5,000-100,000 baht fine
- Counterfeit branded goods → 4-20 years imprisonment + 40,000-400,000 baht fine

**พ.ร.บ.เครื่องหมายการค้า พ.ศ. 2534** (Trademark Act, amended 2559):
- Fashion: counterfeit goods → 4-20 years + 40,000-400,000 baht

---

## Architecture Strengths

1. **Reusability**: 14 story-driven skills share 80% of system prompt structure
2. **Extensibility**: New product category = new domain rules + legal table (2-3 hours)
3. **Consistency**: Unified TTS safety, language, compliance layer across all skills
4. **Compliance**: Legal tables prevent reviewers from making prohibited claims
5. **Flexibility**: 14 storytelling templates + dynamic form fields = many review combinations
6. **Thai-optimized**: Three separate Thai regulatory frameworks embedded
7. **Image-aware**: All skills can analyze reference images; fashion/beauty have extra detail guidance

---

## Architecture Weaknesses

1. **Template proliferation**: 14 templates create cognitive load; some overlapping (HPSO ≈ FAB light version)
2. **Real estate isolation**: Separate analytical model makes it harder to maintain parity with other skills
3. **Documentation density**: 1500-2000 words per skill = hard to modify without introducing bugs
4. **Thai regulatory fragmentation**: Three separate government announcements embedded; no centralized compliance reference
5. **Image analysis vagueness**: "Use visual details naturally" lacks concrete validation rules (esp. fashion counterfeits)
6. **Dynamic field complexity**: 15+ input fields in fashion/beauty create form validation overhead
7. **Spec abuse risk**: product_specs field trusts user input; no validation against known misspecs

---

## Open Questions

1. **Skill versioning**: How are minor updates to these skills deployed? (No version bumping logic observed)
2. **Template selection logic**: How does the LLM choose which template if user doesn't specify? (Marked "randomly select" but no seed/logic visible)
3. **Image counterfeit detection**: Fashion skill warns about counterfeits but provides no detection heuristics — relies on reviewer judgment
4. **Real estate rental yield math**: How are "typical yields" calculated? (References "area averages" without source data)
5. **Credit cost variance**: Why do all skills have same `creditMultiplier: 1.0`? (Beauty + fashion likely costlier due to complexity)
6. **Spec contradictions**: What happens if user provides conflicting specs? (E.g., "cotton 100%" vs "polyester blend")
7. **Disclaimer display**: Real estate auto-inserts disclaimers — are these in fact being rendered in presentations?
8. **Thai language drift**: How are Thai regulations kept in sync with Ministry of Public Health updates?

---

## Recommendations

### Short Term (Safe, Low-Risk)

1. **Create skill compliance spreadsheet**: Map all prohibited claims + required disclaimers to central document for auditing
2. **Add spec validation examples**: Clarify what constitutes valid product_specs input (e.g., "cotton 100%, 180 GSM, certified OEKO-TEX")
3. **Document template selection heuristic**: Make explicit how template is chosen when not specified (currently "randomly")
4. **Add fashion counterfeit checklist**: Provide concrete visual heuristics (packaging quality, logo placement, serial numbers)

### Medium Term (Modernization)

1. **Consolidate real estate model**: Port real estate back to storytelling template framework (with structured analysis as special "style" option) for code parity
2. **Simplify storytelling templates**: Reduce from 14 to 7-8 most useful patterns; eliminate overlaps (HPSO, FAB, STAR share DNA)
3. **Create unified Thai compliance layer**: Centralized reference module listing ประกาศ codes + penalties; import in all skills
4. **Add image validation rules**: For fashion/beauty, provide explicit image analysis checklist (material, construction, branding, counterfeit indicators)

### Long Term (Scalability)

1. **Skill template system**: Abstract common 80% into base skill class; allow domains to override only legal table + specific fields
2. **Compliance registry**: Central database of prohibited claims indexed by product category + jurisdiction (extensible to EU, ASEAN)
3. **Dynamic form generation**: Config-driven skill input forms instead of hardcoded field lists in prompt
4. **Multi-language regulatory framework**: Extend Thai regulations to English equivalents (FTC guidelines, ASA codes, EU UCPD)

---

## File Locations

**All 15 skill.md files are in**:
`/home/dev/projects/SmartSpecPro/apps/web/skills/[skill-slug]/skill.md`

**Key files for implementation**:
- Story-driven pattern: agriculture-garden-reviewer/skill.md (lines 1-220, generic template)
- Beauty complexity example: beauty-skincare-reviewer/skill.md (lines 170-240, skin_type guidance + ingredient analysis)
- Fashion specialization: fashion-clothing-reviewer/skill.md (lines 112-263, fabric analysis + textile law)
- Real estate analytical model: real-estate-reviewer/skill.md (lines 107-220, structured vs narrative)
- Legal complexity peak: beauty-skincare-reviewer/skill.md (lines 210-276, 8 regulated categories)

---

## Conclusion

SmartSpecPro's reviewer skill architecture is **mature, well-structured, and highly reusable**. The 14 story-driven skills share ~80% common pattern (form fields, TTS rules, storytelling templates, compliance layer), making it an excellent model for rapid skill expansion. The real-estate skill demonstrates capability for analytical variants.

**Key insight for new skills**: Adding category X requires only:
1. Domain-specific `product_category` enum (5-10 values)
2. Domain-specific legal table (3-6 regulated categories)
3. Optional domain-specific form fields (e.g., skin_type for beauty)
4. Example scenarios in tone/guidance sections

This is a **template-first, domain-second architecture** — highly scalable for e-commerce expansion.
