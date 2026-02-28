# Specification: AI Presentation Layout Auto-Generation (Gamma-Style)

**Feature ID:** 025
**Status:** Draft
**Author:** SmartSpecPro Team
**Last Updated:** 2026-02-26
**Schema Version:** v5.1

---

## Table of Contents

1. [Overview & User Story](#1-overview--user-story)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [Media Generation Architecture: Shared Building Blocks](#3-media-generation-architecture-shared-building-blocks)
4. [AI Presentation Pipeline: 6-Phase Orchestration](#4-ai-presentation-pipeline-6-phase-orchestration)
5. [Slide Style Presets](#5-slide-style-presets)
6. [Predefined Layout Templates](#6-predefined-layout-templates)
7. [Technical Implementation](#7-technical-implementation)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Security Considerations](#9-security-considerations)
10. [Testing Strategy](#10-testing-strategy)
11. [Feature Flag & Rollout](#11-feature-flag--rollout)
12. [Development Phasing](#12-development-phasing)
13. [Acceptance Criteria](#13-acceptance-criteria)

---

## 1. Overview & User Story

### User Story

> **As a** presentation author,
> **I want to** type a topic, pick an article-writing skill (e.g. "parenting articles", "restaurant business"), and have the system write a full article, split it across slides, generate matching images, and compile a polished deck,
> **So that** I get a complete, content-rich presentation — not just empty slide layouts — without writing anything myself.

### Problem Statement

Users face the "blank canvas" problem when starting a new presentation. More importantly, they also face the "blank content" problem — even with a layout, writing quality slide content is hard.

Existing AI presentation tools (Gamma, Tome) try to solve both at once, but produce generic content. SmartSpecPro's skill system already has domain-expert skills (parenting content, restaurant marketing, textile marketing, etc.) that produce high-quality, niche-appropriate articles. By combining these **content skills** with an **image prompt skill** and a **layout engine**, we can generate presentations that are both structurally sound and content-rich in the user's chosen domain.

### Solution Summary

A **"✨ Draft with AI"** feature where:

1. **User selects 2 skills** in the modal:
   - **Article Skill** — domain-specific content writer (e.g. "parenting articles", "restaurant business", "textile marketing")
   - **Image Prompt Skill** — visual style optimizer (e.g. `image-creator`, `smart-landscape-designer`)
2. **6-phase automated pipeline** orchestrates existing building blocks:
   - Phase 1: Article Skill writes a full article from the topic
   - Phase 2: LLM splits the article into slide-sized chunks
   - Phase 3: Image Prompt Skill enhances image keywords per slide
   - Phase 4: Image generation per slide (existing `mediaGenerationService`)
   - Phase 5: SVG + Layout compilation per slide
   - Phase 6: Insert slides into deck
3. **No new generation endpoints** — reuses the same `enhancePromptService` and `mediaGenerationService` that Media Studio, Chat, and Virtual Workflow use.

---

## 2. Goals & Non-Goals

### In Scope (MVP)

- **2-skill selection modal** — user picks article skill + image prompt skill before generation.
- Full article generation via the selected article skill (existing `executeCustomSkill` backend).
- LLM-based article-to-slides splitting (structured JSON output).
- Per-slide image prompt enhancement via the selected image prompt skill (existing `enhancePromptService`).
- Per-slide image generation via existing `mediaGenerationService.generateImageAsync()`.
- 4 hardcoded layout templates: `hero_center`, `split_left_image`, `split_right_image`, `feature_boxes_right`.
- **Slide Style Presets** — user selects a visual style (color palette, font family, header/footer) that applies to all generated slides.
- SVG graphic selection from the existing `SVG_GRAPHICS` catalog.
- Credit deduction for all skill calls, LLM calls, and image generation calls.
- Audit logging for all phases.
- Feature flag for gradual rollout.

### Out of Scope (Future)

- WebSocket streaming progress (fake progress timer in MVP).
- Custom user-defined layout templates.
- Re-generating a single slide in isolation.
- User-created custom style presets (MVP includes built-in presets only).
- More than 10 slides per call.
- Animated transitions.
- Changes to Media Studio, Chat, or Virtual Workflow flows.

---

## 3. Media Generation Architecture: Shared Building Blocks

### 3.1 The Three Building Blocks

SmartSpecPro's media generation consists of three reusable backend functions. Each surface (Media Studio, Chat, Workflow, AI Presentation) orchestrates them differently.

#### Building Block A: Skill Content/Prompt Generation

| Backend function | tRPC endpoint | Purpose |
|-----------------|---------------|---------|
| `enhancePromptService.enhance()` | `skills.enhancePrompt` | Prompt enhancement skills (e.g. `image-creator`) — optimizes raw text into generation-ready prompt |
| `executeCustomSkillService.execute()` | `skills.executeCustomSkill` | Custom/domain skills (e.g. article writers, viral content creators) — produces structured text output |

#### Building Block B: Media Generation

| Backend function | tRPC endpoint | Purpose |
|-----------------|---------------|---------|
| `mediaGenerationService.generateImageAsync()` | `media.generateImageAsync` | Image generation → Kie.ai / Fal.ai / BytePlus / etc. |
| `mediaGenerationService.generateVideoAsync()` | `media.generateVideoAsync` | Video generation → same providers |

#### Building Block C: LLM Structured Output

| Backend function | Purpose |
|-----------------|---------|
| Direct LLM call (internal) | Structured JSON output for data transformation tasks (e.g. article → slides split) |

### 3.2 How Each Surface Orchestrates

```
┌──────────────────────────────────────────────────────────────────────┐
│ MEDIA STUDIO — User controls each step manually                     │
│                                                                      │
│  [User selects skill + clicks "Auto Prompt"]                        │
│  → Building Block A (skill enhance)                                 │
│  → Prompt displayed in textarea (user can edit)                     │
│  [User clicks "Generate"]                                           │
│  → Building Block B (media generate)                                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ CHAT — Bundled in conversation flow                                 │
│                                                                      │
│  [User types "create an image of a cat"]                            │
│  → chat.executeSkill (internally: A → B in one call)                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ VIRTUAL WORKFLOW — User chains nodes visually                       │
│                                                                      │
│  [skill node] → Building Block A → text output                     │
│       ↓ {{expression}}                                              │
│  [generate_image node] → Building Block B → imageUrl               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ AI PRESENTATION (NEW) — System orchestrates 6 phases automatically  │
│                                                                      │
│  Phase 1: Building Block A (article skill) → full article           │
│  Phase 2: Building Block C (LLM split) → slide chunks              │
│  Phase 3: Building Block A (image skill) → enhanced prompts         │
│  Phase 4: Building Block B (media generate) → images                │
│  Phase 5: LayoutEngine → canvas JSON                                │
│  Phase 6: presentationService → insert slides                       │
│                                                                      │
│  User pre-selects WHICH skills to use. System chains them.          │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.3 No New Endpoints or Services

AI Presentation calls existing backend functions directly. Nothing changes for other surfaces.

---

## 4. AI Presentation Pipeline: 6-Phase Orchestration

### 4.1 Pipeline Overview

```
User Input:
  ├── topic: "วิธีปลูกผักออร์แกนิคกินเองที่บ้าน"
  ├── articleSkillId: "organic-gardening-writer"     ← user selects
  ├── imageSkillId: "smart-landscape-designer"       ← user selects
  ├── imageModel: "flux-pro" (optional)
  ├── numSlides: 5
  └── language: "auto"

    │
    ▼
┌────────────────────────────────────────────────────────────────────┐
│  PHASE 1: Article Generation (Article Skill)                       │
│  ════════════════════════════════════════════                       │
│                                                                    │
│  Call: executeCustomSkillService.execute({                         │
│    skillId: "organic-gardening-writer",                            │
│    userInputs: { topic: "วิธีปลูกผักออร์แกนิค..." },             │
│    model: defaultLlmModel,                                         │
│  })                                                                │
│                                                                    │
│  The article skill's skill.md defines:                             │
│  - Writing style and tone for this domain                          │
│  - Typical article structure                                       │
│  - Domain expertise context                                        │
│                                                                    │
│  Output: Full article text (500-2000 words)                        │
│  Example:                                                          │
│    "การปลูกผักออร์แกนิคที่บ้านไม่ยากอย่างที่คิด...               │
│     1. เตรียมดิน: เริ่มจากดินที่ดี...                              │
│     2. เลือกผักที่เหมาะ: ผักที่ปลูกง่าย...                        │
│     3. การรดน้ำ: ความถี่ที่เหมาะสม...                              │
│     4. การดูแลศัตรูพืช: วิธีธรรมชาติ..."                          │
│                                                                    │
│  Credits: Deducted per skill pricing (LLM tokens)                  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  PHASE 2: Article → Slide Splitting (LLM Structured Output)       │
│  ═══════════════════════════════════════════════════════           │
│                                                                    │
│  Direct LLM call (not a skill) with structured JSON output.        │
│  Model: claude-sonnet-4-6                                          │
│                                                                    │
│  System prompt:                                                    │
│    "You are a presentation designer. Split this article into       │
│     {numSlides} slides. For each slide, extract:                   │
│     - title (short, punchy headline)                               │
│     - body (1-4 bullet points from the article content)            │
│     - imagePromptKeywords (2-4 English keywords)                   │
│     - graphicCategory (from SVG categories)                        │
│     - layoutTemplateId (from layout options)                       │
│     Use hero_center for slide 1. Vary layouts for others."         │
│                                                                    │
│  Input: The full article text from Phase 1                         │
│  Output: SlideData[] (structured JSON)                             │
│                                                                    │
│  This phase READS the article — it doesn't invent content.         │
│  Each slide's body comes directly from the article text.           │
│                                                                    │
│  Credits: Standard LLM token pricing                               │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  PHASE 3: Per-Slide Image Prompt Enhancement (Image Skill)         │
│  ═════════════════════════════════════════════════════════         │
│                                                                    │
│  For each slide (concurrent, max 3 at a time):                     │
│                                                                    │
│  Call: enhancePromptService.enhance({                              │
│    skillId: "smart-landscape-designer",   ← user-selected skill    │
│    userInput: slide.imagePromptKeywords,  ← from Phase 2           │
│    maxPromptLength: 500,                                           │
│    aspectRatio: "16:9",                                            │
│    language: "en",                                                 │
│  })                                                                │
│                                                                    │
│  SAME function as Media Studio's "Auto Prompt" button.             │
│  Skill determines the visual style of images.                      │
│                                                                    │
│  Output: optimizedPrompt per slide                                 │
│  Fallback: if skill fails, use raw imagePromptKeywords             │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  PHASE 4: Per-Slide Image Generation (Media API)                   │
│  ═══════════════════════════════════════════════                   │
│                                                                    │
│  For each slide (concurrent, max 3 at a time):                     │
│                                                                    │
│  Call: mediaGenerationService.generateImageAsync({                 │
│    prompt: enhancedPrompt,       ← from Phase 3                   │
│    model: selectedImageModel,    ← user-selected or default       │
│    aspectRatio: "16:9",                                            │
│  })                                                                │
│                                                                    │
│  SAME function as Media Studio's "Generate" button.                │
│  SAME function as Virtual Workflow's generate_image node.          │
│                                                                    │
│  Output: imageUrl per slide                                        │
│  Fallback: if fails/timeout >15s → imageUrl = null (placeholder)  │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  PHASE 5: SVG Selection + Layout Compilation                       │
│  ═══════════════════════════════════════════                       │
│                                                                    │
│  For each slide:                                                   │
│  a. Select random SVG from graphicCategory → svgGraphic            │
│  b. LayoutEngine.generateSlide(slideData, imageUrl, svgGraphic)    │
│     → PresentationSlideContent (validated against Zod schema)      │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
┌────────────────────────────────────────────────────────────────────┐
│  PHASE 6: Deck Insertion                                           │
│  ═══════════════════════════                                       │
│                                                                    │
│  Sequential, version-safe:                                         │
│  for (i = 0; i < slides.length; i++) {                             │
│    addSlideToDeck(deckId, slideContent, expectedVersion + i)       │
│  }                                                                 │
└────────────────────────────────────────────────────────────────────┘
```

### 4.2 Why Article-First (Not Direct Slide Outline)

The previous approach (v4.0) had the LLM generate a slide outline directly. The new approach adds an **article generation phase first**. This is better because:

1. **Domain expertise** — Article skills contain deep domain knowledge (parenting, F&B, textile, etc.) in their `skill.md`. A direct slide outline LLM call would miss this expertise.
2. **Content quality** — Writing a full article first, then splitting it, produces more coherent and detailed slide content than generating fragmented bullet points directly.
3. **Skill reusability** — The same article skills users already use for blog content, social posts, etc. can now power presentations too.
4. **User control** — Users can pick the article skill that matches their domain. A parenting expert picks the parenting skill; a restaurant owner picks the F&B skill. The slide content quality depends on the skill, not on a generic prompt.

### 4.3 LLM Call Count

For a 5-slide presentation:

| Phase | LLM Calls | Building Block |
|-------|-----------|----------------|
| Phase 1: Article generation | 1 (article skill) | A |
| Phase 2: Article → slides split | 1 (direct LLM) | C |
| Phase 3: Image prompt enhance | 5 (one per slide, image skill) | A |
| Phase 4: Image generation | 5 (one per slide, media API) | B |
| **Total** | **12 calls** | |

Phases 3+4 run per-slide **concurrently** (max 3 at a time), so wall-clock time is:
- Phase 1: ~5-10s (article)
- Phase 2: ~3-5s (split)
- Phase 3+4: ~15-20s (5 slides, 3 concurrent)
- Phase 5+6: ~1s (computation + DB)
- **Total: ~25-35s typical**

---

## 5. Slide Style Presets

### 5.1 Motivation

The current presentation canvas has **no theme or style system** — every element has individually hardcoded colors, fonts, and positions. There is no deck-level palette, no slide background color property, and no header/footer support. This means generated slides would all look the same regardless of domain or brand.

**Slide Style Presets** solve this by letting the user pick a visual identity before generation. The LayoutEngine applies the preset's colors, fonts, and header/footer configuration to every generated slide, producing a cohesive deck.

> **Scope limitation:** Style presets apply ONLY to AI-generated slides. They do NOT retroactively change existing manually-created slides. A full "presentation theme" system (applying to all slides, live-editable, inheritable) is out of scope for MVP.

### 5.2 SlideStylePreset Definition

```typescript
// File: apps/web/shared/presentation/aiTypes.ts

export interface SlideStylePreset {
  id: string;                  // e.g. "dark-professional"
  name: string;                // e.g. "Dark Professional"
  nameLocalized?: {            // optional i18n
    th?: string;
    en?: string;
  };
  thumbnail?: string;          // preview image path (static asset)

  // ── Color Palette ──
  colors: {
    background: string;        // slide canvas fill, e.g. "#1a1a2e"
    backgroundAlt: string;     // alternate panel/card bg, e.g. "#16213e"
    primary: string;           // titles, headings, e.g. "#e94560"
    secondary: string;         // accents, icons, e.g. "#0f3460"
    text: string;              // body text, e.g. "#e0e0e0"
    textMuted: string;         // captions, subtle text, e.g. "#a0a0a0"
    cardBg: string[];          // feature box card backgrounds (3 colors)
    overlay: string;           // hero overlay, e.g. "rgba(0,0,0,0.55)"
  };

  // ── Typography ──
  typography: {
    titleFontFamily: string;   // e.g. "Inter"
    bodyFontFamily: string;    // e.g. "Sarabun"
    titleFontWeight: number;   // e.g. 700
    bodyFontWeight: number;    // e.g. 400
  };

  // ── Header & Footer ──
  header?: {
    enabled: boolean;
    height: number;            // px, e.g. 80
    backgroundColor: string;
    showLogo?: boolean;        // placeholder logo position
    logoPosition: "left" | "center" | "right";
    showDeckTitle?: boolean;
    titleFontSize: number;     // e.g. 24
    titleColor: string;
    borderBottom?: string;     // e.g. "2px solid #e94560"
  };
  footer?: {
    enabled: boolean;
    height: number;            // px, e.g. 60
    backgroundColor: string;
    showPageNumber: boolean;
    showCustomText?: boolean;
    customText?: string;       // e.g. "© My Company 2026"
    fontSize: number;          // e.g. 18
    textColor: string;
    borderTop?: string;        // e.g. "1px solid #333"
  };
}
```

### 5.3 Built-in Presets (MVP)

#### Preset 1: `dark-professional`

```
┌──────────────────────────────────────────────────┐
│ ▪ DECK TITLE                    (header, #121212) │
│══════════════════════════════════════ #e94560 ═══│
│                                                  │
│   [Content area — bg: #1a1a2e]                   │
│   Title: Inter Bold, #e94560                     │
│   Body:  Sarabun Regular, #e0e0e0                │
│   Cards: #2d6a4f, #1e3a5f, #5a2d82              │
│                                                  │
│────────────────────────────────── (footer, #0a0a0a)│
│                              Page 1 of 5  │ #888 │
└──────────────────────────────────────────────────┘
```

| Property | Value |
|----------|-------|
| background | `#1a1a2e` |
| backgroundAlt | `#16213e` |
| primary | `#e94560` |
| secondary | `#0f3460` |
| text | `#e0e0e0` |
| textMuted | `#a0a0a0` |
| cardBg | `["#2d6a4f", "#1e3a5f", "#5a2d82"]` |
| overlay | `rgba(0,0,0,0.55)` |
| titleFont | Inter, 700 |
| bodyFont | Sarabun, 400 |
| header | enabled, 80px, `#121212`, logo left, deck title, red border-bottom |
| footer | enabled, 60px, `#0a0a0a`, page numbers, `#888` |

#### Preset 2: `light-minimalist`

| Property | Value |
|----------|-------|
| background | `#ffffff` |
| backgroundAlt | `#f5f5f5` |
| primary | `#222222` |
| secondary | `#666666` |
| text | `#333333` |
| textMuted | `#999999` |
| cardBg | `["#f0f0f0", "#e8e8e8", "#f8f8f8"]` |
| overlay | `rgba(255,255,255,0.75)` |
| titleFont | Inter, 600 |
| bodyFont | Inter, 400 |
| header | disabled |
| footer | enabled, 40px, transparent, page numbers, `#999` |

#### Preset 3: `corporate-blue`

| Property | Value |
|----------|-------|
| background | `#f0f4f8` |
| backgroundAlt | `#d9e2ec` |
| primary | `#102a43` |
| secondary | `#243b53` |
| text | `#334e68` |
| textMuted | `#627d98` |
| cardBg | `["#dceefb", "#b6d4f2", "#9dc8e8"]` |
| overlay | `rgba(16,42,67,0.65)` |
| titleFont | Inter, 700 |
| bodyFont | Sarabun, 400 |
| header | enabled, 70px, `#102a43`, logo left, white title, blue border-bottom |
| footer | enabled, 50px, `#102a43`, page numbers + custom text, white text |

#### Preset 4: `nature-green`

| Property | Value |
|----------|-------|
| background | `#f0f7f0` |
| backgroundAlt | `#d4edda` |
| primary | `#1b4332` |
| secondary | `#2d6a4f` |
| text | `#2d3436` |
| textMuted | `#636e72` |
| cardBg | `["#d8f3dc", "#b7e4c7", "#95d5b2"]` |
| overlay | `rgba(27,67,50,0.60)` |
| titleFont | Inter, 700 |
| bodyFont | Sarabun, 400 |
| header | enabled, 70px, `#1b4332`, logo left, white title |
| footer | enabled, 50px, `#1b4332`, page numbers, `#95d5b2` |

#### Preset 5: `warm-sunset`

| Property | Value |
|----------|-------|
| background | `#fff8f0` |
| backgroundAlt | `#ffecd2` |
| primary | `#d63031` |
| secondary | `#e17055` |
| text | `#2d3436` |
| textMuted | `#636e72` |
| cardBg | `["#fab1a0", "#fdcb6e", "#e17055"]` |
| overlay | `rgba(214,48,49,0.50)` |
| titleFont | Inter, 700 |
| bodyFont | Sarabun, 400 |
| header | disabled |
| footer | enabled, 50px, transparent, page numbers, `#d63031` |

### 5.4 How Presets Apply to Layout Templates

The LayoutEngine receives the selected preset and uses it to parameterize every element:

```
LayoutEngine.generateSlide({
  slideData,
  imageUrl,
  svgGraphic,
  stylePreset,       ← NEW: applies colors, fonts, header/footer
  canvasWidth,
  canvasHeight,
})
```

**Mapping rules:**

| Template element | Preset property used |
|------------------|---------------------|
| Slide background rect | `colors.background` |
| Text panel background | `colors.backgroundAlt` |
| Title text color | `colors.primary` |
| Title fontFamily + fontWeight | `typography.titleFontFamily`, `titleFontWeight` |
| Body text color | `colors.text` |
| Body fontFamily + fontWeight | `typography.bodyFontFamily`, `bodyFontWeight` |
| Hero overlay fill | `colors.overlay` |
| Feature box card fills | `colors.cardBg[0..2]` |
| SVG graphic tint/color | `colors.secondary` |
| Header elements | `header.*` (if enabled) |
| Footer elements | `footer.*` (if enabled) |

**Header/Footer element generation:**

When a preset has `header.enabled: true`, the LayoutEngine prepends header elements to EVERY slide:

```typescript
// Header elements (added to beginning of elements array)
{
  type: "rect",
  x: 0, y: 0,
  w: canvasWidth, h: preset.header.height,
  fill: preset.header.backgroundColor,
}
// Optional border-bottom line
{
  type: "line",
  x1: 0, y1: preset.header.height,
  x2: canvasWidth, y2: preset.header.height,
  stroke: preset.header.borderBottom,  // parsed from "2px solid #e94560"
}
// Optional deck title text
{
  type: "text",
  x: 80, y: Math.floor(preset.header.height / 2),
  text: deckTitle,
  fontSize: preset.header.titleFontSize,
  fill: preset.header.titleColor,
  fontFamily: preset.typography.titleFontFamily,
}
```

Similarly for `footer.enabled: true`, the LayoutEngine appends footer elements. Content area Y offsets are adjusted:

```
contentAreaY = preset.header?.enabled ? preset.header.height : 0
contentAreaHeight = canvasHeight
  - (preset.header?.enabled ? preset.header.height : 0)
  - (preset.footer?.enabled ? preset.footer.height : 0)
```

### 5.5 Preset Selection in Modal

The modal gains a **third selector** (Style Preset) alongside Article Skill and Image Prompt Skill. See Section 7.13 for the updated modal layout. The preset selector shows thumbnail previews of each style, with color swatches.

### 5.6 Future: User-Created Presets

Out of scope for MVP, but the `SlideStylePreset` interface is designed to accommodate user-saved presets stored in the database. Future work:
- Save/load presets per user/tenant
- Brand kit integration (upload logo, set brand colors)
- Apply presets to existing manually-created slides

---

## 6. Predefined Layout Templates

All templates target **1920 × 1080 px** (16:9). LayoutEngine scales proportionally for other canvas sizes.

**All colors and fonts are parameterized by the selected Style Preset (Section 5).** The coordinates below show the **content area** — if header/footer are enabled, Y offsets shift accordingly (see Section 5.4).

### Template 1: `hero_center`

For slide 1 (title) and section breaks.

```
┌────────────────────────────────────────────┐
│  [Header — if preset.header.enabled]       │
│────────────────────────────────────────────│
│  [Full-bleed background image]             │
│  [Semi-transparent overlay]                │
│  [overlay fill: preset.colors.overlay]     │
│           [SVG Graphic 160×160]            │
│  [Title — fontSize:80, preset.colors.text] │
│  [Body — fontSize:36, preset.colors.text]  │
│────────────────────────────────────────────│
│  [Footer — if preset.footer.enabled]       │
└────────────────────────────────────────────┘
```

| Element | x | y | w | h | Style source |
|---------|---|---|---|---|-------------|
| Background image | 0 | headerH | 1920 | contentH | — |
| Overlay rect | 0 | headerH | 1920 | contentH | `colors.overlay` |
| SVG | 880 | headerH+260 | 160 | 160 | `colors.secondary` (tint) |
| Title | 160 | headerH+460 | 1600 | — | `colors.primary`, `typography.titleFont*` |
| Body | 320 | headerH+600 | 1280 | — | `colors.text`, `typography.bodyFont*` |

### Template 2: `split_right_image`

```
┌──────────────────────┬─────────────────────┐
│  [Header spans full width if enabled]       │
│──────────────────────┬─────────────────────│
│  [SVG 80×80]         │   [Image 960×H]     │
│  [Title fontSize:64] │                     │
│  [Body fontSize:30]  │                     │
│──────────────────────┴─────────────────────│
│  [Footer spans full width if enabled]       │
└──────────────────────┴─────────────────────┘
```

| Element | x | y | w | h | Style source |
|---------|---|---|---|---|-------------|
| Text panel rect | 0 | headerH | 960 | contentH | `colors.backgroundAlt` |
| Right image | 960 | headerH | 960 | contentH | — |
| SVG | 80 | headerH+120 | 80 | 80 | `colors.secondary` |
| Title | 80 | headerH+240 | 800 | — | `colors.primary`, `typography.titleFont*` |
| Body | 80 | headerH+380 | 800 | — | `colors.text`, `typography.bodyFont*` |

### Template 3: `split_left_image`

Mirror of Template 2. Image at x=0, text panel at x=960.

### Template 4: `feature_boxes_right`

```
┌────────────────────┬───────────────────────┐
│                    │  [Title fontSize:48]  │
│  [Image 800×H]     │  ┌── Card 1 ───────┐ │
│                    │  │ [icon] [text]    │ │
│                    │  ├── Card 2 ───────┤ │
│                    │  │ [icon] [text]    │ │
│                    │  ├── Card 3 ───────┤ │
│                    │  │ [icon] [text]    │ │
│                    │  └─────────────────┘ │
└────────────────────┴───────────────────────┘
```

Cards at `cardY(i) = headerH + 180 + i * 280`, card fills: `preset.colors.cardBg[0..2]`, card text: `preset.colors.text`

---

## 7. Technical Implementation

### 7.1 New Files

| File | Purpose |
|------|---------|
| `apps/web/server/services/aiPresentationService.ts` | 6-phase orchestrator |
| `apps/web/server/services/aiPresentationLayoutEngine.ts` | Layout compiler (slideData + preset → canvas JSON) |
| `apps/web/shared/presentation/aiTypes.ts` | Zod schemas + `SlideStylePreset` interface |
| `apps/web/shared/presentation/aiStylePresets.ts` | Built-in style presets (5 presets) |
| `apps/web/shared/presentation/svgGraphicsCatalog.ts` | SVG catalog (extracted from GraphicsPanel) |
| `apps/web/client/src/components/presentation/AIDraftModal.tsx` | React modal with 3 selections (article skill + image skill + style preset) |

### 7.2 Modified Files

| File | Change |
|------|--------|
| `apps/web/server/routers/presentation.ts` | Add `ai.generateDraft` procedure |
| `apps/web/shared/presentation/constants.ts` | 3 error codes + feature flag |
| `apps/web/client/src/presentation-canvas/components/GraphicsPanel.tsx` | Re-import from shared catalog |
| `apps/web/client/src/pages/PresentationEditor.tsx` | Mount AIDraftModal + button |

### 7.3 NOT Modified (existing surfaces untouched)

Media Studio, Chat, Virtual Workflow, `mediaGenerationService`, `enhancePromptService`, `skills.ts` router — **zero changes**.

### 7.4 Zod Schemas

**File:** `apps/web/shared/presentation/aiTypes.ts`

```typescript
import { z } from "zod";

export const AI_LAYOUT_TEMPLATE_IDS = [
  "hero_center", "split_left_image",
  "split_right_image", "feature_boxes_right",
] as const;

export const AI_SVG_CATEGORIES = [
  "Arrows", "Business", "Communication", "Technology", "Education",
  "Nature", "Health", "Shapes", "Media", "Navigation", "Finance",
] as const;

export const AI_STYLE_PRESET_IDS = [
  "dark-professional", "light-minimalist",
  "corporate-blue", "nature-green", "warm-sunset",
] as const;

// ── Style Preset Zod Schema ──
export const SlideStylePresetColorsSchema = z.object({
  background: z.string(),
  backgroundAlt: z.string(),
  primary: z.string(),
  secondary: z.string(),
  text: z.string(),
  textMuted: z.string(),
  cardBg: z.array(z.string()).min(3).max(3),
  overlay: z.string(),
});

export const SlideStylePresetTypographySchema = z.object({
  titleFontFamily: z.string(),
  bodyFontFamily: z.string(),
  titleFontWeight: z.number(),
  bodyFontWeight: z.number(),
});

export const SlideStylePresetHeaderSchema = z.object({
  enabled: z.boolean(),
  height: z.number().min(0).max(200),
  backgroundColor: z.string(),
  showLogo: z.boolean().optional(),
  logoPosition: z.enum(["left", "center", "right"]).default("left"),
  showDeckTitle: z.boolean().optional(),
  titleFontSize: z.number().min(12).max(48),
  titleColor: z.string(),
  borderBottom: z.string().optional(),
});

export const SlideStylePresetFooterSchema = z.object({
  enabled: z.boolean(),
  height: z.number().min(0).max(150),
  backgroundColor: z.string(),
  showPageNumber: z.boolean(),
  showCustomText: z.boolean().optional(),
  customText: z.string().max(100).optional(),
  fontSize: z.number().min(10).max(36),
  textColor: z.string(),
  borderTop: z.string().optional(),
});

export const SlideStylePresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  nameLocalized: z.object({ th: z.string().optional(), en: z.string().optional() }).optional(),
  thumbnail: z.string().optional(),
  colors: SlideStylePresetColorsSchema,
  typography: SlideStylePresetTypographySchema,
  header: SlideStylePresetHeaderSchema.optional(),
  footer: SlideStylePresetFooterSchema.optional(),
});

export type SlideStylePreset = z.infer<typeof SlideStylePresetSchema>;

// ── Per-slide data produced by Phase 2 (article → slides split) ──
export const AIPresentationSlideSchema = z.object({
  templateId: z.enum(AI_LAYOUT_TEMPLATE_IDS),
  title: z.string().min(1).max(120),
  body: z.array(z.string().min(1).max(200)).min(1).max(4),
  graphicCategory: z.enum(AI_SVG_CATEGORIES),
  imagePromptKeywords: z.string().min(3).max(200),
});

export const AIPresentationSchema = z.object({
  slides: z.array(AIPresentationSlideSchema).min(1).max(10),
});

// ── tRPC mutation input — 3 selections (article skill + image skill + style preset) ──
export const GenerateAIDraftInputSchema = z.object({
  deckId: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
  prompt: z.string().min(3).max(1000),         // topic/subject
  numSlides: z.number().int().min(1).max(10).default(5),
  language: z.enum(["auto", "en", "th"]).default("auto"),
  // Skill configuration (user selects in modal)
  articleSkillId: z.string().min(1).max(64),    // REQUIRED: which skill writes the article
  imageSkillId: z.string().min(1).max(64).optional(), // optional: image prompt enhancement
  imageModel: z.string().min(1).max(128).optional(),  // optional: image generation model
  // Style configuration
  stylePresetId: z.enum(AI_STYLE_PRESET_IDS).default("dark-professional"),
  footerCustomText: z.string().max(100).optional(),   // e.g. "© My Company 2026"
});

export const GenerateAIDraftOutputSchema = z.object({
  slidesAdded: z.number().int().nonnegative(),
  newDeckVersion: z.number().int().nonnegative(),
  articlePreview: z.string().max(500).optional(), // first 500 chars of generated article
  warnings: z.array(z.string()).optional(),
});
```

### 7.5 SVG Graphics Catalog

Extract `SVG_GRAPHICS` + `SvgGraphic` from `GraphicsPanel.tsx` into `apps/web/shared/presentation/svgGraphicsCatalog.ts`. Re-export from `GraphicsPanel.tsx`.

### 7.6 LayoutEngine

**File:** `apps/web/server/services/aiPresentationLayoutEngine.ts`

```typescript
interface LayoutEngineInput {
  slideData: AIPresentationSlide;
  imageUrl: string | null;
  svgGraphic: SvgGraphic;
  stylePreset: SlideStylePreset;     // ← style preset drives all colors/fonts
  deckTitle?: string;                 // ← for header deck title display
  slideIndex: number;                 // ← for footer page numbers
  totalSlides: number;                // ← for footer "page X of Y"
  canvasWidth?: number;               // default 1920
  canvasHeight?: number;              // default 1080
}
interface LayoutEngineOutput {
  slideContent: PresentationSlideContent;
  warnings: string[];
}
```

**Rules:**
- Proportional coordinates: all positions/sizes scale with `canvasWidth / 1920`.
- `crypto.randomUUID()` for element IDs.
- Output validated with `presentationSlideContentSchema.safeParse()`.
- All color/font values read from `stylePreset` — **no hardcoded colors in LayoutEngine**.
- Header/footer elements injected based on `stylePreset.header?.enabled` / `stylePreset.footer?.enabled`.
- Content area Y offset = `headerH`, content area height = `canvasH - headerH - footerH`.

### 7.7 Orchestrator: `aiPresentationService.ts`

```typescript
async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: { userId: number; tenantId: string },
): Promise<GenerateAIDraftOutput> {
  const warnings: string[] = [];

  // ═══ Resolve Style Preset ═══
  const stylePreset = getBuiltInPreset(input.stylePresetId ?? "dark-professional");
  if (input.footerCustomText && stylePreset.footer?.enabled) {
    stylePreset.footer.customText = input.footerCustomText;
    stylePreset.footer.showCustomText = true;
  }

  // ═══ PHASE 1: Article Generation (Article Skill) ═══
  // Uses the SAME executeCustomSkillService that Chat and Media Studio use
  const articleResult = await executeCustomSkillService.execute({
    skillId: input.articleSkillId,
    userInputs: {
      topic: input.prompt,
      language: input.language,
    },
    model: defaultLlmModel,
    userId: actor.userId,
    tenantId: actor.tenantId,
  });
  const articleText = articleResult.content;

  // ═══ PHASE 2: Article → Slide Split (Direct LLM) ═══
  // Structured JSON output — NOT a skill, just a data transformation
  const splitResponse = await callLLMStructured({
    systemPrompt: buildSlideSplitPrompt(input.numSlides, input.language),
    userMessage: articleText,
    responseFormat: "json",
  });
  const outline = AIPresentationSchema.parse(JSON.parse(splitResponse.content));

  // ═══ PHASE 3 + 4: Image Enhancement + Generation (concurrent per slide) ═══
  const slideResults = await pMap(outline.slides, async (slide, index) => {
    // Phase 3: Enhance image prompt via selected image skill
    let optimizedPrompt = slide.imagePromptKeywords;
    if (input.imageSkillId) {
      try {
        const enhanced = await enhancePromptService.enhance({
          skillId: input.imageSkillId,
          userInput: slide.imagePromptKeywords,
          maxPromptLength: 500,
          aspectRatio: "16:9",
          language: "en",
        });
        if (enhanced.promptEn) optimizedPrompt = enhanced.promptEn;
      } catch {
        warnings.push(`skill_enhance_failed:slide_${index}`);
      }
    }

    // Phase 4: Generate image
    let imageUrl: string | null = null;
    try {
      const result = await mediaGenerationService.generateImageAsync({
        prompt: optimizedPrompt,
        model: input.imageModel ?? defaultImageModel,
        aspectRatio: "16:9",
        userId: actor.userId,
        tenantId: actor.tenantId,
      });
      imageUrl = result.url;
    } catch {
      warnings.push(`image_gen_failed:slide_${index}`);
    }

    return { slide, imageUrl };
  }, { concurrency: 3 });

  // ═══ PHASE 5: Layout Compilation (uses Style Preset) ═══
  const compiledSlides = slideResults.map(({ slide, imageUrl }, index) => {
    const svg = pickRandomSvg(slide.graphicCategory);
    return layoutEngine.generateSlide({
      slideData: slide,
      imageUrl,
      svgGraphic: svg,
      stylePreset,               // ← preset drives all colors, fonts, header/footer
      deckTitle: input.prompt,    // ← deck title for header display
      slideIndex: index,
      totalSlides: slideResults.length,
    });
  });

  // ═══ PHASE 6: Sequential Deck Insertion ═══
  let version = input.expectedVersion;
  for (const compiled of compiledSlides) {
    await addSlideToDeck(
      { deckId: input.deckId, slideContent: compiled.slideContent, expectedVersion: version },
      actor,
    );
    version++;
  }

  return {
    slidesAdded: compiledSlides.length,
    newDeckVersion: version,
    articlePreview: articleText.slice(0, 500),
    warnings,
  };
}
```

### 7.8 Slide Split LLM Prompt (Phase 2)

```
You are a presentation designer. You are given a full article. Split it into exactly {numSlides} slides.

For each slide, extract DIRECTLY from the article (do not invent new content):
- title: A short, punchy headline (max 120 chars)
- body: 1-4 bullet points taken from the article (max 200 chars each)
- imagePromptKeywords: 2-4 English keywords describing a fitting image
- graphicCategory: one of [Arrows, Business, Communication, Technology, Education, Nature, Health, Shapes, Media, Navigation, Finance]
- layoutTemplateId: one of [hero_center, split_left_image, split_right_image, feature_boxes_right]

Rules:
- Slide 1 MUST use "hero_center" as layoutTemplateId.
- Distribute article content evenly across slides — no slide should be empty.
- Vary layoutTemplateId across slides for visual diversity.
- imagePromptKeywords MUST be in English regardless of article language.
- Return ONLY valid JSON. No markdown.

<article>
{articleText}
</article>
```

### 7.9 tRPC API Contract

**Procedure:** `presentation.ai.generateDraft` (`protectedProcedure` mutation)

**Server process:**

```
1. CHECK  feature flag
2. VERIFY deck ownership (tenantId)
3. CHECK  credits ≥ estimated cost
4. CHECK  slide count limit
5. AUDIT  "ai_draft_request"
6. CALL   aiPresentationService.generateAIDraft(input, actor)
7. AUDIT  "ai_draft_complete"
8. RETURN result
```

**Error codes:**

| Scenario | Code |
|----------|------|
| Feature off | `PRESENTATION_FEATURE_DISABLED` |
| Deck not found | `PRESENTATION_NOT_FOUND` |
| Version conflict | `PRESENTATION_VERSION_CONFLICT` |
| Slide limit | `PRESENTATION_SLIDE_LIMIT_EXCEEDED` |
| No credits | `PRESENTATION_AI_INSUFFICIENT_CREDITS` |
| LLM/skill fail | `PRESENTATION_AI_GENERATION_FAILED` |
| Bad JSON | `PRESENTATION_AI_INVALID_RESPONSE` |

### 7.10 Error Codes

Add to `constants.ts`:

```typescript
"PRESENTATION_AI_GENERATION_FAILED",
"PRESENTATION_AI_INSUFFICIENT_CREDITS",
"PRESENTATION_AI_INVALID_RESPONSE",
```

### 7.11 Credit Estimation

| Phase | Estimated credits (5 slides) |
|-------|------------------------------|
| Phase 1: Article skill | ~15-30 (depends on article length) |
| Phase 2: Split LLM | ~10 |
| Phase 3: Image skill × 5 | ~50-75 |
| Phase 4: Image gen × 5 | ~25-75 (depends on model) |
| **Total estimate** | **~100-190 credits** |

Pre-check: estimate total, verify user balance. Use existing `creditService`.

### 7.12 Audit Logging

| Event | Key fields |
|-------|-----------|
| `ai_draft_request` | `deckId`, `userId`, `prompt`(200), `articleSkillId`, `imageSkillId`, `stylePresetId`, `numSlides` |
| `ai_draft_article_done` | `articleLength`, `skillId`, `latencyMs`, `creditsUsed` |
| `ai_draft_split_done` | `slideCount`, `latencyMs` |
| `ai_draft_image_enhance` | `slideIndex`, `skillId`, `rawKeywords`, `enhancedPreview`(60) |
| `ai_draft_image_done` | `slideIndex`, `model`, `provider`, `latencyMs` |
| `ai_draft_image_failed` | `slideIndex`, `error`, `usedPlaceholder:true` |
| `ai_draft_complete` | `slidesAdded`, `totalLatencyMs`, `warnings` |
| `ai_draft_failed` | `errorCode`, `phase`, `errorMessage` |

### 7.13 Frontend UI — AI Draft Modal (3 Selections)

**File:** `apps/web/client/src/components/presentation/AIDraftModal.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│  ✨ Draft with AI                                             │
│                                                              │
│  Topic:                                                      │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  e.g. "วิธีปลูกผักออร์แกนิคกินเองที่บ้าน"         │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  Slides: [──●─────] 5          Language: [Auto ▾]            │
│                                                              │
│  ── Content Settings ──────────────────────────────────      │
│  Article skill:  [ Organic Gardening Writer  ▾]   ← REQUIRED│
│  ℹ️ This skill writes the article. Different skills          │
│     produce different content styles and expertise.          │
│                                                              │
│  ── Image Settings ────────────────────────────────────      │
│  Image prompt skill: [ Smart Landscape Designer  ▾] ← OPTIONAL
│  Image model:        [ Default model ▾]             ← OPTIONAL
│  ℹ️ The image skill determines the visual style.             │
│     Skip to use raw keywords from the article.              │
│                                                              │
│  ── Slide Style ─────────────────────────────────────        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐│
│  │ ▓▓▓▓▓▓▓ │ │ ░░░░░░░ │ │ ▒▒▒▒▒▒▒ │ │ ▒▒▒▒▒▒▒ │ │▒▒▒▒▒▒▒││
│  │ Dark    │ │ Light   │ │Corporate│ │ Nature  │ │ Warm   ││
│  │ Profess.│ │ Minimal.│ │  Blue   │ │ Green   │ │ Sunset ││
│  └────●────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘│
│  ℹ️ Determines color palette, fonts, header/footer style.   │
│                                                              │
│  Footer text (optional):                                     │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  e.g. "© My Company 2026"                            │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│             [ Cancel ]  [ ✨ Generate ]                      │
└──────────────────────────────────────────────────────────────┘
```

**Selectors:**
- **Article skill:** Populated from `trpc.skills.list` (all skills). User MUST select one. Could show categories: "Content Writing", "Marketing", "Education", etc.
- **Image prompt skill:** Populated from skills with `execution_mode: "enhance-prompt"` or `category: "image_generation"`. Optional — if not selected, raw keywords from Phase 2 are used directly.
- **Style preset:** Horizontal card grid showing 5 built-in presets with color swatches as thumbnails. Default: `dark-professional`. Each card shows a mini preview of the color palette (background + primary + secondary + text).
- **Footer text:** Optional text input. Only shown if the selected preset has `footer.enabled: true`. Pre-filled with preset's default `customText` if available.

**Loading messages (cycle every 4s):**
```
"Writing article with selected skill..."
"Splitting content across slides..."
"Enhancing image prompts..."
"Generating visuals..."
"Applying slide styles..."
"Almost done..."
```

**On success:** Invalidate deck query. Show `slidesAdded` count + `articlePreview` snippet + any warnings.

---

## 8. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| E2E (5 slides, p50) | ≤ 35 seconds |
| E2E (p95) | ≤ 60 seconds |
| Phase 1 article skill timeout | 30 seconds |
| Phase 2 split LLM timeout | 15 seconds |
| Phase 3 per-slide skill timeout | 10 seconds |
| Phase 4 per-slide image timeout | 15 seconds (fallback) |
| Concurrent image work | Max 3 per request |
| Concurrent drafts per user | 1 (Redis lock) |
| Max slides per request | 10 |
| Frontend loading timeout | 90 seconds |

---

## 9. Security Considerations

- **Prompt injection:** Wrap user topic in `<user_topic>` delimiters. Wrap article text in `<article>` delimiters for Phase 2. Strip tag-injection patterns.
- **Authorization:** Verify deckId belongs to user's tenant. `protectedProcedure` required.
- **Rate limiting:** 1 concurrent draft per user, Redis key `ai_draft:{userId}` TTL 120s.
- **Logging safety:** Truncate prompts > 200 chars. Never log full presigned URLs or credentials.

---

## 10. Testing Strategy

### Unit Tests — LayoutEngine

```
aiPresentationLayoutEngine.test.ts
- 4 templates: correct element count, types, and positions
- null imageUrl → placeholder + warning
- Proportional scaling for non-standard canvas sizes
- Output passes Zod validation
- Unique element IDs per slide
- Style preset: all element colors match preset palette (no hardcoded colors)
- Style preset: header elements generated when preset.header.enabled
- Style preset: footer elements with page number when preset.footer.enabled
- Style preset: content area Y offset adjusted for header height
- Style preset: each of 5 built-in presets produces valid output
- Style preset: footer customText rendered when showCustomText=true
```

### Unit Tests — Orchestrator

```
aiPresentationService.test.ts
- Phase 1: calls executeCustomSkillService with correct articleSkillId
- Phase 2: calls LLM with article text as input (not user prompt)
- Phase 3: calls enhancePromptService with correct imageSkillId per slide
- Phase 4: calls mediaGenerationService with enhanced prompt (not raw keywords)
- Skill failure fallback: raw keywords used when skill fails
- Image failure fallback: placeholder rect, warning in output
- Version increment: expectedVersion + i for N sequential inserts
- Partial failure: 3/5 images fail → 5 slides still inserted
- No imageSkillId: Phase 3 skipped, raw keywords passed to Phase 4
- Style preset resolved correctly from stylePresetId
- footerCustomText override applied to preset
```

### Integration Tests — tRPC

```
presentation.ai.test.ts
- Auth: 401 unauthenticated, NOT_FOUND wrong tenant
- Feature flag: FORBIDDEN when off
- Credits: PAYMENT_REQUIRED when insufficient
- Slide limit: SLIDE_LIMIT_EXCEEDED
- Happy path: 5 slides added with correct count
- Custom skills forwarded correctly
- Style preset: stylePresetId forwarded to service
- Audit events emitted per phase (include stylePresetId)
```

### Frontend Tests

```
AIDraftModal.test.tsx
- Renders 3 selectors (article skill + image skill + style preset)
- Article skill is required (generate button disabled without it)
- Image skill is optional
- Style preset defaults to "dark-professional"
- Style preset card shows color swatch preview
- Footer text input shown only when preset has footer enabled
- Footer text input hidden when preset has footer disabled (e.g. light-minimalist)
- Loading messages cycle
- Success shows slidesAdded + articlePreview
- Error maps error codes to messages
- Invalidates deck query on success
```

---

## 11. Feature Flag & Rollout

```typescript
export const PRESENTATION_AI_GENERATION_FLAG_ENV = "PRESENTATION_AI_GENERATION_ENABLED";

export function isPresentationAIGenerationEnabled(): boolean {
  const raw = (process.env[PRESENTATION_AI_GENERATION_FLAG_ENV] || "").trim().toLowerCase();
  if (!raw) return false; // DEFAULT OFF
  return !["0", "false", "off", "no", "disabled"].includes(raw);
}
```

Stages: Internal → Beta (admin users) → GA. Rollback: set env to `false`.

---

## 12. Development Phasing

### Phase 1 — Shared Types, Style Presets & Catalog

- Create `apps/web/shared/presentation/svgGraphicsCatalog.ts`
- Create `apps/web/shared/presentation/aiTypes.ts` (includes `SlideStylePreset` interface, Zod schemas)
- Create `apps/web/shared/presentation/aiStylePresets.ts` (5 built-in presets)
- Modify `apps/web/shared/presentation/constants.ts` (error codes, feature flag)
- Re-export SVG catalog from `GraphicsPanel.tsx`
- **Verify:** `pnpm check` passes, all preset definitions pass `SlideStylePresetSchema.safeParse()`

### Phase 2 — LayoutEngine (Preset-Driven)

- Create `apps/web/server/services/aiPresentationLayoutEngine.ts`
- LayoutEngine reads ALL colors/fonts from `SlideStylePreset` — no hardcoded values
- Header/footer element generation based on preset config
- Create `apps/web/server/services/aiPresentationLayoutEngine.test.ts`
- **Verify:** All unit tests pass (including preset-specific tests), Zod validation passes

### Phase 3 — Orchestrator & tRPC

- Create `apps/web/server/services/aiPresentationService.ts`
- Modify `apps/web/server/routers/presentation.ts` — `ai.generateDraft`
- Resolve `stylePresetId` → `SlideStylePreset` object in orchestrator
- Apply `footerCustomText` override
- **Verify:** Integration tests pass, `pnpm check` passes

### Phase 4 — Frontend Modal (3 Selections)

- Create `apps/web/client/src/components/presentation/AIDraftModal.tsx`
- Implement: article skill selector, image skill selector, **style preset card grid**, footer text input
- Modify `apps/web/client/src/pages/PresentationEditor.tsx`
- **Verify:** Manual test — select article skill + image skill + style preset → 5 slides generated with correct colors/fonts/header/footer

---

## 13. Acceptance Criteria

### Functional — Pipeline

- [ ] Modal has **Article Skill selector** (required), **Image Prompt Skill selector** (optional), and **Style Preset selector** (default: dark-professional).
- [ ] Phase 1 uses the selected article skill to write a full article (visible in `articlePreview`).
- [ ] Phase 2 splits the article into slides — slide content comes FROM the article, not invented.
- [ ] Phase 3 uses the selected image skill to enhance prompts (or skips if no image skill selected).
- [ ] Phase 4 generates images using `mediaGenerationService.generateImageAsync()`.
- [ ] 5 slides appended to deck on success.
- [ ] Slide 1 uses `hero_center`. Layouts vary across other slides.
- [ ] Changing article skill (e.g. parenting → restaurant business) produces domain-appropriate content.
- [ ] Changing image skill (e.g. `image-creator` → `smart-landscape-designer`) produces different image styles.
- [ ] Thai topic → Thai article → Thai slide content.
- [ ] Image failure → placeholder rect + warning (not mutation error).
- [ ] Credits deducted correctly (article skill + split LLM + image skill × N + image gen × N).

### Functional — Style Presets

- [ ] Modal shows 5 built-in style presets as selectable cards with color swatch previews.
- [ ] Changing style preset produces visually distinct slides (different colors, fonts, header/footer).
- [ ] `dark-professional` preset: dark background, red accents, Inter/Sarabun fonts, header + footer.
- [ ] `light-minimalist` preset: white background, black text, no header, minimal footer.
- [ ] `corporate-blue` preset: blue palette, header with dark bar, footer with page numbers.
- [ ] `nature-green` preset: green palette, organic tones, header + footer.
- [ ] `warm-sunset` preset: warm orange/red tones, no header, colored footer.
- [ ] Header elements present on ALL slides when preset has `header.enabled: true`.
- [ ] Footer elements with page numbers (e.g. "1 / 5") present when `footer.showPageNumber: true`.
- [ ] Footer custom text (e.g. "© My Company 2026") rendered when user provides `footerCustomText`.
- [ ] Footer text input in modal only visible when selected preset has footer enabled.
- [ ] No hardcoded colors in LayoutEngine output — all values come from preset.

### Non-Functional

- [ ] 5-slide draft within 60 seconds (p95).
- [ ] Feature gated by `PRESENTATION_AI_GENERATION_ENABLED` (default off).
- [ ] Audit logs for all 6 phases (include `stylePresetId`).
- [ ] No secrets in logs.
- [ ] `pnpm check` zero errors.

### System Consistency

- [ ] Media Studio NOT affected.
- [ ] Virtual Workflow NOT affected.
- [ ] Chat NOT affected.
- [ ] No new media generation endpoints.
- [ ] No new skill execution endpoints.
- [ ] Uses same `executeCustomSkillService`, `enhancePromptService`, `mediaGenerationService` as other surfaces.
- [ ] Style presets apply ONLY to AI-generated slides (no retroactive changes to existing slides).
