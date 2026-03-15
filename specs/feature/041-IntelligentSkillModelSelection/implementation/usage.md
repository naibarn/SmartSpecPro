# Feature 041: Intelligent Skill Model Selection — Usage Guide

## Overview

This feature adds capability-aware model selection to SmartSpecPro's skill engine. Instead of relying solely on hardcoded `llmModelId` or `defaultModel`, skills can now declare capability requirements (e.g., "needs vision", "needs function tools", "needs 32K context") and the system automatically selects the best available model.

## Key Components

### 1. Model Priority Scoring (`intelligentModelSelector.ts`)
- **`computeModelPriority(input)`** — scores models 1-85 based on recency (0-40), cost (0-30), capabilities (0-30), inverted so lower = higher priority
- **`selectBestLlmModel(requirements, rows)`** — filters enabled models by capabilities, returns best match
- **`describeRequirementsMatch(requirements, row)`** — returns matched/missing capability lists for diagnostics

### 2. Capability-Aware Policy Resolution (`skillExecutionPolicy.ts`)
- **`resolveSkillExecutionPolicy(input)`** — unified entry point for model selection
- Supports 3 modes: `requirements` (default), `fixed`, `hybrid`
- Falls back gracefully through: fixedModel → requirements → llmModelId → defaultModel → conversation → system default
- Returns `modelSource` for audit trail and `matchedCapabilities` for diagnostics

### 3. Admin Mutations (`multiProvider.ts`)
- **`updateModelPriority`** — manually set priority (0-999) for a model mapping, sets `priorityLocked: true`
- **`backfillModelPriorities`** — recalculate all unlocked priorities using `computeModelPriority()`

### 4. Admin UI Priority Editor (`MultiProviderAdmin.tsx`)
- Inline number input (0-999) with optimistic updates
- Lock/Info icons to distinguish manual vs auto-assigned priorities
- Priority ASC secondary sort in catalog view

### 5. Model Resolution Preview (`skills.previewModelResolution`)
- Admin-only tRPC query showing which model a skill would use
- `SkillModelPreviewPanel` component — collapsible, lazy-loaded, 4 display states

### 6. Zod Validation + Frontmatter (`skills.update`, `skillRegistry.ts`)
- Extended Zod schema accepts `requirements`, `mode`, `allowConversationOverride`
- Frontmatter supports `model_requirements:` (snake_case) or `modelRequirements:` (camelCase)
- Unknown keys are warned and dropped; known keys are validated

## How to Use

### Skill Authors (via `skill.md` frontmatter)

```yaml
---
name: Vision Analysis
category: document_analysis
model_requirements:
  supportsVision: true
  contextLength: 8000
---
```

Or with explicit mode:

```yaml
---
name: Function Tool Skill
category: chat_assistant
execution_policy:
  mode: requirements
  requirements:
    supportsFunctionTools: true
    supportsStructuredOutputs: true
    contextLength: 32000
---
```

### Admin (via UI)

1. **Model Priorities**: Admin → LLM Models → edit priority inline (lower = preferred)
2. **Preview Resolution**: Admin → Skills → Edit skill → expand "Model Preview" panel
3. **Backfill**: Admin → LLM Models → "Recalculate Priorities" button

### Available Capability Keys

| Key | Type | Description |
|-----|------|-------------|
| `supportsVision` | boolean | Model can process images |
| `supportsFunctionTools` | boolean | Model supports tool calling |
| `supportsStructuredOutputs` | boolean | Model supports JSON output |
| `supportsWebSearch` | boolean | Model has web search |
| `supportsCodeExecution` | boolean | Model can execute code |
| `supportsComputerUse` | boolean | Model supports computer use |
| `supportsBackground` | boolean | Model supports background execution |
| `supportsResponses` | boolean | Model uses Responses API |
| `contextLength` | integer (1000-2M) | Minimum context window |

## Database Changes

- `model_provider_map.priorityLocked` (boolean, default false) — tracks manual vs auto-assigned priority
- No new tables or migrations beyond what was applied in Section 01

## Test Coverage

| Section | Tests | File |
|---------|-------|------|
| 02: Priority Scoring | 12 | `intelligentModelSelector.test.ts` |
| 03: Capability Selector | 9 | `intelligentModelSelector.test.ts` |
| 04: Policy Extension | 15 | `skillExecutionPolicy.test.ts` |
| 05: Admin Mutations | 24 | `multiProvider.test.ts` |
| 06: Priority Editor | 8 | `multiProviderAdminModelMappings.test.ts` |
| 07: Preview Query | 6 | `skills.previewModelResolution.test.ts` |
| 08: Zod + Frontmatter | 16 | `skills.zodValidation.test.ts`, `skillRegistry.frontmatter.test.ts` |
| **Total** | **90** | |
