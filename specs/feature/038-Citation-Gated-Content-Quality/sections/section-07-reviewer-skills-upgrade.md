# Section 07 — Reviewer Skills Upgrade

## Objective

Upgrade all 15 product reviewer skills to support ProductReviewCMS.v1 output format with scoring rubric, comparison table, FAQ, disclosure, and structured citations.

## Scope

1. Add `execution_policy` and `content_quality` frontmatter to all 15 reviewer skills
2. Add CMS JSON output format section to each skill.md
3. Add `response_mode`, `disclosure_type`, `price_thb`, `price_checked_at` to input schemas
4. Add category-specific scoring rubric defaults
5. Update UI schemas to expose new fields

## Affected skills (15)

1. `electronics-reviewer`
2. `beauty-skincare-reviewer`
3. `food-grocery-reviewer`
4. `fashion-clothing-reviewer`
5. `home-appliance-reviewer`
6. `household-product-reviewer`
7. `baby-kids-reviewer`
8. `health-wellness-reviewer`
9. `hobby-craft-reviewer`
10. `home-decor-textile-reviewer`
11. `sports-outdoor-reviewer`
12. `pet-products-reviewer`
13. `agriculture-garden-reviewer`
14. `hardware-renovation-reviewer`
15. `real-estate-reviewer`

## Changes per skill

### A. Frontmatter additions

Add to each skill.md:
```yaml
execution_policy:
  requires_web_search: true
  requires_citations: true
  requires_structured_output: true
  thinking_level_hint: "medium"
  output_format: "cms_review"
content_quality:
  citation_required_for: ["critical", "major"]
  min_citation_coverage: 0.7
  disclosure_required: true
  refresh_cadence_days: 30
```

### B. Output format section

Add a new section to each skill.md describing CMS JSON mode:
- When `response_mode` is `"cms_json"`, output ProductReviewCMS.v1 JSON
- When `response_mode` is `"markdown"` (default), output as before
- Include category-specific scoring rubric dimensions

### C. Input schema additions

Add to each `schemas/input.schema.json`:
```json
{
  "response_mode": { "type": "string", "enum": ["markdown", "cms_json"], "default": "markdown" },
  "disclosure_type": { "type": "string", "enum": ["none", "affiliate", "sponsored", "provided_for_review"] },
  "price_thb": { "type": "number" },
  "price_checked_at": { "type": "string", "format": "date" }
}
```

### D. Category-specific rubric dimensions

| Category | Dimensions |
|----------|-----------|
| electronics | ประสิทธิภาพ, คุณภาพจอ/เสียง, แบตเตอรี่, ความคุ้มค่า, การออกแบบ |
| beauty-skincare | ส่วนผสม, ประสิทธิผล, เนื้อสัมผัส, ความคุ้มค่า, ความอ่อนโยน |
| food-grocery | รสชาติ, คุณค่าอาหาร, ส่วนผสม, ความคุ้มค่า, บรรจุภัณฑ์ |
| fashion-clothing | วัสดุ, ตัดเย็บ, ความพอดี, ความคุ้มค่า, ความทนทาน |
| home-appliance | ประสิทธิภาพ, การประหยัดไฟ, ความเงียบ, ความคุ้มค่า, ความทนทาน |
| household-product | คุณภาพ, ความสะดวก, ความคุ้มค่า, ความทนทาน, ความปลอดภัย |
| baby-kids | ความปลอดภัย, คุณภาพวัสดุ, ความเหมาะกับวัย, ความคุ้มค่า, ความทนทาน |
| health-wellness | ประสิทธิผล, ส่วนผสม, ความปลอดภัย, ความคุ้มค่า, ความสะดวก |
| hobby-craft | คุณภาพวัสดุ, ความสนุก/สร้างสรรค์, ความง่ายในการใช้, ความคุ้มค่า, ความทนทาน |
| home-decor-textile | คุณภาพวัสดุ, การออกแบบ, ความทนทาน, ความคุ้มค่า, ความสะดวกในการดูแล |
| sports-outdoor | ประสิทธิภาพ, ความทนทาน, ความสบาย, ความคุ้มค่า, ความปลอดภัย |
| pet-products | คุณภาพ, ความปลอดภัยสัตว์เลี้ยง, ความสะดวก, ความคุ้มค่า, ความทนทาน |
| agriculture-garden | ประสิทธิภาพ, ความทนทาน, ความง่ายในการใช้, ความคุ้มค่า, ความเหมาะกับสภาพแวดล้อม |
| hardware-renovation | คุณภาพวัสดุ, ประสิทธิภาพ, ความปลอดภัย, ความคุ้มค่า, ความทนทาน |
| real-estate | ทำเล, คุณภาพก่อสร้าง, สิ่งอำนวยความสะดวก, ความคุ้มค่า, ศักยภาพลงทุน |

## Implementation strategy

1. Create a shared template block for the CMS JSON output format section
2. For each skill: update frontmatter → update output format section → update input schema
3. Batch skills by similarity to minimize repetitive work
4. Test with 1 representative skill first (electronics-reviewer), then apply pattern to all

## Acceptance criteria

1. All 15 reviewer skills have `execution_policy` and `content_quality` in frontmatter
2. All 15 have CMS JSON output format section with category-specific rubric
3. All 15 input schemas include `response_mode`, `disclosure_type`, `price_thb`, `price_checked_at`
4. Skills still parse correctly (existing frontmatter parser handles new fields)
5. Default `response_mode` is `"markdown"` — no behavior change for existing users
6. Rubric dimensions are in Thai for Thai-market skills

## Test approach

- Parse each updated skill.md → verify frontmatter parses correctly
- Validate each input schema is valid JSON Schema
- Spot-check 3 representative skills in detail
