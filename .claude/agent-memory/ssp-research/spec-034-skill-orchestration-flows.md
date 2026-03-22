# Spec 034 — Skill Orchestration Flows

**Date**: 2026-03-10 | **Context**: Analyzing how existing SmartSpecPro skills can be chained to build the Research/Storyboard/Deck Builder system for spec 034.

---

## Orchestration Flow Patterns

### FLOW A: Business Research → Professional Deck

**User Input**: Topic + audience (business executives)

**Step 1: Research Phase**
```
Brainstorm Skill (multi-angle ideation)
  ├─ Input: User topic
  ├─ Process: 3 LLM debate rounds
  └─ Output: Synthesized research summary

  OR (simpler path)

Code Docs Assistant Pattern (NEW: Research Aggregator)
  ├─ Input: Topic + search query
  ├─ Process: External API lookup + synthesis
  └─ Output: Key findings + credible sources
```

**Step 2: Narrative Synthesis**
```
Business Article Writer + inverted_pyramid storytelling
  ├─ Input: Research findings + topic
  ├─ Process: Generate structured article (markdown)
  │          Sections: Executive Summary, Market Context,
  │                   Problem Statement, Strategic Analysis,
  │                   Recommendations, Financial Impact, Risk Assessment
  └─ Output: Markdown article (~1000-2000 words)
```

**Step 3: Storyboard Creation**
```
Storyboard Writer + commercial style
  ├─ Input: Article content + commercial style
  ├─ Process: Convert to 8-12 visual scenes
  │          Each scene: Visual desc + Narration + Mood
  └─ Output: Scene-by-scene storyboard (text)
```

**Step 4: Visual Asset Specification**
```
Image Prompt Engineer (text-to-image mode)
  ├─ Input: Each scene visual description
  ├─ Process: Optimize → platform-specific prompts
  ├─ Mode: "target_platform: generic" (multi-platform)
  └─ Output: Optimized image prompts + parameters

Nano Banana Infographic Creator
  ├─ Input: Data visualizations from article
  ├─ Process: Generate professional charts
  ├─ contentType: chart_bar / chart_pie / chart_line
  └─ Output: PNG/JPEG slide illustrations (4K)
```

**Step 5: Slide Deck Assembly** (NEW adapter layer)
```
Slide Layout Generator (NEW SKILL)
  ├─ Input: Article structure + storyboard + visual prompts
  ├─ Process: Convert to presentationSlideContent JSON
  │          - Slide 1: Title
  │          - Slides 2-N: Content + visual prompts
  │          - Final: Call-to-action
  └─ Output: Presentation spec (ready for rendering)
```

**Step 6: Generate Media Assets**
```
Image Creator (media-generate) [Optional pre-generation]
  ├─ Input: Image prompts from step 4
  ├─ Process: Call image generation API (e.g., DALL-E, Stable Diffusion)
  └─ Output: PNG/JPEG images → attach to presentation

OR (skip if user wants to defer)
  → User clicks "Generate Assets" after reviewing spec
```

**Final Output**: Presentation spec ready for playback/export

---

### FLOW B: Educational Curriculum → Interactive Deck

**User Input**: Topic + target audience (high school / university)

**Step 1: Research**
```
Education Article Writer + qa_flow storytelling
  ├─ Input: Topic + educational objectives
  ├─ Process: Generate pedagogical content
  │          Sections: Learning Objectives, Introduction,
  │                   Core Concepts, How It Works, Applications,
  │                   Common Misconceptions, Practice Questions
  └─ Output: Educational article (markdown)
```

**Step 2: Visual Storyboarding**
```
Cartoon Storyboard Prompts (with chibi_3d style)
  ├─ Input: Article concepts + character archetype
  ├─ Process: Design character + consistent visuals across scenes
  │          Narrative structure: classic_arc
  │          Character type: student character explaining concepts
  └─ Output: Character design + per-scene image prompts

  [Key: Character consistency sheet ensures repeated character looks same]
```

**Step 3: Scene Conversion**
```
Storyboard to Video Prompts
  ├─ Input: Cartoon storyboard from step 2
  ├─ Process: Generate video prompts for animated scenes
  │          Duration: 3-5s per scene (YouTube Shorts style)
  │          Include dialogue in en/th
  └─ Output: Numbered video prompts with timing
```

**Step 4: Slide Assembly** (NEW adapter)
```
Slide Layout Generator
  ├─ Input: Article + cartoon storyboard + video prompts
  ├─ Process: Create interactive slide deck
  │          - Text slides with concept explanations
  │          - Video preview slides showing video prompts
  │          - Practice question slides
  └─ Output: Presentation spec with embedded video prompts
```

**Step 5: Media Generation** (Optional)
```
Cartoon Video Creator OR VEO Video Creator
  ├─ Input: Video prompts from step 3
  ├─ Process: Generate animated scenes
  └─ Output: MP4 clips → embedded in presentation

Nano Banana Infographic
  ├─ Input: Concept diagrams
  ├─ Style: cartoon_friendly or isometric
  └─ Output: PNG slide illustrations
```

---

### FLOW C: Marketing Campaign → Multi-Channel Deck

**User Input**: Product name + campaign theme + target audience

**Step 1: Market Research**
```
Marketing Article Writer + listicle storytelling
  ├─ Input: Product + target audience + campaign goals
  ├─ Process: Generate marketing strategy
  │          Sections: Campaign Overview, Target Audience,
  │                   Market Landscape, Brand Positioning,
  │                   Channel Strategy, Content Direction,
  │                   Campaign Execution, KPIs, ROI Projection
  └─ Output: Marketing article (markdown)
```

**Step 2: Campaign Visual Narrative**
```
Storyboard Writer + social_media style
  ├─ Input: Campaign angle + key messages
  ├─ Process: Generate 6-8 visual scenes
  │          Style: social_media (punchy, attention-grabbing)
  │          Include camera directions for TikTok/Reels framing
  └─ Output: Scene storyboard (short, snappy descriptions)
```

**Step 3: Video Prompt Optimization**
```
Video Prompt Engineer + target_platform: compatible
  ├─ Input: Storyboard scenes
  ├─ Process: Generate cinematic prompts
  │          Optimize for: TikTok, Instagram Reels, YouTube Shorts (9:16)
  │          Include hook_strategy: problem_statement or before_after
  │          Music mood: upbeat_pop or corporate_motivational
  └─ Output: Multi-platform video prompts

  OR for product-focused:

Viral Talking Objects (if using animated product character)
  ├─ Input: Product as anthropomorphic character
  ├─ Process: Generate talking product prompts
  ├─ Character style: 3D-Pixar (professional, modern)
  └─ Output: Image + video prompts for character
```

**Step 4: Visual Asset Specification**
```
Image Prompt Engineer + target_platform: generic
  ├─ Input: Campaign visual scenes
  ├─ Process: Generate product photography prompts
  │          Style: commercial (polished, product-focused)
  │          Include lifestyle context
  └─ Output: Image generation prompts

Nano Banana Infographic
  ├─ Input: Campaign metrics / KPIs
  ├─ contentType: chart_bar or infographic_cartoon
  ├─ Style: flat_corporate or futuristic_clean
  └─ Output: Professional KPI visualizations
```

**Step 5: Slide Deck Assembly**
```
Slide Layout Generator (NEW SKILL)
  ├─ Input: Marketing article + storyboard + prompts
  ├─ Process: Create pitch deck structure
  │          - Title slide (campaign theme)
  │          - Market analysis slides
  │          - Campaign strategy slides
  │          - Visual/video preview slides
  │          - KPI dashboard slide
  │          - CTA slide
  └─ Output: Presentation spec
```

**Step 6: Media Generation**
```
Video Prompt Engineer → Video Creator (media-generate)
  ├─ Process: Generate product demo videos
  ├─ Duration: 15-30s for YouTube Shorts/Reels
  └─ Output: MP4 videos

Image Prompt Engineer → Image Creator (media-generate)
  ├─ Process: Generate lifestyle product shots
  └─ Output: PNG/JPEG product images

Nano Banana Infographic (direct generation)
  ├─ Process: Generate KPI charts
  └─ Output: PNG infographics
```

---

## Detailed Skill Chaining Rules

### Rule 1: Execution Mode Determines Chainability

| From Execution Mode | To Execution Mode | Can Chain? | Notes |
|---|---|---|---|
| llm-only | llm-only | ✅ YES | Pipe markdown output → next skill input |
| llm-only | enhance-prompt | ✅ YES | Pass content as prompt enhancement request |
| llm-only | media-generate | ✅ YES | Use LLM output as media prompt |
| enhance-prompt | media-generate | ✅ YES | Optimized prompt → media generation |
| media-generate | llm-only | ❌ NO | Image/video files not text input |
| media-generate | enhance-prompt | ❌ NO | Use image for reference images field instead |

### Rule 2: Reference Image Passing

When chaining skills that support reference images:

```
Storyboard Writer (generates scene descriptions)
  ↓ [Optional] Generate images via Image Creator
  ↓ [Pass images as reference to next skill]
Cartoon Storyboard Prompts (uses reference_images field)
  ├─ reference_images: [generated images]
  ├─ Usage: Extract character design + environment style
  └─ Output: Consistent character across all scenes
```

### Rule 3: Language Consistency

All skills support en/th language switching:

```
Business Article Writer (language: th)
  ↓ Output in Thai (markdown)
  ↓
Storyboard Writer (language: th)
  ├─ Reads Thai article
  ├─ Generates Thai scene descriptions
  └─ Output in Thai

✅ IMPORTANT: Language must be consistent across chain
```

### Rule 4: Output Format Adaptation

Different skills require different input formats:

| From Skill | Output Format | To Skill | Input Required | Adapter Needed? |
|---|---|---|---|---|
| Business Article Writer | Markdown article | Storyboard Writer | Topic + length | ✅ YES (extract key points) |
| Storyboard Writer | Text storyboard | Image Prompt Engineer | Scene description | ❌ NO (direct use) |
| Image Prompt Engineer | JSON prompts | Image Creator | Raw prompt string | ✅ YES (extract prompt field) |
| Nano Banana Infographic | PNG image | Presentation slide | Visual attachment | ✅ YES (embed in slide) |

---

## Skill Combinations for Spec 034 Use Cases

### Use Case 1: "TED Talk Presentation"
```
Documentary Script Writer (research + interview format)
  ↓
Storyboard Writer (cinematic style)
  ↓
Video Prompt Engineer (sora platform, 4K quality)
  ↓
Nano Banana Infographic (data visualizations)
  ↓
[NEW] Slide Layout Generator
  ↓
Output: YouTube presentation with embedded video prompts
```

### Use Case 2: "Product Launch Deck"
```
Marketing Article Writer (campaign strategy)
  ↓
Video Prompt Engineer (commercial style)
  ↓
Viral Talking Objects (product as character) [optional]
  ↓
Image Prompt Engineer (product photography)
  ↓
Nano Banana Infographic (specs + features table)
  ↓
[NEW] Slide Layout Generator
  ↓
Output: Investor pitch deck
```

### Use Case 3: "Animated Educational Series"
```
Education Article Writer (pedagogical structure)
  ↓
Cartoon Storyboard Prompts (chibi_3d + character)
  ↓
Storyboard to Video Prompts (scene → video conversion)
  ↓
Cartoon Video Creator OR VEO Video Creator
  ↓
[NEW] Slide Layout Generator
  ↓
Output: YouTube education series (episode structure)
```

### Use Case 4: "Social Media Campaign"
```
Brainstorm (multi-angle ideation) [optional]
  ↓
Marketing Article Writer (listicle format)
  ↓
Storyboard Writer (social_media style, 6 scenes)
  ↓
Video Prompt Engineer (compatible platform, 9:16)
  ↓
Image Prompt Engineer (multi-platform)
  ↓
[NEW] Slide Layout Generator
  ↓
Output: 6-slide social media deck with video + image specs
```

---

## NEW Skills Required to Complete the Flow

### NEW SKILL 1: Research Aggregator

**Purpose**: Fetch and synthesize research from multiple sources (following Code Docs Assistant pattern)

**Execution Mode**: llm-only

**Input Schema**:
```json
{
  "query": "string (required) - research topic",
  "sources": "enum [web, internal_kb, both] (default: web)",
  "num_points": "integer (3-10, default: 5)",
  "depth": "enum [summary, detailed, comprehensive] (default: detailed)",
  "language": "enum [en, th] (default: en)"
}
```

**Output Schema**:
```json
{
  "findings": [
    {
      "point": "string",
      "explanation": "string",
      "source": "string (attribution)",
      "credibility": "high|medium|low"
    }
  ],
  "summary": "string (2-3 paragraph synthesis)",
  "sources_cited": ["array of sources"],
  "confidence_level": "high|medium|low"
}
```

**File Location**: `/home/dev/projects/SmartSpecPro/apps/web/skills/research-aggregator/`

**Integration Point**: Output JSON → Input to article writer skills

---

### NEW SKILL 2: Slide Layout Generator

**Purpose**: Convert article content + storyboard + visual prompts → presentation slide structure

**Execution Mode**: llm-only

**Input Schema**:
```json
{
  "article_content": "markdown (required) - structured article",
  "storyboard": "string (optional) - scene descriptions",
  "visual_prompts": "object[] (optional) - image/video prompts",
  "template_style": "enum [default, minimal, corporate, creative]",
  "slide_theme": "enum [light, dark, corporate, creative]",
  "num_slides": "integer (5-20, auto-calculated from content)",
  "include_speaker_notes": "boolean (default: true)",
  "language": "enum [en, th]"
}
```

**Output Schema**:
```json
{
  "slides": [
    {
      "slide_number": "integer",
      "title": "string",
      "content_type": "enum [text, title, image, video, mixed]",
      "text_content": "string",
      "visual_spec": {
        "type": "image|video|infographic",
        "prompt": "string",
        "style": "string"
      },
      "speaker_notes": "string",
      "layout": "enum [title_only, text_left_visual_right, centered, ...]"
    }
  ],
  "presentation_metadata": {
    "title": "string",
    "total_slides": "integer",
    "estimated_duration_minutes": "integer",
    "theme": "string"
  }
}
```

**File Location**: `/home/dev/projects/SmartSpecPro/apps/web/skills/slide-layout-generator/`

**Integration Point**: Converts to presentationSlideContent format for rendering

---

## Reference: Existing Skill Chaining Examples

### Example 1: Image Prompt Engineer → Image Creator
```
Location: /home/dev/projects/SmartSpecPro/apps/web/skills/image_prompt_engineer/skill.md
chainTo: image-creator

Flow:
  1. User: "Create a modern office workspace"
  2. Image Prompt Engineer (enhance-prompt):
     - Input: "modern office workspace"
     - Process: Generate optimized prompt
     - Output: {
         "prompt": "Modern open-plan office...",
         "aspect_ratio": "16:9",
         "style": "photorealistic"
       }
  3. Image Creator (media-generate):
     - Input: prompt from step 2
     - Process: Call image generation API
     - Output: PNG image
```

---

## Implementation Roadmap for Spec 034

### Phase 1: Immediate Reuse (No new skills)
- ✅ Storyboard Writer
- ✅ Cartoon Storyboard Prompts
- ✅ All Article Writers
- ✅ Image/Video Prompt Engineers
- ✅ Nano Banana Infographic
- ⏱️ Estimated effort: 1-2 days (integration only)

### Phase 2: Build Missing Pieces (2 new skills)
- 🔨 Research Aggregator (following Code Docs Assistant pattern)
- 🔨 Slide Layout Generator (presentation spec converter)
- ⏱️ Estimated effort: 3-5 days each

### Phase 3: Integration & Orchestration
- 🔧 Wire skills in tRPC router
- 🔧 Create frontend orchestration flow (React components)
- 🔧 Add error handling + fallback strategies
- ⏱️ Estimated effort: 2-3 days

### Phase 4: Testing & Refinement
- 🧪 Test all 4 use case flows
- 🧪 Performance optimization (parallel skill execution)
- 🧪 User feedback iteration
- ⏱️ Estimated effort: 2-3 days

**Total estimated effort**: 10-14 days (for 2-person team)

---

## Notes for Implementation Team

1. **Skill Schema Validation**: Ensure all NEW skills follow existing `schemas/` structure (input/output/ui)

2. **Language Consistency**: Always pass `language` parameter through entire chain

3. **Error Handling**: Implement graceful degradation (if Research Aggregator fails, allow user to proceed with manual content)

4. **Performance**: Consider caching Research Aggregator results (same topic queried multiple times)

5. **Credit Calculation**: Each skill execution deducts credits (sum across chain, not per output)

6. **User Feedback**: Allow users to edit article/storyboard at each stage before final deck generation

7. **Template Selection**: Consider adding template picker BEFORE generation (Business/Education/Marketing/Creative templates)

---

## See Also

- Main inventory: `skills-inventory-comprehensive.md`
- Presentation render pipeline: `presentation-background-rendering-research.md`
- AI Dialog & skill system: `draft-with-ai-skill-input-research.md`
