# Fashion & Clothing Reviewer Skill — Research Summary

**Research Completed**: 2026-03-10
**Status**: Ready for Implementation Planning
**Effort Estimate**: 4-6 hours to complete skill.md + schemas
**Quality Baseline**: Review skill quality should match or exceed beauty-skincare-reviewer

---

## What Was Research

Comprehensive investigation into building a fashion/clothing review skill for SmartSpecPro that:
1. Identifies unique fashion domain requirements beyond existing reviewer skills
2. Maps Thai legal/regulatory requirements for textile advertising
3. Provides production-ready field specifications and implementation guidance
4. Documents error handling and validation rules
5. Includes test scenarios and expected outputs

---

## Key Findings

### 1. Existing Pattern (Confirmed)

SmartSpecPro has two established reviewer skills following identical structure:
- **household-product-reviewer** (245 lines): Cleaning, kitchen, gadgets, etc.
- **beauty-skincare-reviewer** (274 lines): Skincare, makeup, haircare, supplements, etc.

Both use 3-file pattern:
- `skill.md` — 250-280 lines, LLM system prompt
- `ui.schema.json` — 200-240 lines, custom form with sections and bilingual labels
- `input.schema.json` — 90-170 lines, JSON Schema for validation

**Shared "Universal" Fields** (8 fields in all reviewers):
- topic (required)
- language (en/th)
- reference_images (optional product photos)
- storytelling_style (14 narrative templates)
- length (short/medium/long)
- word_count (optional override)
- output_format (markdown/plain_text for TTS)
- include_pricing (boolean)

### 2. Fashion Domain Uniqueness

Fashion requires **7 additional domain-specific fields** that don't map cleanly to household or beauty:

```
fabric_material      → Determines care, durability, sustainability discussion
fit_profile          → Personalizes review for body type (petite, tall, plus-size)
special_features     → Technical properties (waterproof, stretch, breathable, etc.)
condition            → Product lifecycle (new vs secondhand/vintage vs vintage)
care_complexity      → Enables detailed care/maintenance section
sustainability_focus → Frames through eco-conscious lens
review_angle         → Fashion-specific focus (fit_comfort, style_versatility, etc.)
```

These are NOT optional cosmetic additions. They address critical user needs:
- **Fit**: Reviews of clothing must account for body type variation (unlike household or beauty)
- **Materials**: Fabric type determines care, longevity, and sustainability impact
- **Authenticity**: Secondhand/vintage market has counterfeit risk (trademark issue)
- **Care**: Different fabrics (silk, denim, leather) need different care; impacts perceived value

### 3. Legal/Regulatory Requirements

**Thai Framework**:
1. **Consumer Protection Act (พ.ศ. 2558)** — Fiber content, origin, sizing accuracy, care instructions
2. **Thai Industrial Standard TIS 443-2558** — Fiber composition labeling ±3% tolerance
3. **Trademark Act (พ.ศ. 2559)** — Counterfeit penalties: 4-20 years + 40K-400K THB fines

**Critical Implications**:
- Reviews of counterfeit items are illegal (even if user thinks it's authentic)
- Fiber content claims must match tags; no unverified percentages
- Durability/longevity claims must be hedged (all depend on care)
- Sizing claims must account for body type variation
- Secondhand items require authentication disclosure

**Safety for SmartSpecPro**:
- Platform potentially liable if hosting counterfeit product reviews
- Skill must explicitly refuse counterfeits with clear error messaging
- All hedging language must be legally compliant per Thai regulations

### 4. Field Specification (Complete)

**Universal Fields** (8 shared):
| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| topic | textarea | — | Product name/description |
| language | select | "th" | Output language |
| reference_images | image upload | [] | Product photos for AI analysis |
| storytelling_style | select | — | 14 narrative structures |
| length | select | "medium" | short/medium/long |
| word_count | number | — | Optional word limit |
| output_format | select | "markdown" | markdown or plain_text (TTS) |
| include_pricing | boolean | false | Add pricing + value analysis |

**Fashion-Specific Fields** (7 new):
| Field | Type | Default | Options |
|-------|------|---------|---------|
| clothing_type | select | "general" | 12 types (tops, bottoms, dresses, outerwear, shoes, bags, accessories, watches, intimates, activewear, sleepwear, general) |
| fabric_material | multi-select | [] | 13 materials (cotton, polyester, silk, linen, denim, leather, suede, wool, nylon, spandex, recycled, synthetic_blend, other) |
| fit_profile | select | "general" | 8 body types (petite, tall, plus_size, athletic, pear_shaped, apple_shaped, standard, general) |
| special_features | multi-select | [] | 12 technical properties (waterproof, water_resistant, UV_protection, breathable, stretch, wrinkle_resistant, quick_dry, thermal, reflective, hypoallergenic, pockets, adjustable_fit) |
| condition | select | "new" | 5 states (new, secondhand_preloved, vintage, restored, handmade_custom) |
| care_complexity | boolean | false | Enables "Care & Maintenance" section |
| sustainability_focus | boolean | false | Frames through eco-conscious lens; requires certification |

**Review Angles** (Fashion-specific, replaces generic perspectives):
- fit_comfort — "Does it fit? How does it feel to wear?"
- style_versatility — "How many outfits can I make with this?"
- durability_value — "Is it worth the price? How long will it last?"
- quality_craftsmanship — "How well is it made? Seams, stitching, details?"
- first_impression — "What's the unboxing experience like?"
- long_term_wear — "After weeks/months of wearing, how has it held up?"
- sustainability — "What's the environmental and ethical impact?"

### 5. Prohibited Claims (By Category)

**Fashion Review Claims That Are ILLEGAL** (per Thai law):

| Type | Prohibited | Safe Alternative |
|------|-----------|-------------------|
| Fiber Content | "100% pure cotton" (unverified) | "Tag states 100% cotton" |
| Material | "Genuine leather" (no tag) | "Tag states genuine leather; feels authentic" |
| Authenticity | "[Brand] is 100% authentic" (unverified) | "Appears authentic based on tag/construction. Professional verification recommended for luxury items." |
| Durability | "Will last 5+ years guaranteed" | "Designed for durability; longevity depends on care" |
| Sizing | "Fits everyone" | "Fit my [body type] well; sizing varies by body type" |
| Origin | "Made in Italy" (if tag says Vietnam) | "Tag states [country] origin" |
| Sustainability | "100% eco-friendly" (unverified) | "Labeled as [certification]; recommend verifying independently" |
| Counterfeit | (Any positive review of fake) | [MUST REFUSE GENERATION] |

### 6. UI/Schema Structure

**5 Sections** (vs 3-4 in existing reviewers):
1. **Product Info** (4 fields) — topic, reference_images, clothing_type, language
2. **Fit & Materials** (3 fields) — fit_profile, fabric_material, special_features
3. **Product Details** (1 field) — condition
4. **Review Style** (3 fields) — review_angle, storytelling_style, include_pricing
5. **Care & Output** (5 fields, collapsible) — care_complexity, sustainability_focus, length, word_count, output_format

**Estimated Sizes**:
- `skill.md`: ~335 lines (vs 245-274 existing)
- `ui.schema.json`: ~275 lines (vs 200-235 existing)
- `input.schema.json`: ~170 lines (vs 90-150 existing)

### 7. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Platform liability for counterfeit reviews | Legal exposure if reviews of fakes hosted | Skill refuses counterfeits with clear error message |
| Unverified fiber/material claims | Violates Thai TIS 443-2558 | Require tag verification; hedge all unverified claims |
| Secondhand authenticity challenges | Risk of helping sell counterfeits as authentic | Require professional authentication disclaimer for luxury items |
| Misleading durability claims | Violates Consumer Protection Act | All durability must be hedged; depend on care |
| Body type variation not captured | Reviews less useful if don't account for fit | fit_profile field required; prompts for specific body type feedback |
| Greenwashing sustainability claims | Violates Thai advertising standards | Require visible certification logos; never accept company claims alone |

### 8. Implementation Readiness

**Pre-requisites**:
✓ Existing pattern documented (household + beauty skills)
✓ Field specifications finalized (7 new + 8 universal)
✓ Legal framework validated (Thai regulations cited)
✓ UI schema structure designed (5 sections)
✓ JSON schema template provided
✓ Error handling rules documented
✓ Test scenarios prepared (5 use cases)

**Next Steps**:
1. Create `apps/web/skills/fashion-clothing-reviewer/` folder
2. Draft `skill.md` (~335 lines) using provided outline
3. Generate `ui.schema.json` from specification
4. Create `input.schema.json` from provided template
5. Test with 5 sample products
6. Validate Thai language accuracy
7. Verify legal compliance with stakeholders
8. Deploy to skill registry

**Effort Estimate**: 4-6 hours
**Quality Target**: Match or exceed beauty-skincare-reviewer output

---

## Research Artifacts Created

### 1. fashion-clothing-reviewer-research.md (1,200 lines)
Comprehensive analysis covering:
- Pattern analysis of existing reviewer skills
- Fashion domain unique characteristics
- Critical form fields needed
- Legal compliance framework (Thai + International)
- Skill.md regulatory table for fashion categories
- Implementation options with cost/benefit analysis
- Open questions and future enhancements
- Reference file locations

### 2. fashion-reviewer-legal-framework.md (600 lines)
Deep dive into Thai and international regulations:
- Thai Consumer Protection Act specifics
- Thai Industrial Standard TIS 443-2558 (fiber content)
- Trademark Act counterfeit penalties
- E-commerce platform liability framework
- EU Textile Regulation (if cross-border)
- Prohibited claims by category (detailed table)
- Required disclaimers by scenario
- Complete legal compliance table for skill.md
- Implementation checklist for legal sections

### 3. fashion-reviewer-implementation-spec.md (500 lines)
Production-ready specification:
- Complete field specification table (15 fields total)
- UI schema structure (5 sections with all fields)
- JSON schema templates (ready to copy-paste)
- Skill.md sections outline with line targets
- Test scenarios (5 complete use cases)
- Error handling and validation rules
- Next steps for implementation
- Line count targets for each file

### 4. MEMORY.md (Updated)
Concise summary of key findings for future reference

---

## Recommendation

**Implement Fashion-Clothing-Reviewer Skill** using **Option B (Fashion-Specific Customization)**:

1. **Template Source**: Clone beauty-skincare-reviewer (richer field structure than household)
2. **New Fields**: Add all 7 fashion-specific fields (fabric_material, fit_profile, special_features, condition, care_complexity, sustainability_focus, review_angle)
3. **Custom Persona**: Fashion expertise focused on fit, authenticity, fabric care, secondhand considerations
4. **Legal Section**: Use complete regulatory table from fashion-reviewer-legal-framework.md
5. **UI Structure**: 5 sections with bilingual labels, appropriate icons, help text

**Quality Metrics**:
- Reviews should differentiate for fit profiles (petite, tall, plus-size readers)
- Fabric/material guidance must be clear and verifiable (tag-based)
- Care instructions must be actionable (wash, dry, storage specific)
- Sustainability claims must be hedged appropriately (certifications required)
- Counterfeit products explicitly rejected
- Secondhand/vintage reviews work smoothly with authentication guidance
- Output quality matches or exceeds beauty-skincare-reviewer

---

## Files & References

**Research Documents** (in `.claude/agent-memory/ssp-research/`):
- `fashion-clothing-reviewer-research.md` — Full analysis
- `fashion-reviewer-legal-framework.md` — Regulations + prohibited claims
- `fashion-reviewer-implementation-spec.md` — Field specs + JSON schemas
- `MEMORY.md` — This summary (concise version)
- `RESEARCH-SUMMARY.md` — This document

**Source Code References** (in `apps/web/skills/`):
- `household-product-reviewer/skill.md` — Template 1 (simple structure)
- `household-product-reviewer/schemas/ui.schema.json` — Template 1 UI
- `beauty-skincare-reviewer/skill.md` — Template 2 (richer structure) **RECOMMENDED**
- `beauty-skincare-reviewer/schemas/ui.schema.json` — Template 2 UI **RECOMMENDED**

---

## Timeline

- **Research**: Complete (this document)
- **Planning**: ~30 min (stakeholder sign-off on fields + legal review)
- **Implementation**: 4-6 hours (skill.md + schemas + testing)
- **Validation**: ~1 hour (Thai language review + legal compliance check)
- **Deployment**: ~30 min (add to registry, verify icon, smoke tests)

**Total**: ~6-8 hours from approval to production

---

**End of Research Summary**

For detailed questions, refer to specific research artifacts:
- Legal questions → `fashion-reviewer-legal-framework.md`
- Field specifications → `fashion-reviewer-implementation-spec.md`
- General analysis → `fashion-clothing-reviewer-research.md`
