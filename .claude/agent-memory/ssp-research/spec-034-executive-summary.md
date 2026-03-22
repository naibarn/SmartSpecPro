# Spec 034 — Executive Summary: Research Brief on SmartSpecPro Skills Inventory

**Date**: 2026-03-10 | **Researcher**: SmartSpecPro Research Agent | **Classification**: INTERNAL

---

## TL;DR

SmartSpecPro already has **29 specialized skills** across 13 categories. **4 critical skills + 8 article writers can be immediately reused** for spec 034 (Research/Storyboard/Deck Builder). Only **2 new minimal skills** are needed to bridge the gap between skill output and presentation spec generation.

**Estimated effort to ship**: 10-14 days (2-person team)

---

## What Is Spec 034?

Spec 034 is building three interconnected agents:
1. **Research Agent** — Gathers and synthesizes topic research into structured findings
2. **Storyboard Agent** — Converts research into scene-by-scene visual narrative outline
3. **Deck Builder Agent** — Generates presentation spec with optimized visual prompts

**Goal**: User provides a topic → System returns a complete presentation spec (slides + visual asset specs)

---

## Current State: Skills Available

### CRITICAL Skills (Use As-Is)

| Skill | Purpose | Status | Integration |
|-------|---------|--------|-------------|
| **Image Prompt Engineer** (v2.1) | Multi-platform image prompt optimization | ✅ Production ready | Chain: Image Creator |
| **Video Prompt Engineer** (v1.0) | Cinematic video prompt generation (6 platforms) | ✅ Production ready | Chain: Video Creator |
| **Nano Banana Infographic** | Slide illustrations + data charts (Google Nano Banana) | ✅ Production ready | Direct generation |
| **Storyboard Writer** (v1.0) | Scene-by-scene visual narrative outline | ✅ Production ready | Direct generation |

**Combined effort to integrate**: 1-2 days (just wire into tRPC + frontend UI)

### HIGH-Value Skills (Reusable)

**8 Article Writer Skills** (all execution_mode: llm-only, follow same pattern):
- Business Article Writer (strategy + recommendations)
- Education Article Writer (pedagogical structure)
- Marketing Article Writer (persuasive positioning)
- Documentary Script Writer (factual narrative + interviews)
- Creative Story Writer (narrative framing)
- General Article Writer (fallback all-purpose)
- Lifestyle Article Writer (inspirational content)

**Plus 5 supporting prompt/storyboard skills**:
- Code Docs Assistant (research aggregation pattern)
- Smart Landscape Designer (image prompt refinement)
- Storyboard to Video Prompts (scene → video conversion)
- Cartoon Storyboard Prompts (character consistency)
- Brainstorm (multi-angle ideation)

**Combined effort to integrate**: 2-3 days (connect to content pipeline)

---

## What's Missing (Gap Analysis)

| Gap | Impact | Workaround | Effort |
|-----|--------|-----------|--------|
| **Research Aggregator Skill** | Need structured research input for article writers | Build minimal skill (follows Code Docs pattern) | 2-3 days |
| **Slide Layout Generator Skill** | Need to convert article + storyboard → slide spec JSON | Build minimal skill (markdown → structured JSON) | 3-4 days |
| **Presentation Spec Adapter** | Need to map skill outputs to presentationSlideContent format | Custom integration layer (not a skill) | 1-2 days |
| **Orchestration/Sequencing** | Need to chain skills in correct order (Research → Storyboard → Deck) | tRPC router orchestration | 1-2 days |

**Total gap effort**: 7-11 days (reasonable)

---

## Architecture: How It Works

### Input
```
User: "Create a deck about AI trends in 2026"
User: "Business audience"
User: "15 minutes duration"
```

### Processing Pipeline

```
1. RESEARCH PHASE
   ├─ [NEW] Research Aggregator Skill
   ├─ Input: topic, num_points=5
   └─ Output: { findings: [...], summary: "...", sources_cited: [...] }

2. NARRATIVE PHASE
   ├─ Business Article Writer Skill
   ├─ Input: research findings + language/tone
   └─ Output: Markdown article (8 sections)

3. STORYBOARD PHASE
   ├─ Storyboard Writer Skill
   ├─ Input: article sections + commercial style
   └─ Output: Scene outlines (8 scenes, text descriptions)

4. VISUAL SPEC PHASE
   ├─ Image Prompt Engineer
   │  ├─ Input: scene descriptions
   │  └─ Output: Optimized image prompts (JSON)
   ├─ Video Prompt Engineer
   │  ├─ Input: key scenes
   │  └─ Output: Video generation prompts (JSON)
   └─ Nano Banana Infographic
      ├─ Input: data sections
      └─ Output: Direct PNG charts

5. DECK ASSEMBLY PHASE [NEW]
   ├─ Slide Layout Generator Skill
   ├─ Input: article + storyboard + visual prompts
   └─ Output: Slide spec JSON (presentationSlideContent format)

6. MEDIA GENERATION [Optional]
   ├─ Image Creator (from Image Prompt Engineer)
   ├─ Video Creator (from Video Prompt Engineer)
   └─ Nano Banana (already generated)

OUTPUT: Presentation spec ready for rendering/export
```

---

## Recommendation: Phased Implementation

### Phase 1: Quick Wins (1-2 days)
Wire up existing 4 critical skills to tRPC + React UI:
- ✅ Storyboard Writer
- ✅ Image Prompt Engineer
- ✅ Video Prompt Engineer
- ✅ Nano Banana Infographic

**Milestone**: Users can manually run each skill in sequence

### Phase 2: Content Pipeline (2-3 days)
Wire up article writer skills:
- ✅ Business Article Writer
- ✅ Education Article Writer
- ✅ Marketing Article Writer
- ✅ (others as needed)

**Milestone**: Users can generate structured content per domain

### Phase 3: Research & Orchestration (5-6 days)
Build 2 new targeted skills:
- 🔨 **Research Aggregator** (follows Code Docs Assistant pattern)
  - Takes: topic + search query
  - Returns: structured findings + sources
  - Effort: 2-3 days
- 🔨 **Slide Layout Generator** (markdown → JSON converter)
  - Takes: article + storyboard + visual prompts
  - Returns: presentationSlideContent spec
  - Effort: 3-4 days

**Milestone**: Users can run full orchestrated flow (Research → Deck)

### Phase 4: Polish & Release (2-3 days)
- Error handling + fallbacks
- Performance optimization
- User feedback iteration
- Documentation

**Total**: 10-14 days

---

## Key Technical Insights

### 1. Skills Already Support Multi-Language
All article writers + prompt engineers support en/th:
```
Language support: en, th (bilingual from start)
Storytelling templates: 14 reusable narrative structures
Reference images: Supported (for visual grounding)
```
→ No additional localization work needed

### 2. Existing Skill Chaining Pattern
Already proven in SmartSpecPro:
```
Image Prompt Engineer (enhance-prompt)
  ↓ chainTo: image-creator
Image Creator (media-generate)
  ↓ outputs PNG/JPEG
```
→ Can follow same pattern for spec 034

### 3. Schema Validation Already Built
All skills follow strict contract:
```
/skill-name/
  ├─ skill.md (YAML frontmatter + markdown)
  ├─ schemas/
  │  ├─ input.schema.json (JSON Schema validation)
  │  ├─ output.schema.json (output contract)
  │  └─ ui.schema.json (form rendering hints)
```
→ New skills can reuse same structure

### 4. Reference Image Support Already Exists
10+ skills support reference images:
```
reference_images: { role: "primary_subject", notes: "..." }
```
→ Character consistency across scenes works out-of-box

---

## Use Cases Enabled

### Use Case 1: "TED Talk Presentation"
```
Documentary Script Writer (research)
  ↓
Storyboard Writer (cinematic style)
  ↓
Video Prompt Engineer (4K)
  ↓
Nano Banana Infographic (data charts)
  ↓
Result: YouTube presentation with embedded video specs
```

### Use Case 2: "Product Launch Deck"
```
Marketing Article Writer (campaign strategy)
  ↓
Storyboard Writer (commercial style)
  ↓
Image Prompt Engineer (product photography)
  ↓
Video Prompt Engineer (product demo)
  ↓
Result: Investor pitch deck
```

### Use Case 3: "Animated Educational Series"
```
Education Article Writer (pedagogical)
  ↓
Cartoon Storyboard Prompts (character consistency)
  ↓
Storyboard to Video Prompts (animated scenes)
  ↓
Result: YouTube education series (6+ episodes)
```

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| **Skill output format incompatibility** | Low | New skills use same schema structure |
| **Performance (5+ skill chaining)** | Medium | Implement parallel execution, caching |
| **User confusion (too many options)** | Medium | Add template picker (Business/Education/Marketing) |
| **Language/localization bugs** | Low | Existing i18n already working |
| **Media generation cost explosion** | Medium | Let user preview spec before generating media |

---

## Success Criteria

- [ ] User can input topic → get full presentation spec in <2 minutes
- [ ] Spec includes research findings + visual asset prompts
- [ ] All 4 use cases (Business/Education/Marketing/Animated) work end-to-end
- [ ] Media generation optional (preview-first, then generate)
- [ ] Both English and Thai output quality acceptable
- [ ] Performance: spec generation <10s, media generation <60s/asset
- [ ] Test coverage >80% on new skills

---

## Deliverables

### Code
- [ ] NEW: Research Aggregator skill (skill.md + schemas)
- [ ] NEW: Slide Layout Generator skill (skill.md + schemas)
- [ ] Orchestration: tRPC router procedures (research → spec flow)
- [ ] Frontend: UI components for orchestration

### Documentation
- [ ] Skills inventory table (29 skills, relevance ratings)
- [ ] Skill chaining patterns & examples
- [ ] User guide for each use case
- [ ] API contract for new skills

### Testing
- [ ] Unit tests for new skills
- [ ] Integration tests (skill chaining)
- [ ] E2E tests (4 use case flows)
- [ ] Performance benchmarks

---

## Next Steps

1. **Immediate**: Get approval on 2 new skills design (Research Aggregator, Slide Layout Generator)
2. **Week 1**: Wire up 4 critical existing skills + build Phase 1 UI
3. **Week 2**: Build 2 new skills + orchestration layer
4. **Week 3**: Integration testing + user feedback loop
5. **Week 4**: Polish + launch

---

## References

**Full Documentation**:
- `skills-inventory-comprehensive.md` — Complete inventory of all 29 skills
- `spec-034-skill-orchestration-flows.md` — Detailed chaining patterns + architecture

**Key Source Files**:
- Skill definitions: `/home/dev/projects/SmartSpecPro/apps/web/skills/`
- Skill loading: `apps/web/server/routers/skills.ts` (lines 1019-1134)
- Frontend form: `apps/web/client/src/components/media/DynamicSkillForm.tsx`

---

## Questions for Stakeholders

1. **Research capability**: Should Research Aggregator use web search (LLM-based) or internal knowledge base? Cost/latency tradeoffs?

2. **Template selection**: Should users pick (Business/Education/Marketing) template upfront, or auto-detect from topic?

3. **Media generation timing**: Auto-generate all media, or show preview first + let user click "Generate"?

4. **Bilingual decks**: Output both English and Thai, or separate by language selection?

5. **Presentation complexity**: Max slides per spec? Max media assets per deck?

---

**Prepared by**: SmartSpecPro Research Agent (CMD-1)
**Classification**: INTERNAL — Ready for Development Team Review
**Status**: ✅ Research Complete — Recommendation: Proceed with Phase 1
