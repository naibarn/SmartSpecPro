# Article Writer Skills — Comprehensive Analysis

**Analysis Date:** 2026-03-11
**Status:** Complete
**Skills Analyzed:** 8 (Business, Education, General, Lifestyle, Marketing, Parenting, Creative Story, Documentary Script)

---

## Executive Summary

All 8 article writer skills follow a **consistent architectural pattern**:
- **Category:** `article_generation`
- **Execution:** `llm-only` (sent as system prompts)
- **Architecture:** JSON Schema (input) + custom UI Schema (ui.schema.json)
- **Thai Language:** Full bilingual support (English/Thai) with Thai headings and section titles
- **Output Modes:** Markdown or Plain Text (TTS-friendly)
- **Common Fields:** topic, language, length, word_count, output_format, reference_images, storytelling_style

**Key strength:** High consistency in structure, TTS-safe writing rules, and compliance controls across all skills.

---

## 1. Frontmatter Configuration Comparison

| Skill | Name | Slug | Category | Icon | Version | Auto-Trigger | Enabled | Priority |
|-------|------|------|----------|------|---------|--------------|---------|----------|
| Business | Business Article Writer | business-article-writer | article_generation | briefcase | 1.0.0 | ✗ | ✓ | 50 |
| Education | Education Article Writer | education-article-writer | article_generation | graduation-cap | 1.0.0 | ✗ | ✓ | 50 |
| General | General Article Writer | general-article-writer | article_generation | pen-tool | 1.0.0 | ✗ | ✓ | 50 |
| Lifestyle | Lifestyle Article Writer | lifestyle-article-writer | article_generation | heart | 1.0.0 | ✗ | ✓ | 50 |
| Marketing | Marketing Article Writer | marketing-article-writer | article_generation | megaphone | 1.0.0 | ✗ | ✓ | 50 |
| Parenting | Parenting Article Writer | parenting-article-writer | article_generation | (none) | (none) | (none) | ✓ | (none) |
| Creative Story | Creative Story Writer | creative-story-writer | article_generation | book-open | 1.0.0 | ✗ | ✓ | 50 |
| Documentary | Documentary Script Writer | documentary-script-writer | article_generation | video | 1.0.0 | ✗ | ✓ | 50 |

**Observations:**
- **Parenting skill** has minimal frontmatter (only slug, name, description, category, execution_mode, enabledByDefault) — unusual for article skills
- All others have full metadata (version, author, icon, priority)
- **No auto-trigger enabled** — these are manual selection skills, not auto-detected
- All non-parenting have priority 50 (same as default)
- All non-parenting have credit_multiplier 1.0

---

## 2. System Prompt Structure & Quality

### 2.1 Common Elements (All Skills)

**Opening instruction:**
```
You are a [role] writer. When you receive form inputs, write a complete [output type]
based on those inputs. Do NOT echo or repeat the input values back — always generate
the full [output type] content.
```

**Form input interpretation section:**
- Lists all expected input fields
- Defines behavior for each field (required, enum, special handling)
- **Consistent pattern:** "If not provided, [default behavior]"

**Output requirements section:**
- Format rules (Markdown vs Plain Text)
- Text-to-speech safe writing rules (symbols, numbers, abbreviations)
- Language expectations (English only or Thai only — never mixed)
- Length policy
- Tone and style guidance

**Storytelling structures section:**
- 14 narrative templates (HPSO, AIDA, PAS, etc.)
- Each described in 2-3 sentences
- **Critical instruction:** "Do NOT mention the structure name in the output"
- Structure adaptation per skill domain (e.g., Business = strategic, Education = pedagogical)

**Content Integrity & Legal Compliance section:**
- Brand & Trademark Protection (same across all)
- No Exaggerated/Misleading Claims
- Regulated Categories (different per skill)
- Originality & Attribution

**Output format examples:**
- Clear Markdown format template
- Clear Plain Text format template

### 2.2 Domain-Specific System Prompts

**Business Article Writer (197 lines)**
- **Tone:** Professional, confident, data-driven, results-oriented
- **Structure:** Executive Summary → Market Context → Problem/Opportunity → Strategic Analysis → Recommendations → Financial Impact → Risk Assessment → Implementation Roadmap → Conclusion
- **Unique elements:**
  - Financial figures should be written naturally ("10 million dollars" not "$10M")
  - Specifically targets "decision-makers"
  - Emphasizes "business impact" in outcomes
- **Regulated categories:** Financial products, Insurance/banking, Legal/compliance, Medical, Real estate, Employment/HR

**Education Article Writer (200 lines)**
- **Tone:** Approachable, pedagogical, accessible, encouraging
- **Structure:** Learning Objectives → Introduction → Core Concepts → How It Works → Practical Applications → Common Misconceptions → Practice Questions → Key Takeaways → Further Learning
- **Unique elements:**
  - Emphasizes examples, analogies, real-world connections
  - For Thai: includes "brief pronunciation guide or explanation on first use"
  - Common Misconceptions section (myth-busting)
  - Practice questions for learner engagement
- **Regulated categories:** Medical, Legal, Financial, History, Child development
- **Academic integrity:** Must distinguish between widely-accepted science vs. emerging research vs. opinion

**General Article Writer (198 lines)**
- **Tone:** Neutral, informative, appropriate for general audience
- **Structure:** Title → Introduction → Key Concepts → Details/Analysis → Practical Implications → Challenges → Future Outlook → Summary
- **Unique elements:**
  - "Most versatile" — no domain assumptions
  - Prefers bullet points and numbered lists
  - Emphasis on paragraph brevity
- **Most extensive Regulated Categories list** (health, pharmaceuticals, financial, legal, weight loss, cosmetics, real estate, alcohol/tobacco)

**Lifestyle Article Writer (199 lines)**
- **Tone:** Warm, approachable, encouraging, inspirational
- **Structure:** Title → Introduction/Hook → Why It Matters → Getting Started → Practical Tips → Daily Integration → Common Mistakes → Inspiration/Stories → Quick Reference → Closing Motivation
- **Unique elements:**
  - Vivid sensory descriptions
  - "Balance inspiration with real, grounded advice — avoid being overly idealistic"
  - Practical, immediately actionable tips
  - Emphasis on visual and emotional connection
- **Extensive Regulated Categories:** Health, Supplements, Fitness, Skincare, Mental health, Weight loss, Alcohol, Travel

**Marketing Article Writer (202 lines)**
- **Tone:** Persuasive, energetic, compelling, ROI-conscious
- **Structure:** Campaign Overview → Target Audience → Market Landscape → Brand Positioning → Channel Strategy → Content Direction → Execution Plan → KPIs → Budget & ROI
- **Unique elements:**
  - Targets "marketers and stakeholders"
  - "Specific, actionable recommendations — avoid vague generalities"
  - Marketing metrics spelled out (e.g., "click-through rate" not "CTR" on first use)
  - Focus on competitive advantage
- **Regulated Categories:** Health supplements, Pharmaceuticals, Financial, Insurance, Weight loss, Alcohol/tobacco, Cosmetics, Real estate, Legal

**Parenting Article Writer (109 lines — shortest)**
- **Tone:** Non-judgmental, empathetic, reassuring, calm
- **Structure:** Title → Quick Summary (3-5 bullets) → Who This Is For → What's Normal vs. Concerning → Practical Steps (numbered) → Common Mistakes/Myths → Checklist (optional) → Red Flags/When to Seek Care (optional) → FAQs (3-6 Q&As) → Closing Reassurance → References (optional)
- **Unique elements:**
  - **No storytelling structures** (unlike other article skills)
  - **Age-range adaptation** (months/years)
  - Multiple article_style options: how_to_guide, faq, checklist, myth_busting, development_overview, illness_care_overview
  - **Mandatory medical disclaimers** for health topics
  - "Red flags / When to seek medical care" section (highly emphasized)
  - **JSON output mode** available (standard_article or json response)
  - **Show references** option (for parenting credibility)
- **Regulated Categories:** Medical/health (most strict), Supplements, Fitness, Skincare, Mental health, Weight loss, Alcohol
- **Medical Safety (non-negotiable):**
  - Provide general educational info only
  - Do NOT diagnose
  - Do NOT provide medication dosing
  - Always include "When to seek medical care" section for health topics
  - Use calm, reassuring phrasing

**Creative Story Writer (127 lines)**
- **Tone:** Vivid, sensory, emotionally engaging, varies by genre/mood
- **Structure:** Title → The World → The Characters → The Spark → Rising Tension → Turning Point → Climax → Resolution → Closing
- **Unique elements:**
  - **No compliance/legal section** (unlike other skills) — only Copyright & IP Protection, Brand Protection, Sensitive Content, Misleading Framing
  - Specific genres: fiction, sci_fi, fantasy, romance, thriller, drama, fairy_tale, fable, adventure
  - Moods: lighthearted, dark, suspenseful, heartwarming, mysterious, dramatic
  - Target audiences: children, young_adult, adult
  - Include dialogue (boolean toggle)
  - "Show, don't tell" emphasis
- **Output format:** Numbered scene format with section titles
- **NO storytelling_style field** (unlike article skills) — uses genre/mood/audience instead

**Documentary Script Writer (146 lines)**
- **Tone:** Factually accurate + narratively engaging, varies by style (formal/conversational/dramatic)
- **Structure:** Title & Logline → Opening Hook → Background Context → Key Subjects → Central Question → Evidence & Discovery → Human Impact → Turning Point → Broader Implications → Closing Reflection
- **Unique elements:**
  - Documentary styles: investigative, observational, biographical, historical, nature, social_issue
  - Narrator voice options: formal, conversational, dramatic
  - **Interview segments** (fictional but realistic)
  - Emphasis on dates in full format, statistics as sentences
  - **Blend factual accuracy with narrative engagement**
  - "This is what distinguishes documentary writing from academic writing"
- **Content Integrity:** Much stricter on factual accuracy than other skills
  - Clearly distinguish between established facts, emerging research, narrative interpretation
  - NEVER fabricate quotes/interviews (unless marked dramatized)
  - NEVER present fabricated statistics as real
  - For controversial topics: present multiple viewpoints fairly
- **Regulated Categories:** Medical, Legal, Financial, Environmental, Historical, Living persons (defamation risk)

---

## 3. Input Schema & UI Schema Patterns

### 3.1 Input Schema (JSON Schema Draft 2020-12)

**Standard fields (all article skills except Parenting):**
- `topic` (string, required) — what to write about
- `language` (enum: en | th, default: en)
- `length` (enum: short | medium | long, default: medium)
- `word_count` (integer, optional, 120–8000 words)
- `storytelling_style` (enum: 14 options, optional for random selection)
- `output_format` (enum: markdown | plain_text, default: markdown)
- `reference_images` (array of URIs, optional)

**Parenting-specific fields:**
- `topic` (string, required)
- `language` (enum: en | th, default: en)
- `age_range` (object | null, optional) — allows unit (months/years), min, max
- `article_style` (enum: 6 styles)
- `length` (enum: short | medium | long)
- `word_count` (integer, optional, 120–8000)
- `include_checklist` (boolean, default: true)
- `include_red_flags` (boolean, default: true)
- `output_format` (enum: markdown | plain_text, default: plain_text)
- `response_mode` (enum: standard_article | json, default: standard_article)
- `show_references` (enum: yes | no, default: no)
- `reference_images` (array of URIs, optional)

**Creative Story Writer-specific:**
- `topic` (string, required)
- `language` (enum: en | th)
- `genre` (enum: 9 genres)
- `mood` (enum: 6 moods)
- `target_audience` (enum: children | young_adult | adult)
- `include_dialogue` (boolean, default: true)
- `length` (enum: short | medium | long)
- `word_count` (integer, optional)
- `reference_images` (array of URIs, optional)

**Documentary Script Writer-specific:**
- `topic` (string, required)
- `language` (enum: en | th)
- `documentary_style` (enum: 6 styles)
- `narrator_voice` (enum: formal | conversational | dramatic)
- `include_interview_segments` (boolean, default: true)
- `length` (enum: short | medium | long)
- `word_count` (integer, optional)
- `reference_images` (array of URIs, optional)

### 3.2 UI Schema (custom format for DynamicSkillForm)

**Common structure:**
```json
{
  "version": "1.0",
  "skillId": "...",
  "title": "...",
  "titleTh": "...",
  "description": "...",
  "descriptionTh": "...",
  "sections": [
    {
      "id": "...",
      "title": "...",
      "titleTh": "...",
      "icon": "...",
      "fields": [...]
    }
  ],
  "outputMapping": {...}
}
```

**All article writer skills have bilingual labels and help text:**
- `title` (English) + `titleTh` (Thai)
- `label` (English) + `labelTh` (Thai)
- `helpText` (English) + `helpTextTh` (Thai)
- `placeholder` (English) + `placeholderTh` (Thai)
- `description` (English) + `descriptionTh` (Thai)

**Parenting-specific UI enhancements:**
- `dependsOn` fields for age_min/age_max (only show when age_unit is selected)
- Icon: "sparkles" for age range section
- Settings icon for content options
- More sections (5 vs 2-3 for other articles)

---

## 4. Output Format Instructions

### 4.1 Markdown Format (Default for most)

```markdown
# [Article Title]

## [Section Heading]
[Section content — 2-4 sentences]

## [Section Heading]
[Section content — 2-4 sentences]

...
```

**Key rules:**
- Use `#` for title, `##` for headings, `###` for sub-headings
- NO numeric labels (`1.`, `Title:`)
- Normal paragraphs for body text
- All skills enforce proper Markdown hierarchy

### 4.2 Plain Text Format (TTS-friendly)

```
[Article Title]

[Section Heading]
[Section content — 2-4 sentences. No markdown symbols. Optimized for narration.]

[Section Heading]
[Section content]

...
```

**Key differences:**
- NO Markdown symbols (`#`, `##`, `*`, `-`)
- NO code fences
- Section titles as plain lines followed by blank line
- All content must be readable when read aloud

### 4.3 Story Format (Creative Story Writer)

```
Title: [Story Title]

1. [Scene/Section Title]
[Story content — 3-6 sentences]

2. [Scene/Section Title]
[Story content — 3-6 sentences]

...
```

**Key:** Numbered scenes instead of Markdown headings

### 4.4 Documentary Format (Documentary Script Writer)

```
Title: [Documentary Title]
Logline: [One-sentence summary]

1. [Segment Title]
[Narrator]: [Narration text — 3-6 sentences]
[Optional interview quote]

2. [Segment Title]
[Narrator]: [Narration text — 3-6 sentences]

...
```

**Key:** Includes logline, narrator label, optional interview segments

### 4.5 JSON Format (Parenting Only)

```json
{
  "title": "string",
  "language": "en" | "th",
  "age_range": { "unit": "months|years", "min": int, "max": int } | null,
  "sections": ["section_title", "section_title", ...],
  "body": {
    "section_title": "section_content",
    ...
  },
  "disclaimer": "string",
  "references": ["ref1", "ref2"] // only if show_references: yes
}
```

---

## 5. Text-to-Speech Safe Writing Rules (Consistent Across All)

### Symbol Replacements (MANDATORY)

| Symbol | English | Thai | Example |
|--------|---------|------|---------|
| `/` | "or" | "หรือ" | "3 to 5 items" not "3-5 items" |
| `&` | "and" | "และ" | "bacon and eggs" not "bacon & eggs" |
| `+` | "plus" / "and" | "บวก" / "และ" | context-dependent |
| `%` | "percent" | "เปอร์เซ็นต์" | "30 percent" not "30%" |
| `-` (ranges) | "to" | "ถึง" | "20 to 30 days" not "20-30 days" |
| `→` | "leads to" / "then" | — | Avoid — use natural phrasing |
| `•`, `·` | Expand to full text | — | Never use as bullet markers in TTS |

### Numeric Rules

- **Ranges:** "three to five days" not "3-5 days"
- **Ranges (scientific):** "three to five percent" not "3-5%"
- **Large numbers:** "10 million dollars" not "$10M"
- **Dates:** "March 15, 2024" or "15 มีนาคม 2567" (full words, not 3/15/24)
- **Abbreviations:** Spell out on first use, then use abbreviation if it's a common acronym

### Grammar Rules

- Keep punctuation simple and readable
- Avoid dense symbol-heavy formatting
- Use em dashes sparingly (can be hard to parse)
- For dialogue: use simple quotation marks with clear attribution

### Language-Specific Rules

**Thai (Education skill only):**
- For scientific/technical terms, include "brief pronunciation guide or explanation on first use"

---

## 6. Thai Language Handling & Bilingual Support

### All Skills Support Full Thai Output

**Approach:** Complete translation, not code-switching
- `language: th` → write everything in Thai, including headings and section titles
- `language: en` → write everything in English
- If topic is in different language than output language: translate/adapt naturally

### Thai Content Specifics

**UI Schema bilingual support:**
- Every label, help text, placeholder, and title has Thai version (`labelTh`, `helpTextTh`, etc.)
- Thai translations are complete and professionally localized

**Parenting skill (Thai specific):**
- Medical disclaimer in Thai: "ข้อมูลนี้ไม่ใช่คำแนะนำทางการแพทย์ ควรปรึกษาแพทย์หรือผู้เชี่ยวชาญ"
- FDA disclaimer: "ควรกินอาหารหลากหลายครบ 5 หมู่ ในสัดส่วนที่เหมาะสมเป็นประจำ ผลิตภัณฑ์นี้ไม่มีผลในการป้องกันหรือรักษาโรค อ่านคำเตือนในฉลากก่อนบริโภค" (per Thai FDA ประกาศ สธ. ฉบับที่ 293)

**General skill (Thai specific):**
- Alcohol disclaimer: "การดื่มสุราทำให้ความสามารถในการขับขี่ยานพาหนะลดลง ห้ามจำหน่ายสุราแก่บุคคลซึ่งมีอายุต่ำกว่า 20 ปีบริบูรณ์" (per Thai law)
- Financial disclaimer: "การลงทุนมีความเสี่ยง ผู้ลงทุนควรทำความเข้าใจลักษณะสินค้า เงื่อนไขผลตอบแทน และความเสี่ยง ก่อนตัดสินใจลงทุน" (per ก.ล.ต.)

**Lifestyle skill (Thai specific):**
- Alcohol: "การดื่มสุราทำให้ความสามารถในการขับขี่ยานพาหนะลดลง ห้ามจำหน่ายสุราแก่บุคคลซึ่งมีอายุต่ำกว่า 20 ปีบริบูรณ์" (per พ.ร.บ.ควบคุมเครื่องดื่มแอลกอฮอล์ พ.ศ. 2551)

---

## 7. Storytelling Structures (14 Templates)

All article skills (except Parenting, Creative Story, Documentary) support these 14 narrative templates:

1. **HPSO** — Hook, Problem, Solution, Outcome
   - Open with attention-grabbing hook
   - Describe problem clearly
   - Introduce solution with reasoning
   - Share outcome/impact
   - **Domain adaptations:**
     - Business: Strategic business challenge hook
     - Education: Learning curiosity hook
     - Lifestyle: Lifestyle moment hook
     - Marketing: Marketing opportunity hook

2. **AIDA** — Attention, Interest, Desire, Action
   - Grab attention with compelling fact/moment
   - Build interest with details
   - Create desire by showing improved situation
   - End with gentle action suggestion
   - **Business variant:** End with stakeholder call to action

3. **PAS** — Problem, Agitate, Solution
   - Start with relatable problem
   - Agitate by describing frustration/impact
   - Present solution with insights
   - **Business variant:** Strategic solution with implementation
   - **Education variant:** Clear explanation and examples

4. **Hook-Insight-Tip**
   - Engaging hook
   - Key insight or surprising perspective
   - Actionable tips reader can apply

5. **Before-After-Bridge**
   - Paint "before" (challenge, status quo)
   - Show "after" (improved situation)
   - Bridge with what made transformation possible
   - **Business variant:** Show improved market position
   - **Education variant:** Show clearer understanding

6. **Story Flow**
   - Hook with compelling opening moment
   - Share backstory and context
   - Build to turning point/discovery
   - Reflect on significance/value
   - Close with forward-looking takeaway

7. **My Why-My Way-Your Turn**
   - Start with personal motivation/market driver
   - Share specific approach/method
   - Invite reader to adapt for their context

8. **Complain-Recall-Press-Gentle**
   - Open with relatable frustration/pain point
   - Recall background/history or what used to work
   - Press deeper into root cause
   - Close constructively/optimistically
   - **Business variant:** "Gentle" = strategic perspective

9. **FAB** — Features, Advantages, Benefits
   - Present key features of solution/approach
   - Explain competitive advantages/benefits
   - Close with tangible real-world benefits
   - **Business variant:** Revenue impact, efficiency gains
   - **Lifestyle variant:** How it improves daily life/wellbeing

10. **STAR** — Situation, Task, Action, Result
    - Set situation and context
    - Describe task or challenge
    - Walk through actions and decisions taken
    - Share results and outcomes
    - **Business variant:** Measurable business results
    - **Education variant:** Learning outcomes and capability

11. **SCR** — Situation, Complication, Resolution
    - Describe current situation
    - Introduce complication (market shift, challenge, bottleneck)
    - Present strategic resolution with details
    - **Business variant:** Competitive threat or market shift

12. **Inverted Pyramid**
    - Lead with most critical insight/recommendation
    - Follow with supporting details and analysis
    - End with background and context
    - **Business variant:** Lead with business insight
    - **Education variant:** Lead with key takeaway

13. **Listicle**
    - Open with brief intro framing topic
    - Present numbered strategies/tips/items
    - Include rationale for each
    - Wrap with key takeaways/summary
    - **Business variant:** Numbered strategies with ROI
    - **Lifestyle variant:** Numbered tips with vivid descriptions

14. **QA Flow** — Question, Explore, Answer, Takeaway
    - Open with thought-provoking question
    - Explore through evidence/analysis/examples
    - Arrive at clear answer
    - Close with practical takeaway
    - **Business variant:** Backed by market data

### Key Instruction (All Skills)
> "Do NOT mention the structure name in the output — just follow it naturally."

This ensures the narrative flows naturally without meta-commentary about the structure being used.

---

## 8. Content Integrity & Legal Compliance

### 8.1 Universal Rules (All Skills)

#### Brand & Trademark Protection
- NEVER mention specific brand names (unless user provides their own)
- NEVER compare with competitor brands by name
- NEVER reference trademarked names, logos, slogans, or copyrighted product names
- Use generic terms: "leading brands", "popular options", "industry leaders"
- NEVER use competitor logos, slogans, or taglines
- **No positive mentions by brand name either** — "as good as [Brand]" is prohibited

#### No Exaggerated/Misleading Claims
- NEVER use superlatives without qualification ("the best" needs data backing)
- NEVER promise specific outcomes ("you WILL increase by X%")
- Use hedging: "may help", "has been associated with", "potential to"
- NEVER fabricate statistics or expert quotes
- Note estimates as illustrative

#### Originality & Attribution
- NEVER reproduce copyrighted text verbatim
- Attribute frameworks: "According to Lean methodology...", "Porter's Five Forces suggests..."
- Generated content must be original, not rephrased from published sources

### 8.2 Regulated Categories (Domain-Specific)

#### Business Article Writer

| Category | Prohibited Claims | Required Disclaimer |
|----------|-------------------|-------------------|
| Financial products / investments | "guaranteed returns", "risk-free", "certain profit" | "Investments carry risk. Past performance does not guarantee future results." |
| Insurance / banking | Misleading coverage or rate claims | "Terms and conditions apply. Read the relevant documents carefully." |
| Legal / compliance | Specific legal guidance, jurisdiction-specific rulings | "This is general information, not legal advice. Consult a qualified professional." |
| Medical / healthcare | "cures", "100% effective", unverified clinical claims | "Consult healthcare professionals for medical decisions." |
| Real estate / property | "guaranteed appreciation", misleading valuation | "Market conditions vary. Prices subject to change." |
| Employment / HR | Discriminatory criteria, salary guarantees | "Compensation varies by role, experience, and location." |

#### Education Article Writer

| Category | Requirements |
|----------|-------------|
| Medical/health education | "This is educational content, not medical advice." |
| Legal/civic education | "Laws vary by jurisdiction. This is general information." |
| Financial literacy | "This is educational, not financial advice. Consult a qualified advisor." |
| History (sensitive events) | Present facts respectfully; note multiple perspectives where relevant |
| Child development / parenting | "Every child develops differently. Consult pediatric professionals for concerns." |

**Additional:** NEVER present outdated or debunked information (e.g., learning styles myth). Clearly distinguish between widely-accepted science, emerging research, and popular opinion.

#### General Article Writer (MOST EXTENSIVE)

Covers: Health/nutrition, Pharmaceuticals, Financial, Legal, Weight loss, Cosmetics, Real estate, Alcohol/tobacco
With specific Thai law citations and disclaimers.

#### Lifestyle Article Writer

Extensive regulated categories: Health, Supplements, Fitness, Skincare, Mental health, Weight loss, Alcohol, Travel

**Alcohol (Thai-specific):** Per พ.ร.บ.ควบคุมเครื่องดื่มแอลกอฮอล์ พ.ศ. 2551
- "Drinking alcohol impairs driving ability. Do not sell to persons under 20 years of age."

#### Marketing Article Writer

Includes all general article categories plus Medical devices (เครื่องมือแพทย์)

#### Parenting Article Writer (MOST STRICT)

Health-related topics are paramount:
- "Every child develops differently. Consult pediatric professionals for concerns."
- **Medical safety (non-negotiable):**
  - Provide general educational info ONLY
  - Do NOT diagnose
  - Do NOT provide medication dosing
  - ALWAYS include "When to seek medical care" section for health topics
  - Use calm, reassuring phrasing

#### Creative Story Writer (MINIMAL COMPLIANCE)

Only covers:
- Copyright & IP Protection (no copyrighted characters/plots/dialogue)
- Brand & Trademark Protection
- Sensitive Content Boundaries (no graphic violence toward children, explicit content, hate speech, self-harm)
- No Misleading Framing (health/legal/financial scenarios not presented as advice)

#### Documentary Script Writer

| Category | Requirements |
|----------|-------------|
| Medical / health documentaries | "This documentary is for informational purposes. Consult healthcare professionals for medical decisions." |
| Legal / crime documentaries | "Legal proceedings may be ongoing. Presumption of innocence applies." |
| Financial / economic topics | "This is not financial advice. Consult qualified advisors." |
| Environmental claims | Distinguish between scientific consensus and advocacy positions |
| Historical events | Note when using dramatic recreation vs. verified historical accounts |
| Living persons | Avoid defamatory characterizations; present documented facts |

**Factual Accuracy (stricter than other skills):**
- NEVER fabricate quotes, interviews, or expert statements
- NEVER present fabricated statistics as real data
- NEVER name specific brands in negative contexts without user request
- For investigative/exposé: use "[Company Name]" placeholders
- Clearly distinguish between established facts, emerging research, and narrative interpretation
- For controversial topics: present multiple credible viewpoints fairly

---

## 9. Reference Images Feature

### All Skills Support Reference Images

**Input:** Array of image URLs
**Processing:** LLM analyzes images and incorporates visual elements into the article

**Domain-specific guidance:**

| Skill | Guidance |
|-------|----------|
| Business | Analyze charts, diagrams, products, infographics; incorporate business context naturally |
| Education | Analyze diagrams, charts, illustrations, photos; describe and explain visual content |
| General | Analyze images; align article with content, context, and themes shown |
| Lifestyle | Analyze lifestyle scenes, moods, products, activities; capture visual atmosphere |
| Marketing | Analyze campaigns, ads, branding materials, product photos; reference visual elements and brand aesthetics |
| Parenting | Analyze images; write article to align with and describe content shown |
| Creative Story | Weave visual elements (settings, characters, objects, atmosphere) into narrative naturally |
| Documentary | Incorporate visual context (locations, people, events, environments) into script |

**Implementation note:** Reference images are optional but enhance relevance and visual coherence of output.

---

## 10. Parenting Skill — Unique Architecture

### 10.1 Article Style Options (6)

Instead of 14 storytelling structures, parenting uses:
1. `how_to_guide` — Step-by-step guidance (default)
2. `faq` — Frequently Asked Questions (Q&A format)
3. `checklist` — Practical checklist format
4. `myth_busting` — Debunk myths and misconceptions
5. `development_overview` — Overview of developmental milestones
6. `illness_care_overview` — Overview of symptoms and care

### 10.2 Age Range Targeting

```json
{
  "unit": "months" | "years",
  "min": integer,
  "max": integer
}
```

- Optional (omit for general advice)
- If omitted, article includes "Age notes" explaining how advice differs by age
- Enables tailoring to specific developmental stage

### 10.3 Medical Safety Features

- `include_checklist` — Practical checklist section (default: true)
- `include_red_flags` — "Red flags / When to seek medical care" section (default: true, strongly recommended)
- `show_references` — Append non-clickable references section (default: no)

### 10.4 Response Modes

1. **standard_article** (default) — Full human-readable article
   - Returns Markdown or Plain Text
   - Includes all sections based on options
2. **json** — Structured JSON object only
   - No surrounding commentary
   - Contains title, language, age_range, sections, body, disclaimer, references (if enabled)

### 10.5 Output Structure

**Standard Article Structure:**
1. Title
2. Quick Summary (3–5 bullets)
3. Who This Is For (include age range if provided)
4. What's Normal vs. Concerning
5. Practical Steps/Tips (numbered)
6. Common Mistakes & Myths
7. Checklist (optional)
8. Red Flags / When to Seek Medical Care (optional)
9. Frequently Asked Questions (3–6)
10. Closing Reassurance + Next Steps
11. References (optional)

---

## 11. Strengths & Weaknesses by Skill

### Business Article Writer

**Strengths:**
- Comprehensive regulatory guidance (6 categories with specific disclaimers)
- Clear business-focused tone and structure
- Financial language rules (spell out large numbers)
- Strong emphasis on decision-maker audience

**Weaknesses:**
- No age-range or demographic targeting
- No JSON output mode
- Less granular style options (only storytelling structures)

### Education Article Writer

**Strengths:**
- Excellent pedagogical focus (learning objectives, practice questions)
- Thai-specific pronunciation guidance
- Multiple perspectives on debated topics
- Clear academic integrity standards

**Weaknesses:**
- Heavy emphasis on not promoting brands (limiting for educational tools discussion)
- No flexibility in output structure (fixed section types)

### General Article Writer

**Strengths:**
- Most extensive regulated categories list
- Versatile (no domain assumptions)
- Clear preference for bullet points and brevity
- Comprehensive disclaimers for all product types

**Weaknesses:**
- Least personality/tone in system prompt
- May be too general for specialized domains

### Lifestyle Article Writer

**Strengths:**
- Warm, encouraging tone with vivid descriptions
- Strong health/wellness regulation compliance
- Travel advice safety net
- Emphasis on practical, immediately actionable tips

**Weaknesses:**
- Extensive regulated categories may limit what can be written
- Alcohol and supplement restrictions may be over-cautious for some topics

### Marketing Article Writer

**Strengths:**
- Persuasive tone with clear ROI focus
- Detailed marketing structure (campaigns, channels, KPIs, budget)
- Specific guidance on spelling out metrics (CTR not "CTR")
- Strong competitive analysis guidance

**Weaknesses:**
- Fewer regulated category disclaimers than General/Lifestyle
- Limited flexibility in article structure

### Parenting Article Writer

**Strengths:**
- Specialized medical safety (paramount)
- Age-range targeting with development-aware content
- JSON output mode for structured data
- Red flags section (highly emphasized)
- Multiple article styles
- Show references option for credibility

**Weaknesses:**
- Minimal frontmatter metadata (unusual)
- Most complex input schema
- No storytelling structures (only styles)
- Plain text default (unusual for article skills)

### Creative Story Writer

**Strengths:**
- Vivid sensory and emotional guidance
- Multiple genre and mood options
- Target audience differentiation (children/YA/adult)
- Minimal compliance restrictions (appropriate for fiction)
- Dialogue toggle

**Weaknesses:**
- No storytelling structures (uses genre/mood instead)
- Limited regulated categories guidance (only copyright/trademark/sensitivity)
- Output format is numbered scenes (different from other skills)

### Documentary Script Writer

**Strengths:**
- Strict factual accuracy requirements (distinguishes from other skills)
- Documentary styles provide clear narrative approaches
- Narrator voice options
- Interview segments add realism
- Comprehensive factual integrity guidance

**Weaknesses:**
- Most complex system prompt (146 lines)
- Heavy emphasis on NOT fabricating quotes (limits creative freedom)
- Investigative style may require placeholder brand names
- No storytelling structures

---

## 12. Schema Architecture & Implementation Insights

### 12.1 Standard UI Schema Pattern

All skills follow this structure:
```
sections:
  - article (topic, reference_images, language)
  - style (storytelling_style, length, word_count, output_format)
  [additional sections for skill-specific options]

outputMapping:
  [maps field IDs to form keys sent to LLM]
```

### 12.2 Bilingual Implementation

**All labels are dual-language:**
- `label` (English) + `labelTh` (Thai)
- Same for help text, placeholders, descriptions
- Enables single form to serve both English and Thai users

### 12.3 Field Dependencies

Only Parenting uses `dependsOn`:
```json
{
  "dependsOn": { "field": "age_unit", "notEmpty": true }
}
```
Shows age_min/age_max only when age_unit is selected.

**Opportunity:** Other skills could use similar patterns (e.g., show word_count only if custom length desired).

### 12.4 Dynamic Field Types

Used across skills:
- `textarea` — Multi-line text input (topics, descriptions)
- `text` — Single-line text
- `select` — Dropdown (language, length, style)
- `number` — Numeric input (word_count)
- `images` — Image upload (reference_images)
- `boolean` — Checkbox (include_checklist, include_dialogue)

### 12.5 Validation Ranges

**Word count limits (consistent):**
- Minimum: 120 words
- Maximum: 8000 words
- Helps prevent absurdly small/large outputs

---

## 13. Key Findings & Recommendations

### 13.1 Consistency Strengths

1. **TTS-safe writing** — All skills enforce symbol replacements and spoken-language numbers
2. **Bilingual support** — All have complete Thai translations in UI schemas
3. **Content compliance** — Strong brand protection and misleading claims prevention
4. **Clear structure** — Predictable Markdown/Plain Text outputs suitable for presentations
5. **Reference images** — All support visual input to guide content generation

### 13.2 Unique Differentiators

1. **Parenting:** Age-range targeting, JSON output mode, medical safety paramount
2. **Creative Story:** Genre/mood focus, no storytelling structures, minimal compliance
3. **Documentary:** Factual accuracy, interview segments, narrator voice options
4. **Marketing:** ROI-focused structure, competitive advantage emphasis
5. **Education:** Pedagogical tone, practice questions, academic integrity

### 13.3 Potential Improvements

1. **Add field dependencies** to other skills (e.g., show storytelling_style as expand/collapse)
2. **Output schema** — Add for skills that generate structured data (like Parenting has JSON mode)
3. **Reference documents** — Consider supporting reference documents (text files) in addition to images
4. **Content warnings** — Documentary already uses these; extend to other skills where appropriate
5. **Consistency in defaults:** Parenting uses `plain_text` default; consider why others use `markdown`
6. **Age-range targeting** — Parenting's model could apply to Education and Lifestyle
7. **Regulated category expandability** — Make it easier to add new regulated categories as laws evolve

### 13.4 Implementation Quality Assessment

**System Prompt Quality:** 8.5/10
- Comprehensive and clear
- Domain-specific adaptations are well-thought-out
- Compliance guidance is detailed
- TTS rules are explicit and enforceable

**Schema Quality:** 8/10
- Consistent input schema across skills
- Bilingual UI schemas are professional
- Field dependencies minimal but functional
- Validation ranges are sensible

**Coverage Quality:** 9/10
- All major article types covered
- Domain-specific compliance is extensive
- Thai language support is complete
- Output formats are flexible (Markdown, Plain Text, JSON)

---

## 14. File Locations Reference

**Skill definitions:**
- Business: `/home/dev/projects/SmartSpecPro/apps/web/skills/business-article-writer/`
- Education: `/home/dev/projects/SmartSpecPro/apps/web/skills/education-article-writer/`
- General: `/home/dev/projects/SmartSpecPro/apps/web/skills/general-article-writer/`
- Lifestyle: `/home/dev/projects/SmartSpecPro/apps/web/skills/lifestyle-article-writer/`
- Marketing: `/home/dev/projects/SmartSpecPro/apps/web/skills/marketing-article-writer/`
- Parenting: `/home/dev/projects/SmartSpecPro/apps/web/skills/parenting-article-writer/`
- Creative Story: `/home/dev/projects/SmartSpecPro/apps/web/skills/creative-story-writer/`
- Documentary: `/home/dev/projects/SmartSpecPro/apps/web/skills/documentary-script-writer/`

**Schema locations:**
Each skill folder contains `schemas/input.schema.json` and `schemas/ui.schema.json`

---

## Appendix: Storytelling Structure Summary Table

| Structure | Hook | Middle | Close | Best For |
|-----------|------|--------|-------|----------|
| HPSO | Attention-grab | Problem + Solution | Outcome/Impact | Business, strategic |
| AIDA | Surprising fact | Interest + Desire | Call to action | Marketing, persuasive |
| PAS | Relatable problem | Agitation | Solution/Strategy | Educational, problem-solving |
| Hook-Insight-Tip | Engaging opening | Key insight | Actionable tips | Quick advice, how-to |
| Before-After | "Before" challenge | Transformation | Bridge explanation | Change/improvement stories |
| Story Flow | Compelling moment | Backstory + Turn point | Reflection | Narrative, personal stories |
| My Why-My Way-Your Turn | Personal motivation | Specific approach | Invites adaptation | Shared experiences |
| Complain-Recall-Press-Gentle | Relatable frustration | History + Root cause | Constructive outlook | Empathetic, problem-focused |
| FAB | Features | Advantages | Benefits | Product/approach focused |
| STAR | Situation + Task | Actions taken | Results/Outcomes | Case studies, evidence |
| SCR | Current situation | Complication | Strategic resolution | Challenge-driven |
| Inverted Pyramid | Key insight | Supporting details | Background | Data-heavy, importance-first |
| Listicle | Topic intro | Numbered items/tips | Summary | Quick reference, lists |
| QA Flow | Thought question | Exploration | Clear answer + takeaway | Inquiry-based learning |

---

**End of Analysis**
