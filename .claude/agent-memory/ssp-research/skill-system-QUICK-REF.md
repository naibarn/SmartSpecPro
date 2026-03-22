---
name: Skill System Quick Reference
description: Fast lookup tables, code snippets, detection decision tree, execution routing, skill list by category
type: project
---

# Skill System — Quick Reference Guide

## Fast Lookup: Skill Categories & Counts

| Category | Count | Auto-Trigger | Examples |
|----------|-------|--------------|----------|
| image_generation | 1 | 1 | image-creator |
| image_prompt_generation | 2 | 0 | image_prompt_engineer, grok-imagine-prompt-planner |
| video_generation | 4 | 0 | video-creator, veo-video-creator, viral-talking-objects, cartoon-video-creator |
| video_prompt_generation | 2 | 0 | video-prompt-engineer, video-storyboard-to-prompts, cartoon-storyboard-prompts |
| audio_generation | 2 | 0 | audio-creator, sound-effects-creator |
| article_generation | 8 | 0 | marketing-article-writer, business-article-writer, etc. |
| product_review | 11 | 0 | beauty-skincare-reviewer, electronics-reviewer, etc. |
| chat_assistant | 4 | 0 | brainstorm, code-docs-assistant, chat-alert, workflow-ai-editor |
| translation | 1 | 0 | translation |
| automation | 3 | 0 | smart-landscape-designer, nano-banana-infographic, intelligence-skill-creator, agency-creator, presentation-layout-designer |
| **TOTAL** | **46** | **1** | image-creator (priority 95) |

---

## Detection Decision Tree

```
User message → detectSkill(message, conversationId, skillSettings, userId)
  │
  ├─ skillSettings.autoDetect === false?
  │   └─ RETURN {detected: false}
  │
  ├─ Load conversation skillPreferences (if conversationId provided)
  │   ├─ If preferences exist: use them
  │   └─ Else: use default enabled skills (all 46 are enabledByDefault: true)
  │
  ├─ Filter by user visibility (userSkillVisibility table if userId provided)
  │   └─ Remove skills where visibleByDefault=false AND user has no explicit access
  │
  ├─ FOR each skill in priority descending order (95 → 40):
  │   └─ Skip if not in enabledSkillIds set
  │       │
  │       ├─ FOR each trigger pattern in skill.triggers:
  │       │   ├─ Try regex match against message
  │       │   │
  │       │   ├─ MATCH FOUND?
  │       │   │   ├─ confidence = calculateConfidence(message, matchedText, skill)
  │       │   │   │   ├─ Base: 0.7
  │       │   │   │   ├─ +0.15 if match at start of message
  │       │   │   │   ├─ +0.1 if skill.type="image-generation" AND match contains "image|picture|photo"
  │       │   │   │   ├─ +0.1 if skill.type="video-generation" AND match contains "video|clip|animation"
  │       │   │   │   └─ Clamp to [0, 1]
  │       │   │   │
  │       │   │   ├─ suggestedPrompt = extractPrompt(message, matchedTrigger)
  │       │   │   │   └─ Strip trigger + prepositions: "of", "about", "for", "with", "showing"
  │       │   │   │
  │       │   │   └─ RETURN {
  │       │   │       detected: true,
  │       │   │       skill: {...},
  │       │   │       confidence,
  │       │   │       matchedTrigger,
  │       │   │       suggestedPrompt,
  │       │   │       patternChainTo: trigger.chainTo ?? null
  │       │   │     }
  │       │   │
  │       │   └─ NO MATCH: continue to next pattern
  │
  └─ NO MATCHES: RETURN {detected: false, skill: null, confidence: 0, ...}
```

---

## Execution Routing by executionMode

```
executeSkill(skill, params, userId, userToken, tenantId)
  │
  ├─ Rate limit check: RATE_LIMITS[skill.type] per 60s
  │   └─ image-generation: 10/min | video-generation: 15/min | audio-generation: 10/min | default: 20/min
  │
  ├─ executionMode = "llm-only" || "core-text" || "enhance-prompt"?
  │   ├─ Return type:"text", message: params.prompt
  │   └─ (Chat router will process this via LLM)
  │
  ├─ executionMode starts with "sandbox-" || (media-generate AND sandboxEnabled)?
  │   ├─ shouldUseSandboxForFeature("skill", sandboxMode)?
  │   │   └─ executeSandboxSkill() → dispatch to OpenSandbox
  │   └─ If sandbox unavailable and mode="required": error
  │
  ├─ executionMode = "python"?
  │   ├─ startPythonSkillTask() → Celery async task
  │   └─ Return type:"sandbox-job", jobId, isAsync:true (client polls result)
  │
  ├─ skill.type = "image-generation"?
  │   ├─ executeImageGeneration()
  │   ├─ Resolve model → mediaGenerationService.generateImage()
  │   ├─ Return type:"image", resultUrl, resultUrls
  │   └─ Credits deducted by Python backend
  │
  ├─ skill.type = "video-generation"?
  │   ├─ executeVideoGeneration() (async)
  │   ├─ mediaGenerationService.generateVideo()
  │   ├─ Return type:"video", taskId, isAsync:true
  │   └─ Client polls for completion
  │
  ├─ skill.type = "audio-generation"?
  │   ├─ executeAudioGeneration()
  │   ├─ mediaGenerationService.generateAudio()
  │   └─ Return type:"audio", resultUrl
  │
  └─ Other types (chat-assistant, automation, etc.)
      └─ Error: "Skill type requires executionMode: python or LLM handler"
```

---

## Model Selection Cascade for Skills

```
resolveSkillExecutionPolicy({ skill, conversationModel })
  │
  ├─ Execution Policy (Feature 041)?
  │   ├─ skill.executionPolicy.mode = "requirements"?
  │   │   └─ Match models against capability matrix
  │   │   └─ Select by preferredStrategy: "cheapest" | "fastest" | "best"
  │   │
  │   ├─ mode = "fixed"?
  │   │   └─ Use skill.executionPolicy.fixedModel ONLY
  │   │
  │   └─ mode = "hybrid"?
  │       ├─ Try fixedModel first
  │       └─ Fall back to requirements-based
  │
  ├─ Planner (Feature 039)?
  │   └─ plannerResult.resolvedModel?
  │       └─ USE THIS (takes precedence over skill settings)
  │
  ├─ Skill pinning?
  │   ├─ skill.llmModelId? (explicit model for this skill)
  │   ├─ skill.preferredProviderId + strictProviderPin?
  │   └─ Use pinned model, fail if unavailable (if strictProviderPin=true)
  │
  ├─ Conversation model?
  │   └─ User's selected model in this conversation
  │   └─ Use as fallback
  │
  └─ Global default?
      └─ getDefaultModel(mediaType) for media skills
      └─ System default LLM for text skills
```

**Fallback chain** (if selected model fails):
```
executeSkillLlmWithFallback()
  ├─ Attempt 1: Primary model
  ├─ Attempt 2-5: Alternative models from capability matrix
  └─ Max 5 attempts before returning error
```

---

## Key Code Snippets

### Detect Skill

```typescript
import { detectSkill } from "../services/skillDetector";

const result = await detectSkill(
  message,
  conversationId,
  skillSettings,
  userId
);

if (result.detected && result.skill) {
  console.log(`Detected: ${result.skill.name} (${result.confidence * 100}% confidence)`);
  console.log(`Suggested prompt: ${result.suggestedPrompt}`);
  console.log(`Chain to: ${result.patternChainTo || result.skill.chainTo || "none"}`);
}
```

### Execute Skill (via tRPC)

```typescript
// Client: React hook
const result = await trpc.chat.executeSkill.mutate({
  skillId: "image-creator",
  prompt: "a cat wearing a hat",
  conversationId: 123,
  model: "gpt-4o-image",
  aspectRatio: "16:9",
  numImages: 2,
  extraParams: { /* custom form fields */ }
});

// Result shape:
// {
//   success: true,
//   skillId: "image-creator",
//   type: "image" | "video" | "audio" | "text" | "sandbox-job",
//   message?: string,            // For LLM skills
//   resultUrl?: string,          // For single media result
//   resultUrls?: string[],       // For multiple media results
//   creditsUsed?: number,
//   taskId?: string,             // For async media tasks
//   jobId?: string,              // For sandbox jobs
//   isAsync?: boolean,
//   error?: string
// }
```

### Load Skill from Registry

```typescript
import { getSkillByIdAsync, getAvailableSkillsAsync } from "../services/skillRegistry";

// Single skill
const skill = await getSkillByIdAsync("image-creator");
console.log(skill.id, skill.name, skill.executionMode, skill.chainTo);

// All skills
const all = await getAvailableSkillsAsync();
console.log(`${all.length} skills loaded`);

// By type
const imageSkills = all.filter(s => s.type === "image-generation");
```

### Sync Skill Content

```typescript
import { syncSingleSkillIfChanged } from "../services/skillRegistry";

// Called before executing a skill
const { synced, error } = await syncSingleSkillIfChanged("image-creator");
if (synced) {
  console.log("Skill content updated from skill.md");
}
```

### Check Skill Preferences

```typescript
import { getSkillPreferences, updateSkillPreference } from "../services/chatService";

// Get preferences for a conversation
const prefs = await getSkillPreferences(conversationId);
// Returns: [{ skillId: "image-creator", enabled: true, priority: 95 }, ...]

// Update preference
await updateSkillPreference(conversationId, "image-creator", {
  enabled: false,
  priority: 40
});
```

### Parse Skill File

```typescript
import { parseSkillFile } from "@smartspec/skills";

const content = fs.readFileSync("skills/image-creator/skill.md", "utf-8");
const parsed = parseSkillFile(content);

console.log(parsed.metadata); // { name, category, isAutoTrigger, ... }
console.log(parsed.content);  // Markdown content after frontmatter
```

---

## tRPC Endpoints

### Detection & Discovery

| Endpoint | Input | Output | Purpose |
|----------|-------|--------|---------|
| `chat.detectSkill` | `{message, conversationId?, skillSettings?}` | `SkillDetectionResult` | Auto-detect skill from message |
| `chat.getSkillSummary` | `{conversationId}` | `{enabledSkills, disabledSkills, skillSettings}` | List enabled/disabled skills |
| `chat.executeSkill` | `{skillId, prompt?, model?, extraParams?, ...}` | `SkillExecutionResult` | Execute a specific skill |
| `chat.getSkillTaskResult` | `{taskId, conversationId?}` | `{status, result, error}` | Poll result of async skill task |

### Skill Management

| Endpoint | Input | Output | Purpose |
|----------|-------|--------|---------|
| `chat.updateSkillPreference` | `{conversationId, skillId, enabled, priority}` | `{success}` | Enable/disable skill per conversation |
| `chat.batchUpdateSkillPreferences` | `{conversationId, preferences[]}` | `{success, updated}` | Bulk update preferences |

### Admin

| Endpoint | Input | Output | Purpose |
|----------|-------|--------|---------|
| `skills.list` | `{limit?, offset?}` | `{skills, total}` | List all skills |
| `skills.getDetails` | `{skillId}` | `{skill, inputSchema, uiSchema}` | Get skill metadata + schemas |
| `skills.updateSettings` | `{skillId, settings}` | `{success}` | Update skill (admin only) |

---

## Database Tables

### skills

```sql
CREATE TABLE "skills" (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(255),
  description TEXT,
  category VARCHAR(50),
  icon VARCHAR(50),
  version VARCHAR(20),
  author VARCHAR(100),
  tags JSON,

  -- Triggers & detection
  isAutoTrigger BOOLEAN DEFAULT false,
  triggerPatterns JSON,  -- string[] | PatternRule[]
  priority INT DEFAULT 50,

  -- Execution
  executionMode VARCHAR(50),  -- "llm-only" | "media-generate" | "python" | "sandbox-*"
  skillContent TEXT,
  systemPrompt TEXT,
  knowledgebase TEXT,
  configJson JSON,

  -- Chaining
  chainTo VARCHAR(80),  -- Next skill slug

  -- Model routing
  defaultModel VARCHAR(100),
  llmModelId VARCHAR(100),
  preferredProviderId INT,
  strictProviderPin BOOLEAN,

  -- Sandbox
  sandboxProfileSlug VARCHAR(100),
  requiresNetwork BOOLEAN,
  requiresBrowser BOOLEAN,
  maxRuntimeSeconds INT,
  maxInputMb INT,

  -- Execution policy (Feature 041)
  executionPolicyJson JSON,

  -- Cost & access
  creditMultiplier VARCHAR(20),  -- "1.0" | "2.5" | etc.
  visibleByDefault BOOLEAN DEFAULT true,
  enabledByDefault BOOLEAN DEFAULT true,
  isEnabled BOOLEAN DEFAULT true,

  -- Content tracking
  contentHash VARCHAR(32),  -- MD5 of skill.md
  folderPath VARCHAR(255),  -- "skills/image-creator"
  createdBy INT REFERENCES users(id),
  importSource VARCHAR(50),  -- "folder" | "db" | "isc"

  created TIMESTAMP,
  updated TIMESTAMP
);
```

### skill_preferences

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

### user_skill_visibility

```sql
CREATE TABLE "user_skill_visibility" (
  id SERIAL PRIMARY KEY,
  userId INT NOT NULL REFERENCES users(id) ON DELETE cascade,
  skillId INT NOT NULL REFERENCES skills(id) ON DELETE cascade,
  visible BOOLEAN DEFAULT true,
  created TIMESTAMP,
  UNIQUE(userId, skillId)
);
```

---

## Common Patterns

### 1. Load All Skills & Filter by Type

```typescript
const skills = await getAvailableSkillsAsync();
const mediaSkills = skills.filter(s =>
  s.type === "image-generation" ||
  s.type === "video-generation" ||
  s.type === "audio-generation"
);
```

### 2. Check If Skill Can Auto-Execute

```typescript
import { canAutoExecute } from "../services/skillExecutor";

if (canAutoExecute(skill)) {
  // Skill has executionMode that can be auto-run
  // (media-generate, python, sandbox-*)
}
```

### 3. Estimate Skill Cost

```typescript
import { estimateSkillCost } from "../services/skillExecutor";

const cost = estimateSkillCost(skill, params);
console.log(`This skill will cost ~${cost} credits`);
```

### 4. Build Skill Form (Dynamic UI)

```typescript
import { DynamicSkillForm } from "@/components/chat/DynamicSkillForm";

<DynamicSkillForm
  skill={skill}
  onSubmit={(formData) => {
    trpc.chat.executeSkill.mutate({
      skillId: skill.id,
      ...formData
    });
  }}
/>
```

### 5. Extract Media Parameters from Message

```typescript
import { extractMediaParams } from "@smartspec/skills";

const params = extractMediaParams("create 2 square high-quality images", "image-generation");
// { numImages: 2, aspectRatio: "1:1", quality: "high" }
```

---

## File Locations

| What | Path |
|------|------|
| All skills | `apps/web/skills/*/` |
| Skill registry service | `apps/web/server/services/skillRegistry.ts` |
| Skill detector service | `apps/web/server/services/skillDetector.ts` |
| Skill executor service | `apps/web/server/services/skillExecutor.ts` |
| Chat router (endpoints) | `apps/web/server/routers/chat.ts` |
| Execution policy resolver | `apps/web/server/services/skillExecutionPolicy.ts` |
| Model fallback logic | `apps/web/server/services/skillModelFallback.ts` |
| Skill types & schemas | `packages/skills/src/types.ts` |
| Skill parser | `packages/skills/src/parser.ts` |
| Skill detector (pure) | `packages/skills/src/detector.ts` |
| Database schema | `apps/web/drizzle/schema.ts` (lines 1533–1555) |

---

## Debugging Checklist

- [ ] Is `skillSettings.autoDetect` enabled?
- [ ] Is the skill enabled for this conversation? (`skillPreferences` table)
- [ ] Does user have visibility access? (`userSkillVisibility` table)
- [ ] Is the trigger pattern regex correct? (Test at regex101.com)
- [ ] Is skill loaded from database? (Check `skills` table)
- [ ] Is skill.md content synced? (Compare `contentHash`)
- [ ] Is executionMode supported? (llm-only|core-text|media-generate|python|sandbox-*)
- [ ] Is user's model available? (Check `llmModels` table, provider health)
- [ ] Does user have enough credits? (Check `creditTransactions`)
- [ ] Is rate limit hit? (Check `rateLimitMap` per userId:skillType)
- [ ] For media skills: is Python backend/Media API reachable?
- [ ] For sandbox skills: is OpenSandbox enabled?

---

## Quick Stats

| Metric | Value |
|--------|-------|
| Total skills | 46 |
| Categories | 11 |
| Auto-trigger skills | 1 |
| Explicit-only skills | 45 |
| Max skill priority | 95 (image-creator) |
| Execution modes | 4+ |
| Rate limit window | 60 seconds |
| Max feedback rounds (brainstorm) | 6 |
| Max image generation per request | 4 |
| Max video duration per request | 60 seconds |
| Sandbox file size limits | 8 MB total inline |
| Skill content validation | 50,000 char max |
| Credential storage | AES-256-GCM encrypted |
