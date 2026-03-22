---
name: SmartSpecPro Skill System — Comprehensive Research
description: Full mapping of skill inventory (46 skills), detection/routing architecture, execution flows, chaining, parallel patterns, and current limitations
type: project
---

# SmartSpecPro Skill System — Comprehensive Research Brief

## Executive Summary

SmartSpecPro has a **multi-tier skill system** with 46 deployed skills across 8 categories. The system routes skills via:
1. **Auto-detection** (regex trigger patterns) or **explicit requests** (UI/slash commands)
2. **Single-skill execution** with per-skill model selection and credit routing
3. **Sequential chaining** (chainTo field) but NO parallel execution currently
4. **Backend routing** via `skillExecutor.ts` with 3 execution modes (LLM-only, media-generate, Python sandbox)

Current limitations: no batch/parallel skill execution, no skill composition/pipelines, detection is pattern-only (no NLP intent).

---

## Part 1: Skill Inventory (46 Skills)

### A. Media Generation Skills (8)

| Skill | Slug | Category | Auto-Trigger | Execution Mode | ChainTo |
|-------|------|----------|--------------|----------------|---------|
| Image Creator | `image-creator` | image_generation | YES (95 priority) | media-generate | null |
| Image Prompt Engineer | `image_prompt_engineer` | image_prompt_generation | NO | llm-only | null |
| Grok Imagine Prompt Planner | `grok-imagine-prompt-planner` | image_prompt_generation | NO | llm-only | null |
| Video Creator | `video-creator` | video_generation | NO | media-generate | null |
| Video Prompt Engineer | `video-prompt-engineer` | video_prompt_generation | NO | llm-only | null |
| Video Storyboard to Prompts | `video-storyboard-to-prompts` | video_prompt_generation | NO | llm-only | null |
| Audio Creator | `audio-creator` | audio_generation | NO | media-generate | null |
| Sound Effects Creator | `sound-effects-creator` | audio_generation | NO | media-generate | null |

### B. Content Writer Skills (10)

| Skill | Slug | Category | Auto-Trigger | Execution Mode |
|-------|------|----------|--------------|----------------|
| Marketing Article Writer | `marketing-article-writer` | article_generation | NO | llm-only |
| Lifestyle Article Writer | `lifestyle-article-writer` | article_generation | NO | llm-only |
| Business Article Writer | `business-article-writer` | article_generation | NO | llm-only |
| Documentary Script Writer | `documentary-script-writer` | article_generation | NO | llm-only |
| General Article Writer | `general-article-writer` | article_generation | NO | llm-only |
| Education Article Writer | `education-article-writer` | article_generation | NO | llm-only |
| Creative Story Writer | `creative-story-writer` | article_generation | NO | llm-only |
| Parenting Article Writer | `parenting-article-writer` | article_generation | NO | llm-only |
| Storyboard Writer | `storyboard-writer` | article_generation | NO | llm-only |
| Code Docs Assistant | `code-docs-assistant` | chat_assistant | NO | llm-only |

### C. Product Reviewer Skills (11)

| Skill | Slug | Category | Auto-Trigger | Execution Mode |
|-------|------|----------|--------------|----------------|
| Beauty/Skincare Reviewer | `beauty-skincare-reviewer` | product_review | NO | llm-only |
| Food/Grocery Reviewer | `food-grocery-reviewer` | product_review | NO | llm-only |
| Fashion/Clothing Reviewer | `fashion-clothing-reviewer` | product_review | NO | llm-only |
| Electronics Reviewer | `electronics-reviewer` | product_review | NO | llm-only |
| Home Appliance Reviewer | `home-appliance-reviewer` | product_review | NO | llm-only |
| Hardware/Renovation Reviewer | `hardware-renovation-reviewer` | product_review | NO | llm-only |
| Household Product Reviewer | `household-product-reviewer` | product_review | NO | llm-only |
| Real Estate Reviewer | `real-estate-reviewer` | product_review | NO | llm-only |
| Pet Products Reviewer | `pet-products-reviewer` | product_review | NO | llm-only |
| Agriculture/Garden Reviewer | `agriculture-garden-reviewer` | product_review | NO | llm-only |
| Baby/Kids Reviewer | `baby-kids-reviewer` | product_review | NO | llm-only |

### D. Specialist Skills (17)

| Skill | Slug | Category | Auto-Trigger | Execution Mode |
|-------|------|----------|--------------|----------------|
| Health/Wellness Reviewer | `health-wellness-reviewer` | product_review | NO | llm-only |
| Hobby/Craft Reviewer | `hobby-craft-reviewer` | product_review | NO | llm-only |
| Sports/Outdoor Reviewer | `sports-outdoor-reviewer` | product_review | NO | llm-only |
| Home Decor/Textile Reviewer | `home-decor-textile-reviewer` | product_review | NO | llm-only |
| Translation | `translation` | translation | NO | llm-only |
| Brainstorm | `brainstorm` | chat_assistant | NO | llm-only |
| Chat Alert | `chat-alert` | chat_assistant | NO | llm-only |
| Workflow AI Editor | `workflow-ai-editor` | automation | NO | llm-only |
| Viral Talking Objects | `viral-talking-objects` | video_generation | NO | media-generate |
| Cartoon Video Creator | `cartoon-video-creator` | video_generation | NO | media-generate |
| Cartoon Storyboard Prompts | `cartoon-storyboard-prompts` | article_generation | NO | llm-only |
| Veo Video Creator | `veo-video-creator` | video_generation | NO | media-generate |
| Smart Landscape Designer | `smart-landscape-designer` | automation | NO | llm-only |
| Nano Banana Infographic | `nano-banana-infographic` | automation | NO | llm-only |
| Agency Creator | `agency-creator` | automation | NO | llm-only |
| Intelligence Skill Creator | `intelligence-skill-creator` | automation | NO | llm-only |
| Presentation Layout Designer | `presentation-layout-designer` | automation | NO | llm-only |

**Summary**: 1 auto-trigger (image-creator at priority 95), 45 explicit-only. All 46 are enabled by default.

---

## Part 2: Skill Detection & Routing Architecture

### 2.1 Detection Flow

```
User Message
    ↓
detectSkill() [skillDetector.ts]
    ├─ Check if auto-detect enabled (skillSettings.autoDetect)
    ├─ Get enabled skill list (conversation preferences or defaults)
    ├─ For each skill (sorted by priority descending):
    │   ├─ Check triggers (regex patterns in skill.triggers[])
    │   ├─ Calculate confidence (0.7 base + bonuses for match position/media keywords)
    │   └─ Extract suggested prompt (content after trigger match)
    └─ Return first match with confidence or {detected: false}
```

**Key Points**:
- **Priority ordering**: Skills checked in priority descending order (image-creator is 95, brainstorm is 40)
- **Trigger patterns**: Array of regex patterns per skill (e.g., `["สร้างภาพ", "generate image", "create a image"]`)
- **Per-pattern chainTo**: Each trigger pattern can specify its own chainTo target (structured as `{pattern, chainTo, label}`)
- **Explicit slash commands**: `/image-creator`, `/video-creator`, etc. auto-routed by slug
- **User preferences**: Conversation-specific enable/disable in `skillPreferences` table

### 2.2 Trigger Pattern Structure

**Database schema** (`skills.triggerPatterns`):
```typescript
triggerPatterns: string[] | PatternRule[]

// PatternRule format:
interface PatternRule {
  pattern: string;      // Regex pattern string
  chainTo?: string;     // Optional skill slug to chain to
  label?: string;       // Optional label for admin UI
}
```

**Example** (from skill.md):
```yaml
triggerPatterns:
  - "สร้างภาพ|สร้างรูป|สร้างรูปภาพ"    # Thai patterns
  - "generate image|create image|make image"  # English patterns
  - "draw a|draw an|sketch a"                 # Alternative English
```

Auto-synced on startup via `autoSyncSkillsFromFolder()`:
- Reads `skill.md` frontmatter
- Calculates MD5 hash of content
- Updates DB if hash changed (preserves admin customizations for name/description)

### 2.3 Skill Preferences (Per-Conversation)

**Table**: `skillPreferences`
```sql
CREATE TABLE "skill_preferences" (
  id SERIAL PRIMARY KEY,
  conversationId INT NOT NULL REFERENCES conversations(id) ON DELETE cascade,
  skillId VARCHAR(80) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  priority INT DEFAULT 50,
  created TIMESTAMP,
  updated TIMESTAMP,
  UNIQUE(conversationId, skillId)
);
```

**Preference lookup**:
1. If conversation has prefs for skillId → use enabled/priority
2. Else use `skill.enabledByDefault` (all 46 are true)
3. User visibility layer: `userSkillVisibility` table gates restricted skills (`visibleByDefault=false`)

---

## Part 3: Skill Execution Architecture

### 3.1 Execution Routes (by `executionMode`)

**Routing Decision Tree**:

```
executeSkill(skill, params, userId)
  ├─ Rate limit check (per userId:skillType, window 60s)
  │
  ├─ executionMode = "llm-only" / "core-text" / "enhance-prompt"
  │   └─ Return type:"text", message: userPrompt
  │       (LLM will process via chat router, not here)
  │
  ├─ executionMode starts with "sandbox-" OR (media-generate + sandboxEnabled)
  │   ├─ Check shouldUseSandboxForFeature()
  │   └─ executeSandboxSkill() → dispatch to OpenSandbox
  │
  ├─ executionMode = "python"
  │   └─ executePythonSkill() → subprocess exec (legacy, fallback from sandbox)
  │
  ├─ skill.type = "image-generation"
  │   └─ executeImageGeneration() → mediaGenerationService.generateImage()
  │
  ├─ skill.type = "video-generation"
  │   └─ executeVideoGeneration() → mediaGenerationService.generateVideo() (async, returns taskId)
  │
  ├─ skill.type = "audio-generation"
  │   └─ executeAudioGeneration() → mediaGenerationService.generateAudio()
  │
  └─ Other types (chat-assistant, automation, etc.)
      └─ Error: "Skill type requires executionMode: python or LLM handler"
```

### 3.2 Model Selection for Skills

**Cascade** (in priority order):

1. **Execution Policy** (Feature 041 — capability-first):
   - If skill has `executionPolicy.requirements` (e.g., supportsVision)
   - Match models against capability matrix
   - Select cheapest/fastest/best based on `preferredStrategy`

2. **Planner** (Feature 039):
   - `runPlanner()` called with sourceType="skill"
   - Returns `plannerResult.resolvedModel` if planner active

3. **Skill pinning** (Feature 041):
   - `skill.llmModelId` → use this model for this skill
   - `skill.preferredProviderId` + `strictProviderPin` → enforce provider

4. **Conversation model**:
   - User's selected model in conversation
   - Used as fallback or override context

5. **Global default**:
   - `getDefaultModel(type)` for media skills
   - System default LLM for text skills

**Fallback chain**: If selected model fails, `executeSkillLlmWithFallback()` tries up to 5 models in capability order before failing.

### 3.3 Skill Execution Pipeline (tRPC `chat.executeSkill`)

```
POST /trpc/chat.executeSkill
  Input: { skillId, prompt, conversationId?, model?, extraParams?, ... }

  ├─ Rate limit check + abuse guard (duplicate/burst detection)
  ├─ Load skill from registry
  ├─ Authorization check (visibleByDefault or explicit userSkillVisibility)
  ├─ Sync skill content if skill.md changed (syncSingleSkillIfChanged)
  │
  ├─ executionMode = "llm-only"
  │   ├─ Load systemPrompt + knowledgebase from DB
  │   ├─ Build multimodal messages (text + referenceImages as image_url)
  │   ├─ Resolve model via execution policy → planner → skill pin → fallback
  │   ├─ executeSkillLlmWithFallback() with intelligent retry (5 attempts)
  │   ├─ Deduct credits + record planner step
  │   └─ Save assistant message to conversation
  │       Return: {success, skillId, type:"text", message, creditsUsed}
  │
  ├─ executionMode = "python"
  │   ├─ startPythonSkillTask() → async Celery task
  │   ├─ Return immediately with taskId
  │   └─ Client polls getSkillTaskResult() for status/result
  │       Return: {success, skillId, type:"sandbox-job", jobId, isAsync:true}
  │
  └─ skill.type = "image-generation" / "video-generation" / "audio-generation"
      ├─ Check credit balance
      ├─ mediaGenerationService.generate*()
      ├─ Deduct credits (done by Python backend via gateway)
      ├─ Record task planner step
      └─ Return: {success, skillId, type:"image|video|audio", resultUrl(s), creditsUsed}
```

### 3.4 Credit Deduction

**Media skills** (image/video/audio):
- Cost calculated via `calculateCreditCost(modelMeta, params)`
- Deducted by Python backend during `generateImage/Video/Audio()`
- NOT deducted again in Node.js (would double-charge)

**LLM skills**:
- After successful `executeSkillLlmWithFallback()`
- `deductCreditsForModel()` using actual tokens from LLM response
- Recorded in `creditTransactions` + conversation summary

**Python sandbox skills**:
- Deducted in Python backend based on Celery task result

---

## Part 4: Skill Chaining

### 4.1 ChainTo Architecture

**Source of chain target**:

1. **Per-pattern chainTo** (highest priority):
   - `skill.triggers[].chainTo` — each trigger pattern can specify its own next skill
   - Returned in detection result as `patternChainTo`

2. **Skill-level chainTo**:
   - `skill.chainTo` — default chain target for this skill
   - Fallback if pattern-level not specified

**Example** (from skill.md frontmatter):
```yaml
name: Image Prompt Engineer
category: image_prompt_generation
chainTo: image-creator  # After this skill completes, auto-chain to image-creator

triggerPatterns:
  - pattern: "optimize image prompt"
    chainTo: image-creator  # This pattern overrides skill.chainTo
  - pattern: "engineer prompt"
    # Uses skill-level chainTo
```

### 4.2 Current Chaining Limitations

**What works**:
- Single sequential chain: Skill A → Skill B
- Stored in DB (`skills.chainTo`)
- Returned to UI in detection result (`patternChainTo`)

**What doesn't exist**:
- No automatic execution of chained skills (must be UI/manual)
- No chain validation (circular refs allowed)
- No chain composition UI
- No conditional chaining (if/then branching)
- No multiple outputs from one skill feeding into multiple next skills

**Current usage**: Skills are aware of chainTo via detection result, but execution is always single-skill. Frontend UI would need to implement chain invocation logic.

---

## Part 5: Parallel & Batch Execution

### Current State: **NO PARALLEL EXECUTION**

**What exists**:
- Single skill execution per request
- Async media tasks (returns taskId, client polls result)
- Celery workers for Python skills (async but sequential per user)

**What doesn't exist**:
- No batch skill execution (POST multiple skills at once)
- No parallel skill invocation
- No skill composition/pipelines
- No DAG execution
- No fork/join patterns

**Rate limits** (prevent accidental parallelism):
```typescript
const RATE_LIMITS: Record<string, number> = {
  "image-generation": 10,     // 10 per minute
  "video-generation": 15,     // 15 per minute
  "audio-generation": 10,     // 10 per minute
};
const DEFAULT_RATE_LIMIT = 20; // 20 per minute for others
```

---

## Part 6: Current Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│  - Chat input + Media Studio                                 │
│  - SkillPicker (list all 46 skills)                          │
│  - Explicit skill request (/image-creator) or auto-detect    │
│  - DynamicSkillForm (reads skill.configJson, renders inputs) │
└────────────┬────────────────────────────────────────────────┘
             │ tRPC chat.detectSkill
             │ tRPC chat.executeSkill
             ↓
┌─────────────────────────────────────────────────────────────┐
│              Backend (Express + tRPC)                        │
├─────────────────────────────────────────────────────────────┤
│  server/routers/chat.ts                                      │
│    ├─ detectSkill() → skillDetector.detectSkill()           │
│    └─ executeSkill() → skillExecutor.executeSkill()         │
│                                                              │
│  server/services/skillDetector.ts                            │
│    └─ Pattern matching + confidence scoring                  │
│                                                              │
│  server/services/skillExecutor.ts                            │
│    ├─ LLM route → executeSkillLlmWithFallback()             │
│    ├─ Image route → mediaGenerationService                   │
│    ├─ Video route → mediaGenerationService (async)           │
│    ├─ Audio route → mediaGenerationService                   │
│    └─ Sandbox route → OpenSandbox dispatch                   │
│                                                              │
│  server/services/skillRegistry.ts                            │
│    └─ Load skills from DB, auto-sync from skill.md files    │
│                                                              │
│  server/services/skillExecutionPolicy.ts                     │
│    └─ Capability-first model selection (Feature 041)         │
└────────┬──────────────┬──────────────┬───────────────────────┘
         │              │              │
         ↓              ↓              ↓
    ┌─────────┐  ┌──────────────┐  ┌──────────────┐
    │ LLM API │  │ Media API    │  │ Python/      │
    │ Gateway │  │ (Kie.ai,     │  │ OpenSandbox  │
    │         │  │  FAL.ai)     │  │              │
    │ GPT-4o  │  │              │  │ Celery       │
    │ Claude  │  │ FFmpeg       │  │ Workers      │
    │ Mixtral │  │ ImageGen     │  │              │
    └─────────┘  └──────────────┘  └──────────────┘
         │              │              │
         └──────────────┼──────────────┘
                        ↓
                ┌──────────────────┐
                │  Audit Logs      │
                │  & Metrics       │
                │  (JSONL, DB)     │
                └──────────────────┘
```

---

## Part 7: Skill File Structure

Each skill lives in `apps/web/skills/{slug}/`:

```
{slug}/
├── skill.md                    # Markdown prompt + YAML frontmatter
├── SKILL.md                    # (Optional) Implementation notes
├── schemas/
│   ├── input.schema.json       # Standard JSON Schema for validation
│   └── ui.schema.json          # Custom UI schema (Thai labels, icons, sections)
├── python/                     # (Optional) For sandbox skills
│   └── skill.py                # Python entry point
├── references/                 # (Optional) Implementation docs
│   ├── *.md
│   └── ...
└── ...
```

**YAML Frontmatter Keys** (from `skill.md`):
```yaml
name: string                              # Display name
description: string                       # Short description
category: string                          # Enum: image_generation, chat_assistant, etc.
version: string                           # SemVer (e.g., "1.0.0")
author: string                            # Author name
icon: string                              # Lucide icon name (e.g., "image", "sparkles")
tags: string[]                            # Categories (e.g., ["image", "media"])

# Trigger patterns
isAutoTrigger: boolean                    # Whether to auto-detect (default: false)
enabledByDefault: boolean                 # Whether enabled for new conversations (default: true)
triggerPatterns: (string|PatternRule)[]  # Regex patterns + optional chainTo
priority: number                          # Detection priority (higher = checked first)

# Execution & routing
executionMode: string                     # llm-only | core-text | python | sandbox-*
defaultModel: string                      # Default LLM model for this skill
llmModelId: string                        # Pinned LLM model (overrides default)
preferredProviderId: number                # Pinned provider (e.g., 5 for Anthropic)
strictProviderPin: boolean                # If true, never fall back from preferredProviderId

# Chaining
chainTo: string                           # Default next skill slug (e.g., "image-creator")

# Sandbox
sandboxProfile: string                    # Sandbox security profile slug
requiresNetwork: boolean                  # Network access required
requiresBrowser: boolean                  # Browser access required
maxRuntimeSeconds: number                 # Timeout (e.g., 30)
maxInputMb: number                        # Input size limit

# Advanced
creditMultiplier: number                  # Cost multiplier (default: 1.0)
config: object                            # Custom config (skill-specific)
execution_policy: object                  # Capability-first model selection (Feature 041)

# Content quality (Feature 038)
content_quality:
  citation_required_for: string[]         # Severity levels: critical|major|minor
  min_citation_coverage: number           # 0.0-1.0
  disclosure_required: boolean            # Require disclosure statement
  refresh_cadence_days: number            # How often to refresh (null = never)
```

---

## Part 8: Current Limitations & Pain Points

### 1. **No Parallel Skill Execution**
- **Impact**: User must wait for Skill A to complete before invoking Skill B
- **Use case**: Generate 5 images from different prompts → must invoke image-creator 5 times sequentially
- **Solution needed**: Batch API, queue-based dispatch, or skill composition graph

### 2. **Detection is Pattern-Only**
- **Impact**: No NLP intent matching, only regex
- **Example**: "Help me write an article about cooking" won't auto-detect `marketing-article-writer`
- **Solution needed**: LLM-based intent classifier (optional auto-detect path)

### 3. **No Skill Composition/Pipelines**
- **Impact**: Cannot express multi-step workflows (article → images → video)
- **ChainTo exists** but is never auto-executed
- **Solution needed**: Workflow builder or skill DAG support

### 4. **No Conditional Chaining**
- **Impact**: Chain targets are fixed, no branching (if output contains X, chain to Y)
- **Solution needed**: JSONLogic or simple condition language

### 5. **Single-Output Skills**
- **Impact**: Each skill invocation produces one result
- **Use case**: Generate article + auto-generate 3 hero images (needs parallel + batch)
- **Solution needed**: Skill result arrays, multi-artifact support

### 6. **No Skill Composition UI**
- **Impact**: Users can't visually build skill chains
- **Solution needed**: Node editor (like workflow builder)

### 7. **Model Selection is Skill-Centric**
- **Impact**: Each skill independently selects model, no cross-skill optimization
- **Example**: Image prompt engineer uses Claude, image-creator uses GPT → inconsistent
- **Solution needed**: Conversation-level model coordination

### 8. **Limited Skill Input Validation**
- **Impact**: Custom skills (via ISC) validated against blacklist, not schema
- **Solution needed**: JSON Schema enforcement for all skill inputs

### 9. **Skill Mutation/Updates Race Condition**
- **Impact**: If user updates skill while it's executing, might get old/new content
- **Solution needed**: Version locking or snapshot-on-execute

---

## Part 9: Key Files & Line References

### Skill Registry & Detection
| File | Lines | Purpose |
|------|-------|---------|
| `server/services/skillRegistry.ts` | 1–800 | Load skills from DB, auto-sync from `skills/*/skill.md` |
| `packages/skills/src/detector.ts` | 1–268 | Pure pattern matching logic (no DB dependency) |
| `server/services/skillDetector.ts` | 1–323 | Server-side detection with user preferences |

### Execution
| File | Lines | Purpose |
|------|-------|---------|
| `server/services/skillExecutor.ts` | 1–1000+ | Route skill by executionMode, handle all execution types |
| `server/services/skillModelFallback.ts` | 1–500+ | Intelligent fallback for LLM skills (5 attempts) |
| `server/services/skillExecutionPolicy.ts` | 1–200+ | Feature 041: capability-first model selection |
| `server/routers/chat.ts` | 1292–1750 | tRPC `executeSkill` endpoint |

### Schema & Types
| File | Lines | Purpose |
|------|-------|---------|
| `packages/skills/src/types.ts` | 1–450 | SkillDefinition, SkillExecutionPolicyConfig, etc. |
| `drizzle/schema.ts` | 1533–1555 | `skillPreferences` table |

### Skill Definitions
| File | Purpose |
|------|---------|
| `apps/web/skills/*/skill.md` | 46 skill frontmatter + markdown content |

---

## Part 10: Data Flow Examples

### Example 1: Auto-Detect Image Creator

```
User: "create a picture of a cat"
  ↓
detectSkill(message, conversationId, skillSettings)
  ├─ Iterate enabled skills in priority order
  ├─ image-creator (priority 95) has trigger "create.*image|create.*picture"
  ├─ Match found, confidence 0.85
  └─ Return {detected: true, skill: {id:"image-creator", ...}, confidence:0.85, matchedTrigger:"create a picture"}
  ↓
Frontend shows suggestion badge: "[Detected: Image Creator (85% confidence)]"
User clicks to execute or confirms
  ↓
executeSkill({skillId:"image-creator", prompt:"create a picture of a cat"})
  ├─ Load skill.md content → systemPrompt
  ├─ Create LLM messages: [{role:"system", content:systemPrompt}, {role:"user", content:prompt}]
  ├─ Resolve model: image-creator.llmModelId || conversation.model || getDefaultModel()
  ├─ executeSkillLlmWithFallback()
  │   └─ Claude generates optimized JSON: {"prompt":"...", "aspectRatio":"16:9", ...}
  ├─ mediaGenerationService.generateImage(optimizedPrompt)
  │   └─ Python backend: kie.ai or FAL.ai → image URL
  ├─ Deduct credits
  └─ Return {success:true, resultUrl:"https://cdn.../image.jpg", creditsUsed:50}
```

### Example 2: Explicit Slash Command

```
User: "/video-prompt-engineer optimize my video idea"
  ↓
isExplicitSkillRequest(message)
  ├─ Extract command: "video-prompt-engineer"
  ├─ Match against skill.id in registry
  └─ Return {isExplicit:true, skillId:"video-prompt-engineer"}
  ↓
executeSkill({skillId:"video-prompt-engineer", prompt:"optimize my video idea"})
  ├─ Load skill from registry
  ├─ executionMode = "llm-only"
  ├─ Resolve model → executeSkillLlmWithFallback()
  │   └─ LLM generates structured video prompt
  ├─ If skill.chainTo = "video-creator":
  │   └─ Frontend would detect and offer to chain (manual UI interaction)
  └─ Return {success:true, message:"Optimized video prompt: ...", creditsUsed:25}
```

### Example 3: ConversationPreferences Override

```
Conversation A: skillPreferences = [{skillId:"image-creator", enabled:false}, ...]
User in Conversation A: "create an image"
  ↓
detectSkill(message, conversationId=5, ...)
  ├─ Load skillPreferences for conversation 5
  ├─ image-creator is disabled for this conversation
  ├─ Skip image-creator during detection loop
  └─ Return {detected:false}
  ↓
Frontend: "Image creation is disabled for this conversation. Enable in settings?"
```

---

## Summary Table: System Properties

| Property | Value |
|----------|-------|
| **Total Skills** | 46 |
| **Auto-Trigger Skills** | 1 (image-creator) |
| **Explicit-Only Skills** | 45 |
| **Execution Modes** | 4: llm-only, media-generate, python, sandbox-* |
| **Detection Method** | Regex pattern matching (priority-ordered) |
| **Chaining Support** | Sequential only (chainTo field), not auto-executed |
| **Parallel Execution** | None currently |
| **Max Priority** | 95 (image-creator) |
| **Min Priority** | 40 (brainstorm, others) |
| **Rate Limit** | Per userId:skillType, 60s window |
| **Credit System** | Per-skill multiplier + model-based pricing |
| **Model Selection** | Execution Policy (Feature 041) → Planner → Skill Pin → Fallback |
| **Sandbox Support** | OpenSandbox integration (when enabled) |

---

## Recommendations for Future Enhancements

### Priority 1 (High-Impact, Low-Risk)
1. **LLM-based intent detection** — Add optional NLP path alongside pattern matching
2. **Skill result caching** — Cache skill outputs per (userId, skillId, paramHash) for 1 hour
3. **Batch skill execution** — Allow POST array of skill requests, execute sequentially, return array of results
4. **Chain auto-execution** — Automatically invoke chainTo skill after parent completes (if user opts in)

### Priority 2 (Medium-Impact, Medium-Risk)
1. **Skill composition UI** — Node editor to visually design skill workflows
2. **Conditional chaining** — Simple condition language (if output matches pattern → chain to X)
3. **Skill result pass-through** — Parent skill result can populate child skill inputs
4. **Parallel skill execution** — Queue multiple skills, return results as each completes

### Priority 3 (Low-Impact, Higher-Risk)
1. **Multi-output skills** — Skills that return arrays of results (e.g., 5 image prompts)
2. **Cross-skill model optimization** — Conversation picks 1 model, all text skills use it
3. **Skill versioning** — Multiple versions of same skill, user selects which to use
4. **Skill dependencies graph** — Validate no circular chains, detect unreachable skills
