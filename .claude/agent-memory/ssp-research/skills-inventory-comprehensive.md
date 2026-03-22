# SmartSpecPro Skills Inventory — Comprehensive Survey (2026-03-10)

**Total Skills**: 29 | **Categories**: 13 | **Last Updated**: 2026-03-10

---

## Master Skills Table

| # | Skill Name | Category | Execution Mode | Priority | Credit Mult | Relevant for Spec 034? | Key Use Case |
|----|---|---|---|---|---|---|---|
| 1 | Brainstorm | chat_assistant | llm-only | 40 | 1.0 | ⭐⭐⭐ MEDIUM | Multi-model debate for research ideation |
| 2 | Translation | translation | llm-only | 50 | 1.0 | ⭐ LOW | Bilingual output support |
| 3 | Image Creator | image_generation | media-generate | 95 | 1.0 | ⭐⭐⭐ HIGH | Generate visual assets for slides |
| 4 | Video Creator | video_generation | media-generate | 80 | 2.0 | ⭐⭐ MEDIUM | Generate video content for spec |
| 5 | Code Docs Assistant | code_assistant | llm-only | 40 | 1.0 | ⭐⭐⭐ HIGH | Research aggregation pattern (Context7 model) |
| 6 | Chat Alert | automation | llm-only | 90 | 1.0 | ⭐ LOW | Not relevant |
| 7 | Agency Creator | automation | llm-only | 90 | 2.0 | ⭐⭐ MEDIUM | Multi-agent orchestration model |
| 8 | Audio Creator | audio_generation | media-generate | 85 | 1.0 | ⭐ LOW | TTS for narration (not research) |
| 9 | Sound Effects Creator | sound_effects | media-generate | 78 | 1.0 | ⭐ LOW | Not relevant |
| 10 | Smart Landscape Designer | image_prompt_generation | llm-only | 55 | 1.0 | ⭐⭐⭐ HIGH | Image prompt engineering pattern |
| 11 | Storyboard to Video Prompts | video_prompt_generation | llm-only | 55 | 1.0 | ⭐⭐⭐ HIGH | Storyboard → prompt conversion |
| 12 | Image Prompt Engineer | image_prompt_generation | enhance-prompt | 50 | 1.0 | ⭐⭐⭐⭐ CRITICAL | Prompt refinement for visuals |
| 13 | Video Prompt Engineer | video_prompt_generation | llm-only | 50 | 1.0 | ⭐⭐⭐⭐ CRITICAL | Cinematic prompt generation |
| 14 | Viral Talking Objects | video_prompt_generation | llm-only | 60 | 1.0 | ⭐⭐ MEDIUM | Character/object design for animation |
| 15 | VEO Video Creator | video_generation | media-generate | 75 | 2.0 | ⭐⭐⭐ HIGH | Veo 3.1 specialized video generation |
| 16 | Nano Banana Infographic | image_generation | media-generate | 80 | 1.0 | ⭐⭐⭐⭐ CRITICAL | Slide illustrations + data viz |
| 17 | Intelligence Skill Creator | automation | python | 10 | 1.0 | ⭐ LOW | Skill generation (meta) |
| 18 | Cartoon Storyboard Prompts | prompt_enhancement | llm-only | 55 | 1.0 | ⭐⭐⭐ HIGH | Character-consistent image prompts |
| 19 | Business Article Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐⭐ HIGH | Research content for business decks |
| 20 | Education Article Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐⭐ HIGH | Research content for educational specs |
| 21 | Creative Story Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐ MEDIUM | Narrative framing for specs |
| 22 | Storyboard Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐⭐⭐ CRITICAL | Scene-by-scene visual narrative |
| 23 | Documentary Script Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐⭐ HIGH | Factual narrative + interview format |
| 24 | Lifestyle Article Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐ MEDIUM | Inspirational/wellness content |
| 25 | Marketing Article Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐⭐ HIGH | Persuasive content for pitch decks |
| 26 | General Article Writer | article_generation | llm-only | 50 | 1.0 | ⭐⭐⭐ HIGH | Fallback general-purpose writer |
| 27 | Household Product Reviewer | article_generation | llm-only | 50 | 1.0 | ⭐ LOW | Product reviews (not research) |
| 28 | Cartoon Video Creator | video_generation | media-generate | 90 | 2.0 | ⭐⭐ MEDIUM | Cartoon video generation |
| 29 | Workflow AI Editor | automation | llm-only | ? | ? | ⭐ LOW | No details found; appears unfinished |

---

## Skill Capability Breakdown by Spec 034 Need

### CRITICAL TIER — Direct Integration Required

#### 12. Image Prompt Engineer (v2.1)
- **Execution Mode**: enhance-prompt
- **Key Features**:
  - 5 generation modes: text-to-image, image-to-image, inpaint, outpaint, variation
  - Multi-platform support (Stable Diffusion, Midjourney, DALL-E 3, Gemini, Flux, Firefly)
  - Advanced: ControlNet, IP-Adapter, VFX effects, typography support
  - Reference image support (multiple images with role assignment)
  - 151+ style catalog
  - Auto-hallucination prevention (v2.1)
- **Input**: freeform request → structured prompt + parameters
- **Output**: JSON with prompt, avoid list, technical parameters, platform-specific format
- **Schema**: input.schema.json (required, detailed), ui.schema.json (selectors + sliders)
- **Integration**: Chain to Image Creator skill OR use directly in spec to optimize prompts
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/image_prompt_engineer/skill.md`

#### 13. Video Prompt Engineer (v1.0)
- **Execution Mode**: llm-only
- **Key Features**:
  - 6 AI platforms: Sora, Veo, Kling, Wan, Seedance, Compatible
  - Cinematic quality + multi-format (9:16, 16:9, 1:1, 4:5, 21:9)
  - Audio design (dialogue, SFX, music) with full mix options
  - Content types: product review, fashion, storytelling, music video, commercial
  - Hook strategies, call-to-action, emotion tone, pacing
  - Script generation (bilingual dialogue)
  - Montage, text overlay, creative freedom levels
- **Input**: Concept description + platform/style/mood selections
- **Output**: JSON with prompt, metadata, visual breakdown, script, technical specs
- **Integration**: Generates prompts for video generation downstream
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/video_prompt_engineer/skill.md`

#### 16. Nano Banana Infographic Creator
- **Execution Mode**: media-generate
- **Key Features**:
  - Optimized for Google Nano Banana 2 (Flash) + Pro
  - Content types: slide illustration, data charts (bar/pie/line), cartoon education, photorealistic, asset headers, timeline, process flow
  - Google Search grounding for real-time factual data
  - 10+ styles (minimal_modern, flat_corporate, cartoon_friendly, isometric, photorealistic, etc.)
  - WCAG accessibility compliance
  - Thai text rendering support (forces Pro model)
  - Output formats: PNG, JPEG, WebP at 1K-4K resolution
- **Input**: Content concept + style + layout type
- **Output**: Direct image generation (PNG/JPEG)
- **Integration**: Used to generate slide background illustrations + data visualizations
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/nano-banana-infographic/skill.md`

#### 22. Storyboard Writer (v1.0)
- **Execution Mode**: llm-only
- **Key Features**:
  - Scene-by-scene visual narrative (5-15 scenes)
  - Styles: cinematic, animated, documentary, commercial, social_media, explainer
  - Camera direction + sound design options
  - Reference image support (visual style grounding)
  - Text-to-speech safe writing (for voiceover narration)
  - Scene structure: Visual, Action, Narration/Dialogue, Mood, Camera, Sound
  - Multiple production styles (adjusts pacing + visual language)
- **Input**: Topic/concept + style + scene count
- **Output**: Plain text storyboard with scene descriptions + visual details
- **Integration**: Generates narrative outline for presentation flow
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/storyboard-writer/skill.md`

---

### HIGH TIER — Strong Integration Value

#### 5. Code Docs Assistant (Context7)
- **Pattern to Follow**: External API research + structured output
- **Key Insight**: Fetches documentation, synthesizes into QA format
- **Spec 034 Use**: Create Research Aggregator skill following this pattern
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/code-docs-assistant/skill.md`

#### 10. Smart Landscape Designer (v1.2.2)
- **Execution Mode**: llm-only
- **Output**: Single copy-ready image prompt string (NOT JSON object)
- **Pattern**: Prompt refining with constraints (char limit, language, style)
- **Spec 034 Use**: Reference for text constraint handling in prompts
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/smart-landscape-designer/skill.md`

#### 11. Storyboard to Video Prompts (v1.0)
- **Execution Mode**: llm-only
- **Flow**: Idea → Storyboard (text) → Scene-by-scene video prompts
- **Key Features**:
  - 40–120 second target duration (8 scenes typical)
  - Viral strategy integration
  - Dialogue language support (en/th)
  - Background mode (normal/green_screen/blue_screen/transparent)
  - Output: Numbered video prompts with dialogue + emotion + duration
- **Integration**: Takes storyboard output, generates video generation prompts
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/video-storyboard-to-prompts/skill.md`

#### 18. Cartoon Storyboard Prompts (v1.0)
- **Execution Mode**: llm-only
- **Key Feature**: Character consistency sheet + environment sheet
- **Character Types**: human, animal, anthropomorphic_object, mythical_creature, robot_mech
- **Cartoon Styles**: 21+ styles (Pixar 3D, chibi, claymation, anime, 2D, comic, watercolor, etc.)
- **Narrative Structures**: 14 built-in patterns (classic_arc, in_medias_res, parallel_timeline, twist_ending, loop_story, etc.)
- **Output**: Per-scene image prompts with full character descriptions (crucial for consistency)
- **Integration**: For animated deck specs
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/cartoon-storyboard-prompts/skill.md`

#### 19-26. Article Writers (8 skills)
- **Common Pattern**:
  - category: article_generation | execution_mode: llm-only
  - 14 storytelling structures (HPSO, AIDA, PAS, hook_insight_tip, before_after, story_flow, my_why, complain_recall, fab, star, scr, inverted_pyramid, listicle, qa_flow)
  - Language support (en/th)
  - Output formats: markdown, plain_text
  - Length presets: short (~500w), medium (~1000w), long (~2000w)
  - Text-to-speech safe writing

**Roles in Spec 034**:

| Skill | Best For | Key Output |
|-------|----------|-----------|
| **Business Article Writer** | Research synthesis for business/strategy specs | Structured article with market context + recommendations |
| **Education Article Writer** | Learning-focused specs + training materials | Pedagogical content with learning objectives + practice questions |
| **Marketing Article Writer** | Persuasive positioning + pitch deck content | Campaign overview + audience analysis + strategy |
| **Documentary Script Writer** | Factual research + interview segments | Narrative script with interview quotes + factual backing |
| **Creative Story Writer** | Narrative framing + emotional engagement | Short story with plot arc + dialogue |
| **General Article Writer** | Fallback all-purpose writer | Any topic in structured article format |
| **Lifestyle Article Writer** | Wellness/inspirational specs | Lifestyle tips + practical advice |
| **Storyboard Writer** | (Covered in CRITICAL tier above) | Scene-by-scene visual narrative |

**Integration Pattern**:
```
User Topic
  → Select Article Writer (domain-specific)
  → Select storytelling_style (14 options)
  → Generate content (markdown)
  → [NEW] Adapter: Convert to slide structure
  → Present as deck
```

**Files**:
- Business: `/home/dev/projects/SmartSpecPro/apps/web/skills/business-article-writer/skill.md`
- Education: `/home/dev/projects/SmartSpecPro/apps/web/skills/education-article-writer/skill.md`
- Marketing: `/home/dev/projects/SmartSpecPro/apps/web/skills/marketing-article-writer/skill.md`
- Documentary: `/home/dev/projects/SmartSpecPro/apps/web/skills/documentary-script-writer/skill.md`
- Creative Story: `/home/dev/projects/SmartSpecPro/apps/web/skills/creative-story-writer/skill.md`
- General: `/home/dev/projects/SmartSpecPro/apps/web/skills/general-article-writer/skill.md`
- Lifestyle: `/home/dev/projects/SmartSpecPro/apps/web/skills/lifestyle-article-writer/skill.md`

---

### MEDIUM TIER — Conditional/Supporting Use

#### 1. Brainstorm (Multi-Model Debate)
- **Execution Mode**: llm-only
- **Flow**: Model A proposes → Model B critiques → N debate rounds → Model A synthesizes
- **Use for Spec 034**: Research ideation phase (when user needs multiple angles)
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/brainstorm/skill.md`

#### 7. Agency Creator (Multi-Agent Orchestration)
- **Execution Mode**: llm-only
- **7-Phase Pipeline**: DISCOVER → INTERVIEW → DESIGN → VALIDATE → IMPLEMENT → VERIFY → DOCUMENT
- **Node Types**: agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval
- **Pattern to Follow**: Multi-step orchestration (similar to what Spec 034 will need)
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/agency-creator/skill.md`

#### 14. Viral Talking Objects (v1.1)
- **Execution Mode**: llm-only
- **Output**: Image + video prompts for "talking object" videos
- **Character Style**: 3D-Pixar, Chibi, Realistic, Claymation, Anime, 2D Cartoon, Comic, Watercolor, etc.
- **Use**: For animated specs with personified object characters
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/viral-talking-objects/skill.md`

#### 15. VEO Video Creator (v1.0)
- **Execution Mode**: media-generate
- **Optimized for**: Google Veo 3.1
- **Features**:
  - Duration: 4, 6, or 8 seconds (8s required for 1080p/4K or reference images)
  - Aspect ratios: 16:9, 9:16
  - Resolution: 720p, 1080p, 4K
  - Reference images: up to 3 (for character consistency)
  - Multi-shot timestamp prompting
  - Native audio (dialogue + SFX + ambience)
  - Extension support (up to 20 rounds, ~148s max)
- **Integration**: For high-quality Veo-specific video generation
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/veo-video-creator/skill.md`

#### 21. Creative Story Writer (v1.0)
- **Execution Mode**: llm-only
- **Genres**: fiction, sci_fi, fantasy, romance, thriller, drama, fairy_tale, fable, adventure
- **Use**: Narrative framing for story-driven specs
- **File**: `/home/dev/projects/SmartSpecPro/apps/web/skills/creative-story-writer/skill.md`

---

### LOW TIER — Not Relevant for Spec 034

- **2. Translation**: Bilingual support only (peripheral)
- **3. Video Creator**: Generic (use specialized Video Prompt Engineer instead)
- **4. Audio Creator**: TTS only (not research)
- **6. Chat Alert**: Scheduling (unrelated)
- **8-9. Audio/Sound**: Media generation only (not content structure)
- **17. Intelligence Skill Creator**: Meta-skill (not direct use)
- **27. Household Product Reviewer**: Product reviews (out of scope)
- **28. Cartoon Video Creator**: Generic video (use VEO instead)
- **29. Workflow AI Editor**: Incomplete/undocumented

---

## Summary: Skills by Spec 034 Task

### RESEARCH PHASE
- **Use Code Docs Assistant pattern** → Build Research Aggregator skill
- **OR use**: Documentary Script Writer (for factual narrative)
- **OR use**: Brainstorm (for multi-angle ideation)

### STORYBOARD PHASE
- **CRITICAL**: Storyboard Writer (generates scene outline)
- **CRITICAL**: Cartoon Storyboard Prompts (for animated specs)
- **SECONDARY**: Storyboard to Video Prompts (scene → video prompt conversion)

### DECK BUILDER PHASE
- **CRITICAL**: Choose Article Writer (business/education/marketing/general/documentary)
- **CRITICAL**: Nano Banana Infographic (generates slide illustrations + charts)
- **CRITICAL**: Image Prompt Engineer (optimize visual prompts)
- **CRITICAL**: Video Prompt Engineer (optimize video prompts)
- **SECONDARY**: VEO Video Creator (generate Veo-specific videos)

### VISUAL ASSET PHASE
- **CRITICAL**: Image Prompt Engineer → Image Creator (chain)
- **CRITICAL**: Video Prompt Engineer → Video Creator (chain)
- **CRITICAL**: Nano Banana Infographic (direct generation)
- **SECONDARY**: Viral Talking Objects (for character-driven specs)

---

## Key Integration Points

### 1. Schema Location Pattern
All skills follow this structure:
```
/home/dev/projects/SmartSpecPro/apps/web/skills/{skill-slug}/
├── skill.md                          # YAML frontmatter + markdown
├── schemas/
│   ├── input.schema.json             # Full validation schema
│   ├── output.schema.json            # Output contract
│   └── ui.schema.json                # SmartAIHub form rendering
└── [optional] knowledge/             # Reference docs
```

### 2. Execution Mode Determines Flow
- **llm-only**: Skill content sent as system prompt to LLM → text/JSON output
- **enhance-prompt**: Takes user input, returns optimized prompt (chainable)
- **media-generate**: Takes prompt, calls external API (image/video/audio gen)
- **python**: Custom Python execution (advanced)

### 3. Skill Chaining Pattern
```
Image Prompt Engineer (enhance-prompt)
  ↓ chainTo: image-creator
Image Creator (media-generate)
  ↓ generates PNG/JPEG
```

### 4. Reference Image Support
Skills supporting reference images (important for consistency):
- Image Prompt Engineer
- Video Prompt Engineer
- Cartoon Storyboard Prompts
- Storyboard Writer
- VEO Video Creator
- Smart Landscape Designer
- All Article Writers (optional)

### 5. Storytelling Structures (Reusable)
All content writing skills support these 14 narrative templates:
1. HPSO (Hook, Problem, Solution, Outcome)
2. AIDA (Attention, Interest, Desire, Action)
3. PAS (Problem, Agitate, Solution)
4. hook_insight_tip
5. before_after
6. story_flow
7. my_why
8. complain_recall
9. fab (Features, Advantages, Benefits)
10. star (Situation, Task, Action, Result)
11. scr (Situation, Complication, Resolution)
12. inverted_pyramid
13. listicle
14. qa_flow

---

## Skills NOT Found / Gaps

| Gap | Why | Workaround |
|-----|-----|-----------|
| **Explicit Research/Knowledge Aggregation** | Code Docs Assistant is code-specific | Use Code Docs pattern + build Research Aggregator |
| **Presentation Slide Layout Generator** | No skill generates slide object specs | Build new skill OR create adapter layer |
| **Deck Templates** | No template selection | Add template parameter to slide layout skill |
| **Audience Profiling** | Not in existing skills | Use Marketing Article Writer (has audience analysis) |
| **A/B Testing Variant Generator** | Not in existing skills | Could be added as future skill |
| **Accessibility Compliance Checker** | Not in existing skills | Document in Nano Banana (already does WCAG) |

---

## Implementation Recommendation for Spec 034

### Phase 1: Reuse (Immediate)
```
✅ Storyboard Writer                → Scene outline
✅ Cartoon Storyboard Prompts       → Character consistency
✅ Business/Education Article Writers → Research content
✅ Image Prompt Engineer            → Visual prompt optimization
✅ Video Prompt Engineer            → Video prompt optimization
✅ Nano Banana Infographic          → Slide illustrations
```

### Phase 2: New Minimal Skills
```
🔨 Research Aggregator (built following Code Docs Assistant pattern)
🔨 Slide Layout Generator (converts article → slide structure JSON)
```

### Phase 3: Integration Layer
```
🔧 Adapter: Article Markdown → Presentation Slide Objects
🔧 Orchestration: Research → Storyboard → Deck Builder flow
```

---

## References

**All skill definitions** located in: `/home/dev/projects/SmartSpecPro/apps/web/skills/`

**Key backend files**:
- Schema loading: `apps/web/server/routers/skills.ts` (lines 1019-1134)
- Skill registry: `apps/web/server/services/skillRegistry.ts`
- Execution: `apps/web/server/services/skillExecutor.ts`
- Frontend form rendering: `apps/web/client/src/components/media/DynamicSkillForm.tsx` (lines 461-473)
- tRPC skill procedures: `apps/web/server/routers/skills.ts`
