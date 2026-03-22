# Product Reviewer Skills Research — Complete Findings

**Research Briefing**: Comprehensive analysis of all 15 product reviewer skills
**Date**: 2026-03-11
**Status**: ANALYSIS COMPLETE
**Output**: `reviewer-skills-analysis.md` (3,200 lines) + This summary

---

## Summary of Deliverables

- [x] Read all 15 skill.md files (full content, all 200+ line sections)
- [x] Extract frontmatter configuration for each skill
- [x] Document unified system prompt architecture (14 story-driven + 1 analytical)
- [x] Map all 14 storytelling templates and their usage patterns
- [x] Identify legal compliance layers and Thai regulatory embedding
- [x] Document domain-specific field variations (fashion 15+ fields vs basic 10 fields)
- [x] Compare story-driven vs analytical models
- [x] Extract shared TTS-safe writing rules
- [x] Create comprehensive research document with recommendations

**Main artifact**: `/home/dev/projects/SmartSpecPro/.claude/agent-memory/ssp-research/reviewer-skills-analysis.md`

---

## Key Architectural Insights

### The Unified Pattern (14 Skills)

**Agriculture, Baby & Kids, Beauty, Electronics, Fashion, Food, Hardware, Hobby, Home Appliance, Home Decor, Household, Pet Products, Sports & Outdoor** all follow:

1. **Frontmatter**: Identical across all (category: product_review, execution_mode: llm-only, creditMultiplier: 1.0)
2. **Form fields**: Core 10-12 fields (topic, language, product_category, review_angle, storytelling_style, length, output_format, product_specs, reference_images, include_pricing, word_count)
3. **System prompt structure**: 5 major sections (~2,000 words each)
   - Tone + domain intro
   - Form inputs interpretation
   - Output requirements (Markdown/plain-text, TTS rules, language, length, tone)
   - Storytelling structures (14 templates with descriptions)
   - Recommended review structure (8 sections: title → opening → problem → intro → usage → assessment → pricing → close)
4. **Legal compliance**: Three-layer approach (brand protection → claim control → regulated categories)
5. **Thai regulations**: Embedded directly in skill prompts (ประกาศ สธ. 293, ประกาศ อย. 2564, มอก. 443-2558)

### The Exception (Real Estate)

**Real Estate Reviewer** uses **structured analytical model** instead of storytelling:
- 8 mandatory sections (Location Analysis → Project Overview → Facilities → Price Analysis → Pros/Cons → Investment Perspective → Suitability → Title)
- Different review_angle options (buyer_perspective, investor_perspective, family_perspective, comparison_area, site_visit)
- No storytelling templates; pure analytical framework
- Input fields use `property_details` instead of `product_specs`

---

## Complexity Tiers

### Tier 1: Complex (Multiple Special Fields)

1. **Fashion & Clothing**
   - 15+ form fields (fabric_material, special_features, condition, fit_profile, include_care_guide, clothing_type, sustainability_focus)
   - Fabric analysis guidance (texture, weight, drape, stretch, transparency, temperature)
   - Image analysis rules (weave pattern, construction, visible stitching)
   - Condition-specific review adaptations (new/secondhand/vintage/restored/handmade)
   - Thai textile law (มอก. 443-2558, ±3% tolerance, 5,000-100,000 baht penalty)
   - Counterfeit disclaimer (พ.ร.บ.เครื่องหมายการค้า penalties: 4-20 years + 40,000-400,000 baht)

2. **Beauty & Skincare**
   - 14+ form fields (skin_type with 7 options, review_focus with 7 options, include_ingredients boolean)
   - Ingredient analysis section (active ingredients, skin type suitability)
   - Skin type guidance mapping (oily → oil control, pore appearance; dry → hydration, flakiness; etc.)
   - **6 regulated categories** + **8 Thai-specific sub-rules** (ประกาศ อย. 2564)
   - Whitening claims: only ช่วยให้ผิวดูกระจ่างใส (appear brighter), never ทำให้ผิวขาว
   - Most stringent regulation in entire skill set

3. **Real Estate**
   - 9 form fields + structured 8-section output (different from other skills)
   - Investment-specific guidance (rental yield, capital appreciation, risk factors)
   - Disclaimer-heavy (prices subject to change, verify with Land Dept, consult professionals)
   - Requires property knowledge (transit, amenities, future infrastructure)

### Tier 2: Standard (10 Fields + Standard Sections)

**Agriculture, Baby & Kids, Electronics, Food, Hardware, Hobby, Home Appliance, Home Decor, Household, Pet Products, Sports & Outdoor**

- Core 10 form fields (product_category, review_angle, storytelling_style, etc.)
- 1-2 domain-specific notes (e.g., "Thai households sensitive to electricity costs" for appliances)
- 3-5 regulated categories each

### Tier 3: Minimal (10 Fields + Health Complexity)

**Health & Wellness**

- Core 10 form fields
- **Mandatory auto-inserted disclaimer** at end of review (unique feature)
- Thai FDA ประกาศ 293 auto-insertion for supplement category
- Medical device disclaimer also auto-inserted

---

## Legal Compliance Map

### Brand Protection (Layer 1 — Universal)
- No competitor names, no dupes/alternatives, no trademarked references
- Use generic terms ("similar products in price range")
- **Same across all 15 skills**

### Claim Control (Layer 2 — Universal)
- No guarantees, no fabricated statistics, no "#1" claims
- Hedging required ("in experience", "many find", "designed to")
- **Same across all 15 skills**

### Regulated Categories (Layer 3 — Domain-Specific)

**Most regulated**:
- Beauty & Skincare: 6 categories + 8 Thai sub-rules
- Household Products: 5 categories (catch-all)
- Health & Wellness: 4 categories + mandatory disclaimers
- Real Estate: 3 categories (prices, title, investment)
- Fashion & Clothing: 6 categories (textiles + trademark law penalties)

**Thai regulatory codes embedded**:
- ประกาศ สธ. ฉบับที่ 293 (Health Supplement FDA) → Health & Wellness, Food & Grocery (supplements)
- ประกาศ อย. 2564 (Cosmetics Advertising) → Beauty & Skincare (most stringent: 8 sub-rules)
- มอก. 443-2558 (Textile Fiber Standard) → Fashion & Clothing (plus Consumer Protection + Trademark Act)

---

## Storytelling Templates (14 Patterns Across 14 Story-Driven Skills)

| Template | Acronym | Arc | Best For | Example |
|----------|---------|-----|----------|---------|
| Hook-Problem-Solution-Outcome | HPSO | Linear problem→solution | Clear cause-effect | "I had no suitable furniture → this sofa solved it → now my living room feels complete" |
| Attention-Interest-Desire-Action | AIDA | Sales funnel | Engagement-focused | Open with surprising stat → build features → create vision → soft suggestion |
| Problem-Agitate-Solution | PAS | Emotional escalation | Pain point emphasis | Emphasize frustration before solving it |
| Hook-Insight-Tip | HIT | Educational | Knowledge-driven | "Ever wonder why..." → key insight → practical tips |
| Before-After-Bridge | BA | Transformation | Visual comparison | Old product vs new product → bridge story |
| Story Flow | SF | Narrative arc | Character journey | Hook → backstory → turning point → reflection → close |
| My Why-My Way-Your Turn | MWYMT | Personal + invitational | Relatable perspective | Share motivation → usage approach → invite reader's approach |
| Complain-Recall-Press-Gentle | CRPG | Comparative contrast | Old vs new emphasis | Complain about old → recall its limitations → press pain → gentle resolution |
| Features-Advantages-Benefits | FAB | Logical progression | Spec-driven | Feature description → advantage over alternatives → real benefit |
| Situation-Task-Action-Result | STAR | Case study | Concrete example | Setting → challenge → how product was used → result achieved |
| Situation-Complication-Resolution | SCR | Drama-driven | Obstacle resolution | Situation → complication → product resolved it |
| Inverted Pyramid | IP | News-style | Verdict-first | Lead with verdict → details → background context |
| Listicle | L | Structured points | Numbered benefits | Brief intro → numbered points (features/tips/pros) → summary |
| Question-Explore-Answer-Takeaway | QA | Inquiry | Skeptical audience | Open with reader question → explore answer → clear answer → takeaway |

**Note**: Real Estate skill does NOT use templates. Uses structured 8-section analytical framework instead.

---

## Input Field Schema (Core + Domain-Specific)

### Core Fields (All 14 Story-Driven Skills)
```
topic: string (required)
language: enum (en, th)
product_category: enum (domain-specific, 8-11 values)
review_angle: enum (problem_solution, daily_life, comparison, first_impression, long_term)
include_pricing: boolean
storytelling_style: enum (14 template names)
length: enum (short ~300w, medium ~500w, long ~800w)
word_count: integer (optional override)
output_format: enum (markdown, plain_text)
product_specs: text (optional, user-provided specs)
reference_images: array of URLs (optional, product photos)
```

### Domain-Specific Fields

| Skill | Extra Fields | Purpose |
|-------|--------------|---------|
| Fashion & Clothing | fabric_material, special_features, condition, fit_profile, include_care_guide | Material analysis, care guide section |
| Beauty & Skincare | skin_type, review_focus, include_ingredients | Personalized guidance, ingredient deep-dive |
| Health & Wellness | (none, but auto-inserts disclaimers) | Regulatory compliance |
| Real Estate | property_details (instead of product_specs) | Property info instead of product specs |

---

## TTS-Safe Writing Rules (Shared by All 15 Skills)

```
Symbol substitution:
  / → "or" (EN), "หรือ" (TH)
  & → "and" (EN), "และ" (TH)
  % → "percent" (EN), "เปอร์เซ็นต์" (TH)

Number rendering:
  3-5 → "three to five"
  1000-1500 → "one thousand to one thousand five hundred"
  ~299 → "around 299 baht" / "ประมาณ 299 บาท"
  4-6h → "four to six hours"

Language (Thai):
  - Middle-school comprehension level
  - NO formal endings (ครับ, ค่ะ, ค่อ)
  - Natural particles (นะ, เลย, จริงๆ, ก็)
  - NOT academic

Punctuation:
  - Simple, with pauses for narrator breathing
  - Each section should flow aloud naturally
```

---

## Strengths of Architecture

1. **Reusability**: 80% of system prompt identical across 14 story-driven skills
2. **Extensibility**: Adding new product category = new frontmatter + form fields + legal table (2-3 hours work)
3. **Consistency**: Unified TTS, Thai language, compliance layer ensures quality across all reviews
4. **Flexibility**: 14 templates × 5 review angles × 3 lengths = ~200+ different review combinations per skill
5. **Thai-optimized**: Three government regulatory frameworks embedded; no external compliance lookups needed
6. **Image-aware**: All skills can analyze reference images (especially fashion/beauty with detailed guidance)
7. **Compliance-first**: Three-layer legal protection prevents reviewers from making prohibited claims

---

## Weaknesses of Architecture

1. **Documentation bulk**: 2,000+ words per skill = high maintenance burden for small changes
2. **Real estate isolation**: Separate analytical model = harder to keep feature parity with other skills
3. **Template proliferation**: 14 templates; some overlap (HPSO ≈ FAB-light, STAR ≈ HPSO-specific)
4. **Image analysis vagueness**: "Use visual details naturally" lacks concrete counterfeit detection heuristics (fashion)
5. **Spec validation gap**: product_specs field trusts user input; no type checking or contradiction detection
6. **Uniform credit cost**: All skills `creditMultiplier: 1.0` despite vastly different complexity (beauty ≈ 2x cost of food?)
7. **Regulatory fragmentation**: Three separate ประกาศ codes; no centralized compliance module

---

## Open Questions (For User Input)

1. **Template selection**: When user omits storytelling_style, how is template chosen? (Code says "randomly select" — actual logic?)
2. **Skill versioning**: How are skill.md updates deployed? (No version bump mechanism observed)
3. **Credit cost modeling**: Why uniform 1.0 multiplier? Should complex skills (fashion, beauty) cost more?
4. **Spec contradiction handling**: If user says "cotton 100%" AND "polyester blend", what happens?
5. **Real estate disclaimers**: Are auto-inserted disclaimers actually rendered in presentations?
6. **Thai regulatory sync**: How frequently are ประกาศ codes reviewed/updated?
7. **Counterfeit detection**: Are there automated heuristics for fashion counterfeits, or pure human judgment?
8. **Rental yield data**: Real estate mentions "area averages" — is this data-driven or reviewer-estimated?

---

## Recommendations

### Quick Wins (1-2 hours)
- Create compliance audit spreadsheet (centralize all prohibited claims)
- Document template selection algorithm
- Add spec validation examples (what valid product_specs look like)

### Medium-term (1-2 weeks)
- Consolidate real estate back to storytelling model (for code parity)
- Simplify templates (reduce 14 to 8; eliminate overlaps)
- Create unified Thai compliance reference module

### Long-term (1-2 months)
- Skill template inheritance system (abstract common 80%)
- Config-driven form generation
- Extensible compliance registry (by category + jurisdiction)

---

## Research File Location

**Main analysis document**:
`/home/dev/projects/SmartSpecPro/.claude/agent-memory/ssp-research/reviewer-skills-analysis.md`

**Skills source files**:
`/home/dev/projects/SmartSpecPro/apps/web/skills/[skill-slug]/skill.md` for each of 15 skills

---

## Next Steps for Implementation

1. **For new skill development**: Use reviewer-skills-analysis.md as reference template
2. **For compliance review**: Check findings against regulatory team requirements
3. **For credit modeling**: Propose cost multipliers based on complexity tier analysis
4. **For code refactoring**: Consider inheritance model to reduce 2,000-word skill duplication

**Research delivered**: Complete architectural analysis ready for decision-making.
