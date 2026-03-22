---
name: Skill System Research Summary
description: Executive summary of SmartSpecPro's 46-skill platform, detection architecture, execution flows, chaining, and current gaps
type: project
---

# SmartSpecPro Skill System — Research Summary

## What is Completed

### Skill Inventory (46 Skills)
- **Media generation** (8): image, video, audio creation + prompt engineering
- **Content writing** (10): article writers across 8 categories + code docs assistant
- **Product reviews** (15): specialized reviewers (beauty, fashion, electronics, etc.)
- **Specialist skills** (13): brainstorm, translation, workflow editor, presentation designer, etc.
- **Status**: All deployed, all enabled by default, auto-synced from `skill.md` files

### Detection System
- **Pattern-based**: Regex trigger matching with priority ordering
- **Confidence scoring**: 0.7 base + bonuses for match position and media keywords
- **Preference filtering**: Per-conversation enable/disable via `skillPreferences` table
- **User access control**: Visibility gates via `userSkillVisibility` table
- **Auto-trigger**: Only `image-creator` (priority 95) has `isAutoTrigger: true`
- **Explicit requests**: Slash commands (`/image-creator`, `/video-creator`, etc.)
- **Query method**: Server-side via `detectSkill()` or `detectSkillWithAgency()`

### Execution Flow
- **tRPC endpoint**: `chat.executeSkill` (input: skillId, prompt, model, extraParams, ...)
- **Routing by executionMode**:
  - `llm-only` → LLM call + return text result
  - `media-generate` → Image/Video/Audio API
  - `python` → Async Celery task, client polls result
  - `sandbox-*` → OpenSandbox dispatch (if enabled)
- **Model selection**:
  - Primary: Execution Policy (Feature 041 — capability matching)
  - Fallback: Planner → Skill pin (llmModelId, preferredProviderId) → Conversation model → System default
  - If model fails: Try 5 alternative models before giving up
- **Credit deduction**: Per-skill multiplier + model-based pricing (already deducted by Python backend)

### Chaining
- **Per-skill chainTo**: `skill.chainTo = "image-creator"` — default next skill
- **Per-pattern chainTo**: Each trigger pattern can override: `{pattern, chainTo, label}`
- **Return to UI**: Detection result includes `patternChainTo` for frontend logic
- **Auto-execution**: NOT implemented — frontend must invoke next skill manually
- **Limitations**: No circular validation, no conditional branching, no multi-target chaining

### Data Persistence
- **Database tables**: `skills`, `skillPreferences`, `userSkillVisibility`
- **Content sync**: MD5 hash-based auto-sync from `skills/*/skill.md` on startup
- **Skill.md format**: YAML frontmatter (name, category, triggers, chainTo, etc.) + markdown content

---

## What Does NOT Exist

### Parallel Execution
- **Current**: Single skill per request, sequential processing
- **Missing**: Batch API, DAG execution, fork/join patterns
- **Impact**: Can't run 5 image generations in parallel; must invoke separately

### Skill Composition
- **Current**: Single-skill invocation only
- **Missing**: Workflow builder, skill pipelines, multi-step sequences
- **Impact**: Can't express "article → generate 3 hero images → create video"

### Intent-Based Detection
- **Current**: Regex pattern matching only
- **Missing**: LLM-based intent classification
- **Impact**: "Help me write about cooking" won't auto-detect `marketing-article-writer` without exact match

### Conditional Chaining
- **Current**: Static chainTo targets
- **Missing**: Branching logic (if output matches X → chain to Y)
- **Impact**: No dynamic routing based on skill results

### Multi-Output Skills
- **Current**: Each skill invocation = 1 result
- **Missing**: Batch results, arrays of outputs
- **Impact**: Can't generate 5 image prompts in one call; must invoke 5 times

### Skill Version Management
- **Current**: Single canonical skill definition
- **Missing**: Multiple versions, version selection UI
- **Impact**: Can't A/B test prompt variants or manage breaking changes

### Input Schema Enforcement
- **Current**: Custom skills validated against security blacklist only
- **Missing**: JSON Schema validation for all inputs
- **Impact**: Weak runtime validation, potential injection risks

---

## Key Architecture Insights

### 1. Detection is Deterministic
- Pattern match → confidence score → return first match
- No randomness, no ML model uncertainty
- Works offline (only regex needed, no LLM call)

### 2. Execution is Modular
- Routes by `executionMode`, not by skill type
- Same skill can use different execution paths based on configuration
- Easy to add new execution modes (e.g., `sandbox-webassembly`)

### 3. Model Selection is Layered
- Feature 041 (execution policy) + Feature 039 (planner) create 3 decision layers
- Skill designer specifies requirements, planner optimizes, fallback chain prevents failures
- User can override at conversation level

### 4. Chaining is Metadata-Only
- chainTo is stored but never auto-executed
- Frontend UI can display suggestions but doesn't force invocation
- Allows gradual adoption (users opt-in to chaining)

### 5. Skill Discovery is Distributed
- Skills live in folder structure (`skills/*/skill.md`)
- Auto-sync on server startup discovers all new skills
- No hardcoded skill registry, 100% database-driven

---

## Current Limitations & Risks

### 1. No Bulk Execution (HIGH IMPACT)
- **Use case**: Generate 5 images from 5 different prompts
- **Current behavior**: Must call `executeSkill` 5 times sequentially
- **Risk**: Timeout on large batches, poor UX (each takes 10-30 seconds)
- **Fix**: Add `executeSkillBatch([{skillId, prompt}, ...])` endpoint

### 2. No NLP Intent Detection (MEDIUM IMPACT)
- **Use case**: "Help me write marketing content about AI" should detect marketing-article-writer
- **Current behavior**: Only exact regex matches trigger skills
- **Risk**: Users don't discover relevant skills, default to manual invocation
- **Fix**: Optional LLM-based intent classifier during detect phase

### 3. ChainTo Not Auto-Executed (MEDIUM IMPACT)
- **Use case**: After image prompt engineering, auto-invoke image-creator
- **Current behavior**: Frontend shows suggestion, user must manually invoke
- **Risk**: Extra friction, breaks workflows that expect automatic chaining
- **Fix**: Add `executeChain(skillId, prompt)` that follows chainTo automatically

### 4. Single-Output per Invocation (MEDIUM IMPACT)
- **Use case**: Image skill returns 3 images, all should be individually postable
- **Current behavior**: resultUrl (single), resultUrls (array) both supported
- **Risk**: UI must handle both cases, inconsistent skill contracts
- **Fix**: Standardize on array results, update all skills

### 5. Race Condition on Skill Updates (LOW IMPACT)
- **Risk**: If skill.md is edited while skill is executing, might execute old/new content
- **Mitigation**: Content hash checked at execution time, worst case old content executes
- **Fix**: Snapshot skill definition at queue time, not execution time

### 6. No Sandbox Skill Validation (MEDIUM IMPACT)
- **Risk**: Python/Node skills can be uploaded with bugs, no dry-run testing
- **Fix**: Add skill test harness before deployment

### 7. Circular Chain Detection Missing (LOW IMPACT)
- **Risk**: Skill A → B → C → A creates infinite loop if auto-executed
- **Fix**: Validate chain graph at skill creation/edit time

---

## Performance Notes

### Detection Performance
- **O(n)** where n = number of skills (46)
- **O(m)** where m = number of trigger patterns per skill (avg 3-5)
- **Total**: ~200 regex operations per detect → <1ms
- **Optimization**: Already priority-ordered, stops at first match

### Execution Performance
- **LLM skills**: 5-30 seconds (LLM response time)
- **Media skills**: 15-120 seconds (async, returns taskId immediately)
- **Python skills**: 5-60 seconds (depends on workload)
- **Bottleneck**: External API calls (LLM gateway, media APIs), not skill engine

### Database Performance
- **Skill registry**: 60-second cache TTL (reloaded on startup and after changes)
- **Skill preferences**: Per-conversation query (indexed on conversationId + skillId)
- **No N+1 queries**: All skill metadata loaded upfront via getSkillRegistryAsync()

---

## Recommended Next Steps

### Phase 1: Quick Wins (1-2 weeks, no breaking changes)
1. **Add batch detect** — `detectSkills(message, skills[])` returns ranked matches
2. **Improve chainTo display** — Show chain suggestions in UI with one-click execution
3. **Add skill search** — Full-text search on skill name/description + tag filtering
4. **Add skill ratings** — User can rate skills (1-5 stars) after execution

### Phase 2: Composition (2-4 weeks, design-heavy)
1. **Skill chaining API** — `executeChain(skillId, prompt, maxSteps)` auto-follows chainTo
2. **Skill composition UI** — Simple drag-drop workflow builder (Node.js-style)
3. **Batch execution API** — `executeBatch([{skillId, prompt}])` returns Promise<results[]>
4. **Result pass-through** — Parent skill output → child skill input (type validation)

### Phase 3: Intelligence (4-8 weeks, requires ML expertise)
1. **LLM intent detection** — Optional NLP path alongside regex detection
2. **Skill recommendations** — "Users who executed X also used Y" collaborative filtering
3. **Dynamic model selection** — Planner learns which models work best for each skill
4. **Skill versioning** — Support multiple versions, gradual rollout, A/B testing

---

## References

### Full Research Documents
- `skill-system-comprehensive-research.md` — Complete 14-section technical analysis
- `skill-system-QUICK-REF.md` — Code snippets, tables, decision trees, debugging checklist

### Key Files
- Registry: `apps/web/server/services/skillRegistry.ts`
- Detector: `apps/web/server/services/skillDetector.ts` (also `packages/skills/src/detector.ts`)
- Executor: `apps/web/server/services/skillExecutor.ts`
- Chat router: `apps/web/server/routers/chat.ts` (executeSkill endpoint)
- Skill definitions: `apps/web/skills/*/skill.md` (46 files)
- Database: `apps/web/drizzle/schema.ts` (lines 1533–1555)

### Feature Flags
- Feature 038: Citation-gated content quality
- Feature 039: Task planner integration
- Feature 041: Intelligent skill model selection

---

## Questions Answered

**Q: How many skills are deployed?**
A: 46 skills across 11 categories. Only image-creator auto-triggers; the rest require explicit selection.

**Q: How does skill detection work?**
A: Regex pattern matching on user message. Checks enabled skills in priority order, returns first match with confidence score.

**Q: Can skills be chained automatically?**
A: No. chainTo metadata exists but isn't auto-executed. Frontend UI can display suggestions.

**Q: Can multiple skills run in parallel?**
A: No. Current architecture is single-skill sequential. Batch execution would require new API.

**Q: How are models selected for skills?**
A: Execution Policy (capability matching) → Planner → Skill pin → Conversation model → Default. Up to 5 fallback attempts.

**Q: Where are skill definitions stored?**
A: Both file system (`skills/*/skill.md`) and database (`skills` table). Auto-synced on startup via MD5 hash comparison.

**Q: How are skills executed?**
A: Via tRPC `chat.executeSkill` endpoint, routed by executionMode (llm-only, media-generate, python, sandbox-*).

**Q: What are the current pain points?**
A: No parallel execution, no NLP intent detection, no auto-chaining, single-output per invocation, no skill composition UI.

---

## Summary

SmartSpecPro has a **complete, production-ready skill system** with 46 deployed skills. The architecture is modular, extensible, and handles detection → execution → result → credit tracking. The main gaps are **orchestration-level** (parallelism, composition, intent matching) rather than core execution. These can be added incrementally without breaking existing skills.

**Strength**: Simple, deterministic, easy to extend (add new skill.md).
**Weakness**: No automation of complex workflows, detection requires exact pattern matches.
**Recommendation**: Start with batch execution API + improved chainTo UI before building full composition system.
