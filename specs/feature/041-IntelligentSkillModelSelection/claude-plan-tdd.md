# TDD Plan — Feature 041: Intelligent Skill Model Selection

This mirrors `claude-plan.md` section by section with test stubs for each section.

---

## Section 01: Database Migration

### Tests
No unit tests for the migration itself. Verification is done by checking the schema post-migration.

**Verification script** (run after migration):
```sql
-- Confirm columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'model_provider_map'
  AND column_name IN ('supportsVision', 'priorityLocked');
-- Expected: 2 rows, both boolean, both DEFAULT false
```

```bash
cd apps/web && pnpm check  # TypeScript must compile
```

---

## Section 02: Model Priority Scoring Service

### Test file
`apps/web/server/services/intelligentModelSelector.test.ts`

```typescript
describe("computeModelPriority", () => {
  it("returns lower number for newer model (recency wins)")
  // setup: model.createdAt = Date.now()/1000 - (7 * 86400)  // 7 days old
  // expect: priority < computeModelPriority({ createdAt: 2_years_ago })

  it("returns lower number for free model over paid")
  // setup: model A: isFree=true; model B: isFree=false, pricing 5/1M
  // expect: priority(A) < priority(B)

  it("returns lower number for model with more capabilities")
  // setup: model A: all 8 flags true; model B: all 8 flags false
  // expect: priority(A) < priority(B)

  it("never returns 0 or negative")
  // worst-case model: old, expensive, no capabilities
  // expect: priority >= 1

  it("never returns more than 100")
  // best-case model: brand new, free, all capabilities
  // expect: priority <= 100

  it("returns 15 recency points for unknown createdAt")
  // setup: model.createdAt = undefined
  // verify internal: recencyPoints === 15

  it("returns 15 cost points for unknown pricing")
  // setup: pricingInput = null, pricingOutput = null, isFree = false
  // verify: result is mid-range (not min or max)

  it("is deterministic — same input always returns same output")
  // run twice with identical input, expect same result
})
```

---

## Section 03: Capability-Aware Model Selector

### Test file
`apps/web/server/services/intelligentModelSelector.test.ts`

```typescript
describe("selectBestLlmModel", () => {
  // Test data helpers:
  // makeRow(id, capabilities, priority): EnabledLlmModelRow

  it("returns modelId of first qualifying model sorted by priority")
  // rows: [{ id: "gpt-4o", priority: 10, supportsFunctionTools: true },
  //        { id: "claude-3", priority: 5, supportsFunctionTools: true }]
  // requirements: { supportsFunctionTools: true }
  // expect: "claude-3" (priority 5 < 10)

  it("returns null when no row satisfies requirements")
  // rows: [{ id: "text-only", supportsFunctionTools: false }]
  // requirements: { supportsFunctionTools: true }
  // expect: null

  it("AND logic: excludes models missing any single required capability")
  // rows: [{ id: "partial", supportsFunctionTools: true, supportsStructuredOutputs: false }]
  // requirements: { supportsFunctionTools: true, supportsStructuredOutputs: true }
  // expect: null

  it("false requirements do not filter out capable models")
  // rows: [{ id: "capable", supportsFunctionTools: true }]
  // requirements: { supportsFunctionTools: false }  // "I don't need tools"
  // expect: "capable" (no filtering applied for false requirements)

  it("contextLength filter excludes models with insufficient context")
  // rows: [{ id: "small", contextLength: 4096 }, { id: "large", contextLength: 128000 }]
  // requirements: { contextLength: 32000 }
  // expect: "large" (4096 < 32000 excluded)

  it("returns null for empty rows array")
  // rows: []
  // requirements: anything
  // expect: null

  it("returns first model when requirements object is empty (no filtering)")
  // rows: sorted list
  // requirements: {}
  // expect: first row's modelId

  it("does not require capabilities not in requirements object")
  // requirements only has supportsFunctionTools
  // row has supportsFunctionTools: true, supportsVision: false
  // expect: row qualifies (supportsVision not required)
})

describe("describeRequirementsMatch", () => {
  it("lists matched capabilities correctly")
  it("lists missing capabilities correctly")
  it("returns empty strings when requirements is empty")
})
```

---

## Section 04: Extended resolveSkillExecutionPolicy()

### Test file
`apps/web/server/services/skillExecutionPolicy.test.ts` (extend existing)

```typescript
describe("resolveSkillExecutionPolicy — requirements mode", () => {
  // Mock: loadEnabledLlmModelRows returns array
  // Mock: selectBestLlmModel (spy or inject)

  it("uses requirements when skill.executionPolicy.requirements is set")
  // skill: { requirements: { supportsFunctionTools: true } }
  // mocked rows include one matching model
  // expect: modelSource === "requirements_match"

  it("returns the capability-selected model")
  // expect: modelId === the model selected by selectBestLlmModel

  it("falls back to llmModelId when requirements find no match")
  // selectBestLlmModel returns null
  // skill has llmModelId = "gpt-4o" (enabled)
  // expect: modelId === "gpt-4o", modelSource === "skill_llmModelId"

  it("falls back to system default when requirements fail and no llmModelId")
  // selectBestLlmModel returns null, llmModelId undefined
  // expect: modelSource === "system_default"

  it("emits audit warning when requirements fail (no match)")
  // verify auditLogger.log called with warning-level event

  it("skill without requirements: llmModelId still works (no regression)")
  it("skill without requirements: defaultModel still works (no regression)")
  it("skill without requirements: conversation model still works (no regression)")
  it("skill without requirements: system default still works (no regression)")

  it("sets requirementsFallback=true when fallback was used")
  it("sets matchedCapabilities in result when requirements matched")

  it("allowConversationOverride=false: conversationModel ignored when requirements set")
  it("allowConversationOverride=true: conversationModel eligible when requirements fail")
})
```

---

## Section 05: updateModelPriority tRPC Mutation

### Test file
`apps/web/server/routers/multiProvider.test.ts` (extend existing)

```typescript
describe("multiProvider.updateModelPriority", () => {
  it("updates priority and sets priorityLocked=true")
  // call mutation with { mappingId: 1, priority: 25 }
  // verify DB: priority === 25, priorityLocked === true

  it("rejects priority > 999")
  // input: { mappingId: 1, priority: 1000 }
  // expect: TRPCError with BAD_REQUEST

  it("rejects priority < 0")
  // input: { mappingId: 1, priority: -1 }
  // expect: TRPCError

  it("requires admin role")
  // call with non-admin context
  // expect: UNAUTHORIZED

  it("returns updated mapping in response")
})

describe("bulkSetAdminModelCatalogEnabled — priority assignment", () => {
  it("assigns computed priority to new entries (not 0)")
  // setup: enable a model that doesn't exist in model_provider_map
  // verify: new row has priority !== 0

  it("does not overwrite priorityLocked=true entries")
  // setup: existing row with priority=5, priorityLocked=true
  // run bulkSet on same model
  // verify: priority still 5

  it("may recompute priority for priorityLocked=false entries")
  // setup: existing row with priority=50, priorityLocked=false
  // (behavior: recompute or keep, depends on implementation choice)
})
```

---

## Section 06: Admin UI — Priority Quick-Edit

### Test file
`apps/web/client/src/components/admin/MultiProviderAdmin.tsx` — manual QA + component tests

```typescript
describe("MultiProviderAdmin priority editor", () => {
  it("renders priority input for each model row")
  it("shows lock icon when priorityLocked=true")
  it("shows info icon when priorityLocked=false")
  it("calls updateModelPriority on blur with new value")
  it("does not call mutation if value unchanged")
  it("shows optimistic update immediately")
  it("reverts to old value on mutation error")
  it("tooltip text correct for locked vs unlocked")
})
```

---

## Section 07: SkillSettings Model Resolution Preview

### Test file
`apps/web/server/routers/skills.ts` — extend existing test or new test file

```typescript
describe("skills.previewModelResolution", () => {
  it("returns modelId and modelSource for a skill with requirements")
  it("returns fallback info when requirements match nothing")
  it("returns system default when no requirements and no llmModelId")
  it("requires admin role")
  it("returns matchedCapabilities list")
  it("returns requirementsFallback=true when fallback used")
})
```

---

## Section 08: Zod Validation + Frontmatter Parsing

### Test file
`apps/web/server/routers/skills.test.ts` (extend existing)

```typescript
describe("skills.update executionPolicy.requirements", () => {
  it("accepts valid requirements object")
  it("rejects contextLength < 1000")
  it("rejects contextLength > 2000000")
  it("merges requirements into existing executionPolicyJson (preserves Spec 038 fields)")
  it("null requirements clears the requirements field")
})

describe("skillRegistry frontmatter model_requirements parsing", () => {
  it("parses model_requirements from snake_case frontmatter key")
  it("parses modelRequirements from camelCase frontmatter key")
  it("ignores unknown capability keys with warning")
  it("stores parsed requirements in executionPolicyJson.requirements")
  it("skill without model_requirements: executionPolicyJson has no requirements key")
})
```

---

## Coverage Requirements

- `intelligentModelSelector.ts`: 100% line coverage (pure functions, easy to test)
- `skillExecutionPolicy.ts`: existing coverage maintained + new branches covered
- `multiProvider.ts` new mutations: 90%+ coverage
- UI components: manual QA + at least 5 component tests per section
