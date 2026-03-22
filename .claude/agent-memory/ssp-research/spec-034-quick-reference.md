# Spec 034 — Developer Quick Reference

**Last Updated**: 2026-03-10 | **For**: Implementation Team

---

## 4 Skills to Wire Up FIRST

| Skill Name | Location | Execution Mode | Input | Output | Integration |
|---|---|---|---|---|---|
| **Storyboard Writer** | `apps/web/skills/storyboard-writer/` | llm-only | Topic + style | Scene descriptions (text) | For narrative outline |
| **Image Prompt Engineer** | `apps/web/skills/image_prompt_engineer/` | enhance-prompt | Scene description | Image prompt JSON | Chain: Image Creator |
| **Video Prompt Engineer** | `apps/web/skills/video-prompt-engineer/` | llm-only | Concept + platform | Video prompt JSON | Chain: Video Creator |
| **Nano Banana Infographic** | `apps/web/skills/nano-banana-infographic/` | media-generate | Content + style | PNG/JPEG directly | Embed in slide |

---

## Article Writers (Pick One Per Domain)

| Domain | Skill | Best For | File Path |
|--------|-------|----------|-----------|
| Business | Business Article Writer | Strategy + market analysis | `apps/web/skills/business-article-writer/` |
| Education | Education Article Writer | Learning objectives + pedagogy | `apps/web/skills/education-article-writer/` |
| Marketing | Marketing Article Writer | Campaign + audience strategy | `apps/web/skills/marketing-article-writer/` |
| Narrative | Documentary Script Writer | Factual + interviews | `apps/web/skills/documentary-script-writer/` |
| Creative | Creative Story Writer | Character-driven narratives | `apps/web/skills/creative-story-writer/` |
| General | General Article Writer | Any topic fallback | `apps/web/skills/general-article-writer/` |

**All support**:
- Language: en, th
- 14 storytelling templates (HPSO, AIDA, PAS, etc.)
- Output format: markdown, plain_text

---

## 2 New Skills to Build

### NEW SKILL 1: Research Aggregator

```yaml
name: Research Aggregator
category: research
execution_mode: llm-only
icon: search
version: "1.0.0"

# Input schema
input:
  query: string (required)
  num_points: integer (default: 5, range: 3-10)
  depth: enum [summary, detailed, comprehensive]
  language: enum [en, th]

# Output schema
output:
  findings: array[
    { point: string, explanation: string, source: string, credibility: "high|medium|low" }
  ]
  summary: string
  sources_cited: array[string]
  confidence_level: "high|medium|low"
```

**Pattern to follow**: Code Docs Assistant (lines 1-60 of code-docs-assistant/skill.md)

**Estimated effort**: 2-3 days

---

### NEW SKILL 2: Slide Layout Generator

```yaml
name: Slide Layout Generator
category: automation
execution_mode: llm-only
icon: layout-grid
version: "1.0.0"

# Input schema
input:
  article_content: string (markdown, required)
  storyboard: string (optional)
  visual_prompts: object[] (optional)
  template_style: enum [default, minimal, corporate, creative]
  language: enum [en, th]

# Output schema (presentationSlideContent-compatible)
output:
  slides: array[
    {
      slide_number: integer,
      title: string,
      content_type: enum [text, title, image, video, mixed],
      text_content: string,
      visual_spec: { type: string, prompt: string },
      speaker_notes: string,
      layout: string
    }
  ]
  presentation_metadata: {
    title: string,
    total_slides: integer,
    estimated_duration_minutes: integer
  }
```

**Output format** must match `presentationSlideContent` schema from `apps/web/shared/presentation/contracts.ts`

**Estimated effort**: 3-4 days

---

## File Structure Template (For New Skills)

```
apps/web/skills/{skill-slug}/
├── skill.md                          # YAML frontmatter + markdown
├── schemas/
│   ├── input.schema.json             # { "type": "object", "properties": {...} }
│   ├── output.schema.json            # Output contract
│   └── ui.schema.json                # Form rendering (sections + fields)
├── python/                           (if needed)
│   └── skill.py
├── tests/
│   └── tests.json                    # 5-6 test cases
└── knowledge/                        (optional reference docs)
```

---

## How Skills Are Discovered

**Location**: `apps/web/server/routers/skills.ts` (lines 1042-1118)

**Priority**:
1. `ui.schema.json` FIRST (custom UI rendering)
2. `input.schema.json` SECOND (auto-convert to UI)

**Search paths** (in order):
- `skills/{skillId}/schemas/{file}.json`
- `skills/{slug-variants}/schemas/{file}.json`
- Root scan (generic directory lookup)

---

## tRPC Integration Points

### Endpoint 1: Get Skill Schema
```typescript
// Location: apps/web/server/routers/skills.ts
trpc.skills.getInputSchema.query({ skillId: "research-aggregator" })
// Returns: { skillId, hasSchema: boolean, schema: SkillInputSchema }
```

### Endpoint 2: Execute Skill (Presentation.AI)
```typescript
// Location: apps/web/server/routers/[existing]
trpc.presentation.ai.generateDraft.mutation({
  skillId: "research-aggregator",
  params: { query: "AI trends 2026", num_points: 5 },
  language: "en"
})
// Returns: { content, metadata, ... }
```

### How to Call From Frontend
```typescript
// React Query pattern
const query = trpc.skills.getInputSchema.useQuery({ skillId: "research-aggregator" });
const mutation = trpc.someRouter.executeSkill.useMutation();

// On button click
mutation.mutate({ skillId, params: formValues, language })
```

---

## Skill Chaining: Example

```
Step 1: Research Aggregator (llm-only)
  Input: { query: "AI trends", num_points: 5 }
  Output: { findings: [...], summary: "..." }

Step 2: Business Article Writer (llm-only)
  Input: findings from Step 1 + topic
  Output: markdown article (8 sections)

Step 3: Storyboard Writer (llm-only)
  Input: article from Step 2 + commercial style
  Output: scene descriptions (8 scenes)

Step 4: Image Prompt Engineer (enhance-prompt)
  Input: each scene from Step 3
  Output: image prompts (JSON)

Step 5: [NEW] Slide Layout Generator (llm-only)
  Input: article + storyboard + image prompts
  Output: slide spec JSON (presentationSlideContent format)

Step 6: Image Creator (media-generate) [OPTIONAL]
  Input: image prompts from Step 4
  Output: PNG/JPEG images

Final: Present spec to user for review/rendering
```

---

## Multi-Language Support

**All skills support**: `language: "en" | "th"`

**Schema localization**:
```json
{
  "label": "Topic",           // English (required)
  "labelTh": "หัวข้อ",       // Thai (optional)
  "description": "What is your topic?",
  "descriptionTh": "หัวข้อของคุณคืออะไร"
}
```

**Frontend rendering** (DynamicSkillForm.tsx):
```typescript
const getText = (en: string | undefined, th: string | undefined) => {
  if (language === "th" && th) return th;
  return en || "";
};
```

**Action items**:
- ✅ All new skills: Add Thai labels to ui.schema.json
- ✅ Pass `language` prop through skill chain
- ✅ Test both en/th output

---

## Testing Checklist

### Unit Tests (Per Skill)
- [ ] Happy path: valid input → expected output
- [ ] Edge cases: empty input, max values, special chars
- [ ] Error handling: invalid input → graceful error
- [ ] Language: en output valid, th output valid

### Integration Tests
- [ ] Research → Article: output format compatible
- [ ] Article → Storyboard: section parsing works
- [ ] Storyboard → Image Prompts: scene extraction works
- [ ] Prompts → Media generation: prompt format valid

### E2E Tests (Full Flow)
- [ ] Use Case 1: Business deck flow (Research → Marketing Article → Deck)
- [ ] Use Case 2: Educational flow (Education Article → Cartoon Storyboard → Deck)
- [ ] Use Case 3: Social media flow (Storyboard → Video Prompts → Deck)
- [ ] Use Case 4: Mixed media (all skills together)

### Performance Tests
- [ ] Research Aggregator: <5s for typical query
- [ ] Article Writers: <10s for 5-10 section article
- [ ] Slide Layout Generator: <3s for 8-12 slides
- [ ] Full chain: <30s total

---

## Error Handling Patterns

### Pattern 1: Graceful Degradation
```typescript
try {
  const research = await executeResearchSkill(...);
} catch (error) {
  console.warn("Research failed, continuing without:", error);
  return { article: null, fallback: "Use manual input" };
}
```

### Pattern 2: User Feedback Loops
```typescript
// Show intermediate results
const research = await executeResearchSkill(...);
showToast("Research complete. Review and continue?");

// Allow user to edit before next step
const storyboard = await executeStoryboardSkill(research);
await userReviewsStoryboard(storyboard);

// Proceed to next step
const deck = await executeSlideLayoutGenerator(storyboard);
```

### Pattern 3: Fallback Skills
```typescript
// If specialty skill fails, use general skill
try {
  return await executeMarketingArticleWriter(...);
} catch {
  console.warn("Marketing writer failed, using general writer");
  return await executeGeneralArticleWriter(...);
}
```

---

## Performance Optimization Tips

1. **Parallel skill execution** (when independent):
   ```typescript
   // Run in parallel
   const [research, template] = await Promise.all([
     executeResearchSkill(...),
     getTemplateMetadata(...)
   ]);
   ```

2. **Caching research results**:
   ```typescript
   // Cache for same query within 24 hours
   const cacheKey = `research:${query}`;
   const cached = await redis.get(cacheKey);
   if (cached) return cached;
   ```

3. **Lazy image generation**:
   ```typescript
   // Don't generate media until user clicks "Generate"
   return presentationSpec; // Prompts only, no images
   // User can later: generateMedia(presentationSpec)
   ```

4. **Streaming long outputs**:
   ```typescript
   // For Article Writer (might be slow), stream result
   res.writeHead(200, { 'Content-Type': 'text/event-stream' });
   for await (const chunk of articleGenerator) {
     res.write(`data: ${chunk}\n\n`);
   }
   ```

---

## Common Gotchas

| Issue | Solution |
|-------|----------|
| **Schema not found** | Check priority: ui.schema.json FIRST, then input.schema.json |
| **Thai labels missing** | Every field in ui.schema.json must have `labelTh` for Thai support |
| **Skill chain order wrong** | Follow: Research → Article → Storyboard → Prompts → Slide Layout → Media |
| **Media generation fails** | Check prompt format matches skill output contract |
| **Performance slow** | Implement parallel execution + caching for long-running skills |
| **Language inconsistency** | Pass `language` prop through entire chain, don't let it drop |
| **Credit calculation wrong** | Each skill deducts credits; sum across chain = total cost |

---

## Quick Command Reference

### Run Skills Locally (Dev)
```bash
# Start dev server
cd apps/web
pnpm dev

# Test skill endpoint
curl http://localhost:3000/api/trpc/skills.getInputSchema \
  -H "Content-Type: application/json" \
  -d '{"skillId":"research-aggregator"}'
```

### Test New Skill Schema
```bash
# Validate JSON Schema
npx ajv compile schemas/input.schema.json
npx ajv compile schemas/ui.schema.json

# Check file exists
ls -la apps/web/skills/{skill-slug}/schemas/
```

---

## Useful Files to Read

| Purpose | File | Lines |
|---------|------|-------|
| Skill schema loading | `apps/web/server/routers/skills.ts` | 1042-1118 |
| Frontend form rendering | `apps/web/client/src/components/media/DynamicSkillForm.tsx` | 461-720 |
| Presentation contracts | `apps/web/shared/presentation/contracts.ts` | 1-400 |
| Slide rendering | `apps/web/server/routes/slideRender.ts` | 1-850 |
| Example skill (Image Prompt Engineer) | `apps/web/skills/image_prompt_engineer/skill.md` | 1-619 |
| Existing article writer | `apps/web/skills/business-article-writer/skill.md` | 1-194 |

---

## Support Resources

**For questions about**:
- **Skill schemas**: See `skills-inventory-comprehensive.md`
- **Chaining patterns**: See `spec-034-skill-orchestration-flows.md`
- **Executive overview**: See `spec-034-executive-summary.md`
- **Presentation rendering**: See `presentation-background-rendering-research.md`

**For debugging**:
- Check `/home/dev/projects/SmartSpecPro/.claude/agent-memory/ssp-research/` for all research docs
- Grep for `chainTo` to see existing chaining examples
- Grep for `execution_mode` to understand skill types

---

**Need help?** Check the full research documentation in `.claude/agent-memory/ssp-research/`
