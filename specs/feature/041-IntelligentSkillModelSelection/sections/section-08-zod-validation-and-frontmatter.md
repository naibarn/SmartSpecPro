# Section 08: Zod Validation + Frontmatter Parsing

## Implementation Status: COMPLETE

## Purpose

Complete the loop so skills can express capability requirements in two ways:
1. Via the admin UI / tRPC (the `skills.update` mutation)
2. Via `skill.md` frontmatter (file-based, synced automatically)

This section has no database migration of its own — `executionPolicyJson` is already a flexible JSON column. All changes are code-only.

## Dependencies

- Section 03 must be complete: `CapabilityRequirements` type defined in `intelligentModelSelector.ts`
- Section 04 must be complete: `resolveSkillExecutionPolicy()` extended to read `requirements` from `executionPolicyJson`
- No dependency on sections 05, 06, or 07

## Tests First

**Test file: `apps/web/server/routers/skills.test.ts`** (extend existing)

```typescript
describe("skills.update executionPolicy.requirements", () => {
  it("accepts valid requirements object")
  // input: { id: 1, executionPolicy: { requirements: { supportsFunctionTools: true, contextLength: 32000 } } }
  // expect: mutation succeeds, executionPolicyJson.requirements persisted

  it("rejects contextLength < 1000")
  // input: { id: 1, executionPolicy: { requirements: { contextLength: 500 } } }
  // expect: TRPCError BAD_REQUEST (Zod validation fails)

  it("rejects contextLength > 2000000")
  // input: { id: 1, executionPolicy: { requirements: { contextLength: 3000000 } } }
  // expect: TRPCError BAD_REQUEST

  it("merges requirements into existing executionPolicyJson (preserves Spec 038 fields)")
  // setup: skill has executionPolicyJson = { thinking_level_hint: "high", requires_web_search: true }
  // call update with: { executionPolicy: { requirements: { supportsFunctionTools: true } } }
  // expect: executionPolicyJson = { thinking_level_hint: "high", requires_web_search: true, requirements: { supportsFunctionTools: true } }

  it("null requirements clears the requirements field")
  // setup: skill has executionPolicyJson.requirements = { supportsFunctionTools: true }
  // call update with: { executionPolicy: { requirements: null } }
  // expect: executionPolicyJson.requirements is null or absent

  it("accepts mode enum")
  // input: { executionPolicy: { mode: "hybrid" } }
  // expect: executionPolicyJson.mode === "hybrid"

  it("rejects invalid mode value")
  // input: { executionPolicy: { mode: "auto" } }
  // expect: TRPCError BAD_REQUEST

  it("preferredStrategy is not in v1 Zod schema")
  // input: { executionPolicy: { preferredStrategy: "cheapest" } }
  // expect: field is stripped by Zod (unknown key) or rejected — must NOT persist
})

describe("skillRegistry frontmatter model_requirements parsing", () => {
  it("parses model_requirements from snake_case frontmatter key")
  // skill.md frontmatter: model_requirements: { supportsFunctionTools: true, contextLength: 32000 }
  // expect: synced skill has executionPolicyJson.requirements = { supportsFunctionTools: true, contextLength: 32000 }

  it("parses modelRequirements from camelCase frontmatter key")
  // skill.md frontmatter: modelRequirements: { supportsStructuredOutputs: true }
  // expect: synced skill has executionPolicyJson.requirements = { supportsStructuredOutputs: true }

  it("ignores unknown capability keys with warning")
  // skill.md frontmatter: model_requirements: { supportsFunctionTools: true, typoKey: true }
  // expect: executionPolicyJson.requirements = { supportsFunctionTools: true }
  // expect: console.warn called (or logger.warn) mentioning typoKey

  it("stores parsed requirements in executionPolicyJson.requirements")
  // confirms the merged path: existing executionPolicyJson fields preserved

  it("skill without model_requirements: executionPolicyJson has no requirements key")
  // skill.md frontmatter has no model_requirements or modelRequirements
  // expect: executionPolicyJson unchanged (no requirements key injected)
})
```

## Step 8a: Update `packages/skills/src/types.ts`

Add `supportsVision?: boolean` to the `requirements` sub-object of `SkillExecutionPolicyConfig`.

**File: `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts`**

Locate the `SkillExecutionPolicyConfig` interface and modify the `requirements` block (currently lines ~152–161):

```typescript
requirements?: {
  supportsVision?: boolean;           // ← ADD THIS (new in Feature 041)
  supportsResponses?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  contextLength?: number;
};
```

This is purely additive. No existing callers are broken.

Also add `model_requirements` and `modelRequirements` to `SkillMetadata` so that frontmatter parsing does not lose these keys:

```typescript
// In SkillMetadata interface — add:
model_requirements?: Record<string, unknown>;
modelRequirements?: Record<string, unknown>;
```

After editing, rebuild the package:

```bash
cd packages/skills && pnpm build
```

Or rely on the monorepo build — Turborepo will pick this up automatically on next `pnpm build` or test run.

## Step 8b: Extend `skills.update` Zod Schema in `apps/web/server/routers/skills.ts`

**File: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts`**

The existing `executionPolicy` Zod object in the `update` mutation (currently around line 2500–2507) only covers Spec 038 fields. Extend it with the capability-requirements sub-object, the `mode` enum, and `allowConversationOverride`.

Replace the existing `executionPolicy` Zod object with:

```typescript
executionPolicy: z.object({
  // Spec 038 fields (unchanged)
  thinking_level_hint: z.enum(["low", "medium", "high"]).nullable().optional(),
  requires_web_search: z.boolean().optional(),
  min_citation_coverage: z.number().min(0).max(1).optional(),
  refresh_cadence_days: z.number().min(1).max(365).optional(),
  disclosure_required: z.boolean().optional(),
  response_mode: z.enum(["markdown", "cms_json"]).optional(),

  // Feature 041: Capability requirements
  requirements: z.object({
    supportsVision: z.boolean().optional(),
    supportsFunctionTools: z.boolean().optional(),
    supportsStructuredOutputs: z.boolean().optional(),
    supportsWebSearch: z.boolean().optional(),
    supportsCodeExecution: z.boolean().optional(),
    supportsComputerUse: z.boolean().optional(),
    supportsBackground: z.boolean().optional(),
    supportsResponses: z.boolean().optional(),
    contextLength: z.number().int().min(1000).max(2000000).optional(),
  }).nullable().optional(),

  // Feature 041: Execution mode
  mode: z.enum(["requirements", "fixed", "hybrid"]).optional(),

  // Feature 041: Conversation override flag
  allowConversationOverride: z.boolean().optional(),

  // preferredStrategy: reserved for v2 — intentionally NOT included here
  // Adding it without an implementation would silently accept input that has no effect.
}).optional(),
```

Then extend the `executionPolicyJson` merge block (around line 2622–2639) to include the new fields:

```typescript
// In the "Spec 038: Merge execution policy" block, add alongside existing fields:
if (updateData.executionPolicy !== undefined) {
  const existing = (await dbInstance
    .select({ executionPolicyJson: skills.executionPolicyJson })
    .from(skills)
    .where(eq(skills.id, id))
    .limit(1)
  )[0]?.executionPolicyJson ?? {};

  updateObj.executionPolicyJson = {
    ...existing,
    // Spec 038 fields
    thinking_level_hint: updateData.executionPolicy.thinking_level_hint,
    requires_web_search: updateData.executionPolicy.requires_web_search,
    min_citation_coverage: updateData.executionPolicy.min_citation_coverage,
    refresh_cadence_days: updateData.executionPolicy.refresh_cadence_days,
    disclosure_required: updateData.executionPolicy.disclosure_required,
    response_mode: updateData.executionPolicy.response_mode,
    // Feature 041 fields
    ...(updateData.executionPolicy.requirements !== undefined
      ? { requirements: updateData.executionPolicy.requirements }
      : {}),
    ...(updateData.executionPolicy.mode !== undefined
      ? { mode: updateData.executionPolicy.mode }
      : {}),
    ...(updateData.executionPolicy.allowConversationOverride !== undefined
      ? { allowConversationOverride: updateData.executionPolicy.allowConversationOverride }
      : {}),
  };
}
```

The `null` case for `requirements` is handled by `{ requirements: null }` — the spread will include the key with a null value, which is acceptable for a JSON column and signals "clear requirements."

## Step 8c: Frontmatter Parsing in `apps/web/server/services/skillRegistry.ts`

**File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts`**

### Add `isSkillRequirements()` Type Guard

Add a new helper function near `getFrontmatterRoutingConfig` (around line 168):

```typescript
/** Known capability keys for model_requirements frontmatter */
const KNOWN_REQUIREMENT_KEYS = new Set([
  "supportsVision",
  "supportsFunctionTools",
  "supportsStructuredOutputs",
  "supportsWebSearch",
  "supportsCodeExecution",
  "supportsComputerUse",
  "supportsBackground",
  "supportsResponses",
  "contextLength",
]);

/**
 * Type guard: validates that a raw frontmatter object only contains
 * known capability keys. Filters out unknown keys with a warning.
 * Prevents typos from silently having no effect.
 */
function parseSkillRequirements(
  raw: Record<string, unknown>,
  skillSlug: string,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (KNOWN_REQUIREMENT_KEYS.has(key)) {
      result[key] = value;
    } else {
      console.warn(
        `[SkillRegistry] Unknown key in model_requirements for skill "${skillSlug}": "${key}" — ignored`,
      );
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
```

### Extend `getFrontmatterRoutingConfig()` to Return Requirements

The current `getFrontmatterRoutingConfig()` function returns only `{ llmModelId, preferredProviderId, strictProviderPin }`. Extend its return type and logic to also extract `model_requirements`:

```typescript
function getFrontmatterRoutingConfig(metadata: SkillMetadata, slug?: string): {
  llmModelId?: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  modelRequirements?: Record<string, unknown>;
} {
  // ... existing code for llmModelId, preferredProviderId, strictProviderPin ...

  // Extract model_requirements (snake_case or camelCase)
  const rawRequirements =
    (metadata as any).model_requirements ??
    (metadata as any).modelRequirements;

  const modelRequirements =
    rawRequirements != null && typeof rawRequirements === "object"
      ? parseSkillRequirements(rawRequirements as Record<string, unknown>, slug ?? "unknown")
      : undefined;

  return {
    llmModelId: ...,
    preferredProviderId: ...,
    strictProviderPin: ...,
    modelRequirements,
  };
}
```

### Wire Requirements Into `skillData` in `autoSyncSkillsFromFolder()`

In `autoSyncSkillsFromFolder()`, the `skillData` object is built around line 297. The `executionPolicyJson` field already reads from `metadata.execution_policy ?? metadata.executionPolicy`. Extend this to merge in parsed requirements:

```typescript
const routingConfig = getFrontmatterRoutingConfig(metadata, folder.slug);

// Merge model_requirements into executionPolicyJson
const baseExecutionPolicy = metadata.execution_policy ?? metadata.executionPolicy ?? null;
const executionPolicyJson =
  routingConfig.modelRequirements != null
    ? { ...(baseExecutionPolicy ?? {}), requirements: routingConfig.modelRequirements }
    : baseExecutionPolicy;

const skillData = {
  // ... existing fields ...
  executionPolicyJson,
};
```

Apply the same merge logic in `syncSingleSkillIfChanged()`, in its `updateData` object.

### Update the Existing Skill Update Path (hash-changed branch)

In the hash-changed update branch of `autoSyncSkillsFromFolder()` (around line 347), the spread that conditionally sets `executionPolicyJson` is:

```typescript
...((metadata.execution_policy ?? metadata.executionPolicy) !== undefined
  ? { executionPolicyJson: metadata.execution_policy ?? metadata.executionPolicy }
  : {}),
```

Replace this with the merged version:

```typescript
...(executionPolicyJson !== null
  ? { executionPolicyJson }
  : {}),
```

where `executionPolicyJson` is computed as shown above (merge of base policy + model requirements).

## Known Allowed Keys Reference

For implementer reference, the full set of keys accepted in `model_requirements` frontmatter:

| Key | Type | Description |
|-----|------|-------------|
| `supportsVision` | boolean | Model can process images |
| `supportsFunctionTools` | boolean | Model supports function/tool calling |
| `supportsStructuredOutputs` | boolean | Model supports structured JSON output |
| `supportsWebSearch` | boolean | Model has web search capability |
| `supportsCodeExecution` | boolean | Model can execute code |
| `supportsComputerUse` | boolean | Model supports computer use |
| `supportsBackground` | boolean | Model supports background execution |
| `supportsResponses` | boolean | Model uses Responses API |
| `contextLength` | integer (1000–2000000) | Minimum context window required |

## Example `skill.md` Frontmatter

```yaml
---
name: Function Tool Skill
category: chat_assistant
model_requirements:
  supportsFunctionTools: true
  supportsStructuredOutputs: true
  contextLength: 32000
---
```

Or equivalently using camelCase:

```yaml
---
name: Vision Analysis Skill
category: document_analysis
modelRequirements:
  supportsVision: true
  contextLength: 8000
---
```

## Integration With `executionPolicy` Frontmatter

`model_requirements` is a convenience alias. Skill authors can also embed requirements inside `execution_policy`:

```yaml
execution_policy:
  mode: requirements
  requirements:
    supportsFunctionTools: true
```

When both `execution_policy.requirements` and `model_requirements` are present in frontmatter, the top-level `model_requirements` key wins (it is merged on top of `execution_policy.requirements`). This should be documented in the skill authoring guide but not enforced strictly — either form works.

## Files to Create / Modify

| File | Change |
|------|--------|
| `/home/dev/projects/SmartSpecPro/packages/skills/src/types.ts` | Add `supportsVision` to `requirements`; add `model_requirements`/`modelRequirements` to `SkillMetadata` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts` | Extend `executionPolicy` Zod schema; merge new fields into `executionPolicyJson` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillRegistry.ts` | Add `parseSkillRequirements()` guard; extend `getFrontmatterRoutingConfig()`; wire into `skillData` builds |
| `apps/web/server/routers/skills.test.ts` | New test cases for requirements Zod validation + frontmatter parsing |

## Verification Checklist

- [ ] `pnpm check` passes (TypeScript strict mode, no new errors)
- [ ] `pnpm test` passes with all new tests green
- [ ] `skills.update` accepts `{ executionPolicy: { requirements: { supportsFunctionTools: true, contextLength: 32000 } } }` without error
- [ ] `skills.update` rejects `contextLength: 999` with a Zod validation error
- [ ] `skills.update` with `requirements: null` clears the requirements field without destroying Spec 038 fields in `executionPolicyJson`
- [ ] A skill.md with `model_requirements: { supportsVision: true }` syncs correctly and populates `executionPolicyJson.requirements`
- [ ] An unknown key in `model_requirements` logs a warning and is silently dropped
- [ ] `preferredStrategy` is NOT accepted in the `skills.update` Zod schema (Zod strips or rejects it)
- [ ] `packages/skills` package builds cleanly after types change