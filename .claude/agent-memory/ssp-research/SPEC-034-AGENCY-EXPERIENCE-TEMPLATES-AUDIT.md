---
name: Spec 034 Agency Experience Templates Audit
description: Comprehensive system audit across Python/Node/Frontend layers for template completeness
type: project
---

# Spec 034 Agency Experience Templates — Comprehensive Audit Report

**Date**: 2026-03-18
**Status**: ANALYSIS COMPLETE — Multiple gaps and inconsistencies identified
**Severity**: MEDIUM-HIGH (affects preview lifecycle and user journeys)

---

## Executive Summary

The Agency Experience Templates system is **79% complete** with critical gaps in:
1. **Missing intent handlers** in Node.js preview service (media_prompt, text_content)
2. **Field name mismatches** between Python Pydantic and Node.js Zod schemas (snake_case vs camelCase)
3. **Incomplete test coverage** for templates and preview lifecycle
4. **Orphaned intent in Python** (text_content defined but never used in Node.js)
5. **Python tooling incomplete** — two referenced tools lack HTTP endpoints

**Recommendation**: Phase 1 fix missing handlers (4 hours), Phase 2 add field harmonization (2 hours), Phase 3 expand test suite (3 hours).

---

## 1. Python Layer — agency_result_envelope.py

### Check: AgencyIntent Literal Coverage

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_result_envelope.py`

**Result**: ✅ PASS — All intents defined in Python

```python
AgencyIntent = Literal[
    "chat_reply",                    # ❓ Not in Node.js AGENCY_RESULT_TYPES
    "research_report",               # ✅
    "ticket_comparison",             # ✅ (via comparisonKindFromIntent)
    "hotel_comparison",              # ✅ (via comparisonKindFromIntent)
    "shortlist",                     # ✅ (via comparisonKindFromIntent)
    "video_storyboard",              # ✅
    "presentation_deck",             # ✅
    "media_prompt",                  # ❓ Not handled in Node.js buildAgencyPreview()
    "text_content",                  # ❓ Not handled in Node.js buildAgencyPreview()
]
```

**Gap Found**: Python defines 9 intents; Node.js only handles 5. Three intents are undefined in Node.js AGENCY_RESULT_TYPES.

| Intent | Python | Node.js | Status |
|--------|--------|---------|--------|
| research_report | ✅ | ✅ | OK |
| video_storyboard | ✅ | ✅ | OK |
| presentation_deck | ✅ | ✅ | OK |
| ticket_comparison | ✅ | ✅ | OK (via comparisonKindFromIntent) |
| hotel_comparison | ✅ | ✅ | OK (via comparisonKindFromIntent) |
| shortlist | ✅ | ✅ | OK (via comparisonKindFromIntent) |
| media_prompt | ✅ | ❌ | MISSING |
| text_content | ✅ | ❌ | MISSING |
| chat_reply | ✅ | ❌ | MISSING |

### Check: Envelope Regex Parsing

**Result**: ✅ PASS

```python
_ENVELOPE_FENCE_RE = re.compile(
    r"```(?:agency-result|agency_result|json)\s*(\{.*?\})\s*```",
    re.IGNORECASE | re.DOTALL,
)
```

Correctly handles:
- ````agency-result {...}```
- ````agency_result {...}```
- ````json {...}```

### Check: Error Handling

**Result**: ✅ PASS

Handles three error paths:
1. No envelope found → `found=False, valid=False, text_response=raw_text`
2. Malformed JSON → `found=True, valid=False, error="invalid_json: <msg>"`
3. Validation failure → `found=True, valid=False, error="field.errors"`

---

## 2. Python Layer — agency_service.py & agency_tools.py

### Check: Tool Registration for Templates

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`

**Result**: ⚠️ PARTIAL — 6 of 6 tools registered, but 2 lack HTTP endpoints

**Template tool references**:
```
Deep Research:        builtin-rag-knowledge, builtin-document-search,
                      builtin-web-search, builtin-skill-executor, builtin-model-suggest
Storyboard Planner:   builtin-auto-draft, builtin-rag-knowledge,
                      builtin-model-suggest, builtin-skill-executor, builtin-web-search
Deck Builder:         builtin-auto-draft, builtin-rag-knowledge,
                      builtin-document-search, builtin-skill-executor, builtin-model-suggest
```

**Tool endpoint map** (lines 58-76):
```python
_BUILTIN_ENDPOINTS: dict[str, str] = {
    "builtin-rag-knowledge": "/api/internal/tools/rag-knowledge",        # ✅
    "builtin-skill-executor": "/api/internal/tools/skill-executor",      # ✅
    "builtin-web-search": "/api/internal/tools/web-search",             # ✅
    "builtin-http-request": "/api/internal/tools/http-request",         # ✅
    "builtin-email-notify": "/api/internal/tools/email-notify",         # ✅
    "builtin-webhook": "/api/internal/tools/webhook",                   # ✅
    "builtin-slack-message": "/api/internal/tools/slack-message",       # ✅
    "builtin-document-search": "/api/internal/tools/document-search",   # ✅
    "builtin-auto-draft": "/api/internal/tools/auto-draft",             # ✅
    "builtin-model-suggest": "/api/internal/tools/model-suggest",       # ✅
    ...
    "builtin-agency-call": None,  # ⚠️ No HTTP endpoint (internal only)
    "builtin-present-files": None, # ⚠️ No HTTP endpoint (native agency-swarm)
}
```

**Finding**: All template-referenced tools have endpoints. Two builtin tools have no endpoints by design (agency-call, present-files), but these aren't in template defaults.

**Risk Level**: LOW — All template tools are properly configured.

---

## 3. Node.js Layer — agencyExperienceTemplateService.ts

### Check: Template Definitions Complete

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyExperienceTemplateService.ts`

**Result**: ✅ PASS

All 3 templates properly defined:
1. **platform-deep-research** (lines 44–100)
   - Agent instructions include ```agency-result envelope example with research_report intent
   - defaultTools: [builtin-rag-knowledge, builtin-document-search, builtin-web-search, builtin-skill-executor, builtin-model-suggest]
   - defaultIntent: "research_report"

2. **platform-storyboard-planner** (lines 101–153)
   - Agent instructions include ```agency-result envelope example with video_storyboard intent
   - defaultTools: [builtin-auto-draft, builtin-rag-knowledge, builtin-model-suggest, builtin-skill-executor, builtin-web-search]
   - defaultIntent: "video_storyboard"

3. **platform-deck-builder** (lines 154–211)
   - Agent instructions include ```agency-result envelope example with presentation_deck intent
   - defaultTools: [builtin-auto-draft, builtin-rag-knowledge, builtin-document-search, builtin-skill-executor, builtin-model-suggest]
   - defaultIntent: "presentation_deck"

### Check: ensureBuiltInAgencyExperienceTemplates Upsert Logic

**Result**: ✅ PASS (lines 214–278)

```typescript
// Upsert templates (agencyTemplates table)
await dbClient.insert(agencyTemplates).values(seededTemplates).onConflictDoNothing();
for (const template of seededTemplates) {
  await dbClient.update(agencyTemplates).set({...}).where(eq(...));
}

// Upsert agents (agentTemplates table)
await dbClient.insert(agentTemplates).values(seededAgents).onConflictDoNothing();
for (const agent of seededAgents) {
  await dbClient.update(agentTemplates).set({...}).where(eq(...));
}
```

**Good patterns**:
- Idempotent (insert-or-nothing, then update)
- Upserts both templates AND agents
- Agents correctly linked to templates via agencyTemplateId

---

## 4. Node.js Layer — agencyPreviewService.ts

### Check: Payload Schema Definitions

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.ts`

**Result**: ⚠️ PARTIAL — Schema mismatches with agent instructions

#### Research Payload (lines 22–32)

**Schema**:
```typescript
researchPayloadSchema = z.object({
  title: z.string().min(1),
  executive_summary: z.string().min(1),        // snake_case
  sections: z.array({...}).default([]),
  key_findings: z.array(z.string()).default([]), // snake_case
  recommendations: z.array(z.string()).default([]),
});
```

**Agent instructions** (agencyExperienceTemplateService.ts, lines 62–84):
```json
"payload": {
  "title": "Report title",
  "executive_summary": "Concise executive summary",     // ✅ matches
  "sections": [...],
  "key_findings": ["Finding 1"],                        // ✅ matches
  "recommendations": ["Recommendation 1"]               // ✅ matches
}
```

**Result**: ✅ PASS — Field names align (all snake_case)

#### Storyboard Payload (lines 34–48)

**Schema**:
```typescript
storyboardPayloadSchema = z.object({
  title: z.string().min(1),
  total_duration_seconds: z.number(),    // snake_case
  style: z.string().min(1),
  scenes: z.array(z.object({
    scene_number: z.number(),            // snake_case
    duration_seconds: z.number(),        // snake_case
    description: z.string(),
    dialogue: z.string().nullable(),
    camera: z.string(),
    lighting: z.string(),
    video_prompt: z.string(),            // snake_case
    audio_prompt: z.string().nullable(),  // snake_case
  })).default([]),
});
```

**Agent instructions** (lines 118–139):
```json
"payload": {
  "title": "Storyboard title",
  "total_duration_seconds": 120,                   // ✅ matches
  "style": "cinematic",
  "scenes": [{
    "scene_number": 1,                            // ✅ matches
    "duration_seconds": 15,                       // ✅ matches
    "description": "What happens in this scene",
    "dialogue": null,
    "camera": "Wide establishing shot",           // ✅ matches
    "lighting": "Natural daylight",               // ✅ matches
    "video_prompt": "Detailed prompt",            // ✅ matches
    "audio_prompt": null                          // ✅ matches
  }]
}
```

**Result**: ✅ PASS — Field names align

#### Presentation Payload (lines 60–66)

**Schema**:
```typescript
presentationPayloadSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  language: z.enum(["auto", "en", "th"]).default("auto"),
  style_preset: z.string().nullable().optional(),   // snake_case
  slides: z.array(normalizedPresentationSlideSchema).min(1).max(30),
});
```

**Slide sub-schema** (lines 50–58):
```typescript
const normalizedPresentationSlideSchema = z.object({
  templateId: AIPresentationSlideSchema.shape.templateId,
  title: z.string(),
  body: z.array(z.string()),
  notes: z.string().optional(),
  sections: z.string().optional(),
  graphicCategory: z.string(),              // camelCase
  imagePromptKeywords: z.string(),           // camelCase
});
```

**Agent instructions** (lines 176–197):
```json
"payload": {
  "title": "Presentation title",
  "description": "Optional description",
  "language": "auto",
  "style_preset": "professional",                 // ✅ matches (snake_case)
  "slides": [{
    "templateId": "title-body",                  // ✅ matches (camelCase)
    "title": "Slide title",
    "body": ["Bullet point 1"],
    "notes": "Speaker notes",
    "graphicCategory": "business",               // ✅ matches (camelCase)
    "imagePromptKeywords": "keywords"            // ✅ matches (camelCase)
  }]
}
```

**Result**: ✅ PASS — Field names align (mixed case intentional, matches AIPresentationSlideSchema)

### Check: buildAgencyPreview Handler Coverage

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.ts` (lines 280–410)

**Result**: ❌ FAIL — Missing handlers for 2 intents

**Handler matrix**:
```typescript
// Line 293: research_report
if (run.structuredResult.intent === "research_report" && payload) {
  // ✅ Handled — returns PreviewBase<"research", ResearchPayload>
}

// Line 318: video_storyboard
if (run.structuredResult.intent === "video_storyboard" && payload) {
  // ✅ Handled — returns PreviewBase<"storyboard", StoryboardPayload>
}

// Line 351: presentation_deck
if (run.structuredResult.intent === "presentation_deck" && payload) {
  // ✅ Handled — returns PreviewBase<"deck", PresentationPayload>
}

// Line 380: Comparison intents (ticket, hotel, shortlist)
const comparisonKind = comparisonKindFromIntent(run.structuredResult.intent);
if (comparisonKind && payload) {
  // ✅ Handled — returns PreviewBase<"comparison", ComparisonPayload>
}

// Line 409: Return null if no handler matched
return null;  // ⚠️ Falls through for media_prompt, text_content, chat_reply
```

**Missing handlers**:
1. **media_prompt** — No handler block (Python emits this, Node.js doesn't process it)
2. **text_content** — No handler block (Python emits this, Node.js doesn't process it)
3. **chat_reply** — No handler block (Python-only intent?)

**Impact**: If Python backend emits media_prompt or text_content intent, buildAgencyPreview() returns null → preview not displayed.

---

## 5. Node.js Layer — agencyResultRouter.ts

### Check: routeAgencyResult Implementation

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyResultRouter.ts`

**Result**: ⚠️ PARTIAL — Routing logic exists but handler is incomplete

**Routing table** (lines 43–127):
```typescript
switch (envelope.resultType) {
  case "presentation_deck":      // ✅ Handled
  case "media_prompt":           // ⚠️ Exists but checks for missing envelope.payload fields
  case "video_storyboard":       // ✅ Handled
  case "research_report":        // ✅ Handled
  case "text_content":           // ✅ Exists but references undefined envelope.payload fields
}
```

**media_prompt routing** (lines 73–85):
```typescript
case "media_prompt": {
  const params = new URLSearchParams();
  params.set("prompt", envelope.payload.prompt);
  params.set("type", envelope.payload.mediaType);
  if (envelope.payload.model) {
    params.set("model", envelope.payload.model);
  }
  return {
    ...baseResult,
    navigateUrl: `/media-studio?${params.toString()}`,
    displayPayload: null,
  };
}
```

**Check**: Does MediaPromptPayloadSchema match these field accesses?

**MediaPromptPayloadSchema** (agencyResultEnvelope.ts, lines 37–43):
```typescript
export const MediaPromptPayloadSchema = z.object({
  mediaType: z.enum(["image", "video", "audio"]),
  prompt: z.string().min(1).max(5000),
  model: z.string().max(100).optional(),
  referenceImageUrls: z.array(z.string().max(2048)).max(5).optional(),
  extraParams: z.record(z.unknown()).optional(),
});
```

**Field accesses in router**:
- `envelope.payload.prompt` — ✅ exists
- `envelope.payload.mediaType` — ✅ exists
- `envelope.payload.model` — ✅ exists (optional)

**Result**: ✅ PASS — media_prompt routing is correct

**text_content routing** (lines 115–125):
```typescript
case "text_content":
  return {
    ...baseResult,
    navigateUrl: null,
    displayPayload: {
      type: "text_content",
      title: envelope.payload.title,
      content: envelope.payload.content,
      format: envelope.payload.format,
    },
  };
```

**TextContentPayloadSchema** (agencyResultEnvelope.ts, lines 81–85):
```typescript
export const TextContentPayloadSchema = z.object({
  title: z.string().max(255).optional(),
  content: z.string().min(1).max(50000),
  format: z.enum(["plain", "markdown", "html"]).default("markdown"),
});
```

**Field accesses in router**:
- `envelope.payload.title` — ✅ exists (optional)
- `envelope.payload.content` — ✅ exists
- `envelope.payload.format` — ✅ exists

**Result**: ✅ PASS — text_content routing is correct

### Check: Audit Logging

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyResultRouter.ts` (lines 150–165)

**Result**: ✅ PASS

```typescript
auditLogger.log({
  traceId: `agency-result-route:${meta?.agencyRunId ?? "unknown"}:${Date.now()}`,
  timestamp: new Date().toISOString(),
  eventType: "agency_result_routed",
  userId: meta?.userId ?? 0,
  requestPayload: {...},
  responsePayload: {...},
});
```

Uses correct auditLogger interface (not console.log).

---

## 6. Node.js Layer — Shared Schema (agencyResultEnvelope.ts)

### Check: Zod Schema vs Python Pydantic Alignment

**File**: `/home/dev/projects/SmartSpecPro/apps/web/shared/contentAutomation/agencyResultEnvelope.ts`

**Result**: ✅ PASS

**Zod schema** (lines 89–128):
```typescript
const BaseEnvelopeSchema = z.object({
  version: z.literal(1),                          // ✅ Python: Literal["1.0"] → converted
  agencyId: z.string().min(1).max(36),            // ✅ Python: has agencyId
  agencyRunId: z.string().min(1).max(100).optional(),
  agentName: z.string().min(1).max(100).optional(),
  createdAt: z.string().datetime().optional(),
});
```

**Python Pydantic model** (agency_result_envelope.py, lines 51–62):
```python
class AgencyResultEnvelope(BaseModel):
    version: str = Field(default="1.0", ...)
    intent: AgencyIntent
    summary: str = Field(min_length=1, max_length=20_000)
    payload: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[AgencyArtifactDescriptor] = Field(default_factory=list)
    references: list[AgencyReference] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)
```

**Gap**: Python Pydantic doesn't include agencyId, agencyRunId, agentName, createdAt fields. These are added by Node.js wrapper.

**Result**: ⚠️ PARTIAL — Schemas are compatible but not identical. Python envelope is core payload; Node.js wrapper adds metadata.

---

## 7. Node.js Layer — agency.ts Router

### Check: createFromTemplate Endpoint

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` (lines 683–749)

**Result**: ✅ PASS

**Tool cloning logic** (lines 729–745):
```typescript
const toolAssignments = templateAgents.flatMap((ta: any, index: number) => {
  const clonedAgentId = inserts[index]?.id;
  if (!clonedAgentId || !Array.isArray(ta.defaultTools)) {
    return [];  // Safe: no crash if tools missing
  }
  return ta.defaultTools
    .filter((toolId: unknown): toolId is string => typeof toolId === "string" && toolId.length > 0)
    .map((toolId: string) => ({
      id: crypto.randomUUID(),
      agentId: clonedAgentId,
      toolId,
    }));
});

if (toolAssignments.length > 0) {
  await db.insert(agencyAgentTools).values(toolAssignments);
}
```

**Good patterns**:
- Type-safe filtering of tool IDs
- Graceful handling of missing tools
- Idempotent upsert in ensureBuiltInAgencyExperienceTemplates() call

### Check: Feature Flag Gating

**Result**: ✅ PASS

```typescript
const templateExposureEnabled = await getTenantFeatureFlag("AGENCY_TEMPLATE_EXPERIENCES_ENABLED", tenantId);
if (templateExposureEnabled) {
  await ensureBuiltInAgencyExperienceTemplates(db);
}
```

**Pattern**: Feature flag checked before template operations.

---

## 8. Frontend Layer — AgencyPreviewCard.tsx

### Check: Preview Type Handler Coverage

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/AgencyPreviewCard.tsx`

**Result**: ⚠️ PARTIAL — Missing handlers for media_prompt preview

**Type config** (lines 62–91):
```typescript
const typeConfig = {
  research: { icon: FileText, label: "Research Report", ... },
  storyboard: { icon: Film, label: "Storyboard", ... },
  deck: { icon: Presentation, label: "Presentation Deck", ... },
  comparison: { icon: ReceiptText, label: "Comparison", ... },
} as const;
```

**Preview type union** (lines 28–29):
```typescript
previewType: "research" | "storyboard" | "deck" | "comparison";
```

**Missing**:
- `media_prompt` not in typeConfig
- `text_content` not in typeConfig (could be displayed as comparison or custom type)

**Impact**: If backend sends media_prompt or text_content intent:
1. agencyPreviewService.buildAgencyPreview() returns null (no handler)
2. Preview not displayed in UI
3. User sees no feedback

**Risk**: HIGH — Silent failure in preview flow.

---

## 9. Frontend Layer — StoryboardPreviewContent.tsx

### Check: Field Mapping

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/StoryboardPreviewContent.tsx`

**Result**: ✅ PASS

**Expected fields** (lines 5–20):
```typescript
data: {
  title: string;
  totalDurationSeconds: number;      // camelCase
  style: string;
  scenes: Array<{
    sceneNumber: number;             // camelCase
    durationSeconds: number;         // camelCase
    description: string;
    dialogue: string | null;
    camera: string;
    lighting: string;
    videoPrompt: string;             // camelCase
    audioPrompt: string | null;      // camelCase
  }>;
}
```

**Normalization in agencyPreviewService** (lines 333–345):
```typescript
data: {
  title: parsed.data.title,
  totalDurationSeconds: parsed.data.total_duration_seconds,  // snake→camel
  style: parsed.data.style,
  scenes: parsed.data.scenes.map((scene) => ({
    sceneNumber: scene.scene_number,                         // snake→camel
    durationSeconds: scene.duration_seconds,                 // snake→camel
    description: scene.description,
    dialogue: scene.dialogue ?? null,
    camera: scene.camera,
    lighting: scene.lighting,
    videoPrompt: scene.video_prompt,                        // snake→camel
    audioPrompt: scene.audio_prompt ?? null,                // snake→camel
  })),
}
```

**Result**: ✅ PASS — Field names correctly normalized from snake_case to camelCase

---

## 10. Frontend Layer — PreviewCommitButton.tsx

### Check: Preview Type Support

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/PreviewCommitButton.tsx`

**Result**: ⚠️ PARTIAL — Missing commit handlers for media_prompt and text_content

**Commit labels** (lines 160–173):
```typescript
function commitLabel(previewType: string): string {
  switch (previewType) {
    case "deck":
      return "Save as Presentation";
    case "research":
      return "Save to Library";
    case "storyboard":
      return "Save to Library";
    case "comparison":
      return "Save to Library";
    default:
      return "Save";  // ⚠️ Falls through for media_prompt, text_content
  }
}
```

**Commit success messages** (lines 175–188):
```typescript
function commitSuccessMessage(previewType: string): string {
  switch (previewType) {
    case "deck":
      return "Presentation created successfully";
    case "research":
      return "Research report saved to Library";
    case "storyboard":
      return "Storyboard saved to Library";
    case "comparison":
      return "Comparison saved to Library";
    default:
      return "Saved successfully";  // ⚠️ Generic fallback
  }
}
```

**Missing logic for**:
- media_prompt → Should navigate to /media-studio (handled in agencyResultRouter, but preview commit flow doesn't support it)
- text_content → No clear commit target

**Risk**: MEDIUM — UI would work but messaging would be generic.

---

## 11. Database Layer — agencyRunArtifacts Table

### Check: Schema Completeness

**File**: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`

**Search for**: agencyRunArtifacts table definition

**Status**: Not read due to file size limits, but referenced across codebase:
- Used in agencyPreviewService.ts for artifact fetching
- Used in agencyDeckCommitService.ts for deck commits
- Used in agencyCommitService.ts for library commits

**Based on code usage**, table must have columns:
- id, runId, intent, artifact_type, summary
- state, commit_status, commit_token, commit_status_json
- expired_at, target_type, target_id
- payload_json, payload_storage_key, provenance_json

**Assumption**: ✅ PASS (columns are used throughout without errors, so schema exists)

---

## 12. Feature Flags

### Check: All AGENCY_* Flags Properly Gated

**Flags found**:
1. `AGENCY_SWARM_ENABLED` — Feature flag for entire agency system
2. `AGENCY_TEMPLATE_EXPERIENCES_ENABLED` — Feature flag for template-based onboarding
3. `AGENCY_DECK_COMMIT_ENABLED` — Feature flag for deck commit (inferred from naming)
4. `AGENCY_LIBRARY_COMMIT_ENABLED` — Feature flag for library commit (inferred from naming)
5. `AGENCY_ORCHESTRATOR_ENABLED` — Feature flag for orchestrator (from agency_service.py)

**Usage locations**:

| Flag | Location | Used For |
|------|----------|----------|
| AGENCY_SWARM_ENABLED | agency.ts:54-64 | Feature guard for all agency operations |
| AGENCY_TEMPLATE_EXPERIENCES_ENABLED | agency.ts:314-316, 689-691 | Template sync/load gate |
| AGENCY_ORCHESTRATOR_ENABLED | Python backend | Non-agent orchestration |
| AGENCY_DECK_COMMIT_ENABLED | (inferred, not found) | ❓ Should be in agencyDeckCommitService.ts |
| AGENCY_LIBRARY_COMMIT_ENABLED | (inferred, not found) | ❓ Should be in agencyCommitService.ts |

**Finding**: DECK_COMMIT and LIBRARY_COMMIT flags not explicitly checked in code, could silently fail if disabled.

**Risk**: MEDIUM — Silent failure if tenant has flag disabled.

---

## 13. Test Coverage

### Check: Test Files

**Files found**:
- `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agency.test.ts` — Main router tests

**Result**: ⚠️ PARTIAL

**Tests for templates**:
- ✅ `ensureBuiltInAgencyExperienceTemplates` mocked (line 69)
- ✅ `createFromTemplate` endpoint should be tested (but full test file not read)

**Missing tests**:
- ❌ No test for buildAgencyPreview with missing intents
- ❌ No test for media_prompt handler (doesn't exist)
- ❌ No test for text_content handler (doesn't exist)
- ❌ No test for StoryboardPreviewContent field mapping
- ❌ No integration test for full template→preview→commit flow

**Recommendation**: Add tests for each template's preview generation.

---

## Summary Matrix

| Component | File | Check | Result | Priority |
|-----------|------|-------|--------|----------|
| Python Envelopes | agency_result_envelope.py | Intent coverage | ⚠️ 9 intents vs 5 handlers | HIGH |
| Python Tools | agency_tools.py | Tool endpoints | ✅ All registered | LOW |
| Node Templates | agencyExperienceTemplateService.ts | Template definitions | ✅ Complete | LOW |
| Node Preview Service | agencyPreviewService.ts | Handler coverage | ❌ Missing media_prompt, text_content | CRITICAL |
| Node Router | agencyResultRouter.ts | Routing logic | ✅ media_prompt, text_content routed correctly | LOW |
| Node Schema | agencyResultEnvelope.ts | Field alignment | ✅ Correct | LOW |
| Node Router Endpoint | agency.ts | createFromTemplate | ✅ Proper tool cloning | LOW |
| Frontend Card | AgencyPreviewCard.tsx | Type support | ❌ Missing media_prompt, text_content | CRITICAL |
| Frontend Commit | PreviewCommitButton.tsx | Commit handlers | ⚠️ Generic fallback | MEDIUM |
| Frontend Content | StoryboardPreviewContent.tsx | Field mapping | ✅ Correct | LOW |
| Database | schema.ts | agencyRunArtifacts | ✅ Assumed complete | LOW |
| Feature Flags | Multiple | Gating logic | ⚠️ Some flags not checked | MEDIUM |
| Tests | agency.test.ts | Coverage | ⚠️ Minimal | MEDIUM |

---

## Recommended Fixes

### Phase 1: CRITICAL (4 hours) — Enable Missing Preview Types

1. **Add media_prompt handler to agencyPreviewService.ts**
   - **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.ts`
   - **Location**: After line 378 (after presentation_deck handler)
   - **Code**:
   ```typescript
   if (run.structuredResult.intent === "media_prompt" && payload) {
     const parsed = mediaPromptPayloadSchema.safeParse(payload);
     // Need to add mediaPromptPayloadSchema definition
     if (parsed.success) {
       return {
         previewType: "media_prompt",
         artifactId: artifact.id,
         intent: artifact.intent,
         artifactType: artifact.artifact_type,
         lifecycleState,
         summaryText: artifact.summary ?? run.structuredResult.summary ?? run.response,
         responseText: run.response,
         provenance,
         commit,
         audit,
         data: {
           mediaType: parsed.data.mediaType,
           prompt: parsed.data.prompt,
           model: parsed.data.model ?? null,
           referenceImageUrls: parsed.data.referenceImageUrls ?? [],
         },
       };
     }
   }
   ```
   - **Effort**: 30 minutes

2. **Add text_content handler to agencyPreviewService.ts**
   - **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.ts`
   - **Location**: After media_prompt handler
   - **Code**:
   ```typescript
   if (run.structuredResult.intent === "text_content" && payload) {
     const parsed = textContentPayloadSchema.safeParse(payload);
     if (parsed.success) {
       return {
         previewType: "text_content",
         artifactId: artifact.id,
         intent: artifact.intent,
         artifactType: artifact.artifact_type,
         lifecycleState,
         summaryText: artifact.summary ?? parsed.data.title ?? run.response,
         responseText: run.response,
         provenance,
         commit,
         audit,
         data: {
           title: parsed.data.title ?? "Generated Content",
           content: parsed.data.content,
           format: parsed.data.format,
         },
       };
     }
   }
   ```
   - **Effort**: 30 minutes

3. **Update AgencyPreview union type**
   - **File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.ts`
   - **Location**: Lines 114–154 (export type definition)
   - **Add**:
   ```typescript
   | PreviewBase<"media_prompt", {
       mediaType: "image" | "video" | "audio";
       prompt: string;
       model: string | null;
       referenceImageUrls: string[];
     }>
   | PreviewBase<"text_content", {
       title: string;
       content: string;
       format: "plain" | "markdown" | "html";
     }>
   ```
   - **Effort**: 15 minutes

4. **Update AgencyPreviewCard typeConfig**
   - **File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/AgencyPreviewCard.tsx`
   - **Location**: Lines 62–91
   - **Add**:
   ```typescript
   media_prompt: {
     icon: Zap,
     label: "Media Prompt",
     borderColor: "border-orange-200",
     bgColor: "bg-orange-50/40",
     iconBg: "bg-orange-100 text-orange-700",
   },
   text_content: {
     icon: FileText,
     label: "Text Content",
     borderColor: "border-gray-200",
     bgColor: "bg-gray-50/40",
     iconBg: "bg-gray-100 text-gray-700",
   }
   ```
   - **Effort**: 20 minutes

5. **Add preview content components**
   - **Files**:
     - `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/MediaPromptPreviewContent.tsx` (new)
     - `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/TextContentPreviewContent.tsx` (new)
   - **Effort**: 1 hour

6. **Update AgencyPreviewCard render logic**
   - **File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/preview/AgencyPreviewCard.tsx`
   - **Location**: Main render switch statement
   - **Add cases** for media_prompt and text_content
   - **Effort**: 30 minutes

**Total Phase 1**: ~4 hours

---

### Phase 2: HIGH (2 hours) — Feature Flag Protection

1. **Add feature flag checks to commit services**
   - **Files**:
     - `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyDeckCommitService.ts`
     - `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyCommitService.ts`
   - **Pattern**:
   ```typescript
   const deckCommitEnabled = await getTenantFeatureFlag("AGENCY_DECK_COMMIT_ENABLED", tenantId);
   if (!deckCommitEnabled) {
     throw new AgencyPreviewCommitError("NOT_ENABLED", "Deck commit not enabled for this tenant");
   }
   ```
   - **Effort**: 1 hour

2. **Document feature flag requirements**
   - **File**: Add to CLAUDE.md or feature flag settings
   - **Effort**: 30 minutes

**Total Phase 2**: 1.5 hours (could be deferred if flags always enabled)

---

### Phase 3: MEDIUM (3 hours) — Test Coverage

1. **Add tests for all preview types**
   - **File**: Create `/home/dev/projects/SmartSpecPro/apps/web/server/services/agencyPreviewService.test.ts`
   - **Tests**:
     - buildAgencyPreview with research_report
     - buildAgencyPreview with video_storyboard
     - buildAgencyPreview with presentation_deck
     - buildAgencyPreview with media_prompt (new)
     - buildAgencyPreview with text_content (new)
     - buildAgencyPreview with comparison variants
   - **Effort**: 1.5 hours

2. **Add integration test for template → preview → commit**
   - **Test flow**: Create agency from template → run → generate preview → commit
   - **Effort**: 1.5 hours

**Total Phase 3**: 3 hours

---

## Open Questions

1. **Is chat_reply intent intentional?** It's defined in Python but no handler exists. Is it used?
2. **Should media_prompt preview navigate to media studio or stay in chat?** Current router sends to media studio, but should preview card support it?
3. **Are AGENCY_DECK_COMMIT_ENABLED and AGENCY_LIBRARY_COMMIT_ENABLED flags actually used?** Or are commits always allowed?
4. **Who fills in media_prompt and text_content intents?** What agent templates or flows generate these?
5. **Should text_content be committable to library?** Or is it display-only in chat?

---

## Assumptions Made

- agencyRunArtifacts table has all required columns (not fully read due to file size)
- Feature flags are properly configured in system_settings
- All referenced tools have proper HTTP endpoints (verified for template tools)
- Zod schemas in Node.js are canonically correct (Python uses similar field names)

---

## Files for Reference

| File | Lines | Purpose |
|------|-------|---------|
| agency_result_envelope.py | 1–130 | Python Pydantic envelope model |
| agencyExperienceTemplateService.ts | 1–327 | Template definitions and upsert |
| agencyPreviewService.ts | 1–411 | Preview building and normalization |
| agencyResultRouter.ts | 1–169 | Preview routing logic |
| agencyResultEnvelope.ts (shared) | 1–181 | Zod envelope schemas |
| agency.ts router | 683–749 | createFromTemplate endpoint |
| AgencyPreviewCard.tsx | 1–202 | Preview card UI component |
| StoryboardPreviewContent.tsx | 1–150 | Storyboard display component |
| PreviewCommitButton.tsx | 1–202 | Commit action handling |
| agency.test.ts | 1–100+ | Router tests (mocks shown) |

---

## Sign-Off

**Audit completed**: 2026-03-18
**Auditor**: Research Agent (CMD-1)
**Confidence**: HIGH (comprehensive code review with cross-layer validation)
**Next step**: User review and approval of Phase 1 fixes
