# Section 17 — Conditional Branch Node

## Section ID
`section-17-conditional-branch-node`

## Dependencies
- **section-01-database-migration**: The `agencyAgents.nodeType` column must accept `"conditional_branch"` and `agencyAgents.nodeConfig` JSONB must store `ConditionalBranchConfig`.
- **section-07-agency-context**: The `AgencyRunContext` class must be available for `context_check` evaluation mode.

## Blocks
- **section-22-ai-creator-v2**: The AI Creator v2 must know the `conditional_branch` node type schema for generation and validation.

---

## Overview

This section adds the `conditional_branch` node type to the Agency Builder. It provides three evaluation modes for routing execution flow: rule-based field comparison, LLM classification, and context key checks. The Python orchestrator evaluates conditions and routes to the matching target node, with a mandatory default fallback branch.

---

## Tests (TDD)

Write all tests before implementation. Tests are organized by layer.

### Python Unit Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/agency/test_conditional_branch.py`

```
# pytest: rule_based evaluation with equals operator — given field value "hello" and rule operator "equals" with value "hello", returns the rule's targetNodeId
# pytest: rule_based evaluation with contains operator — given field value "hello world" and operator "contains" with value "world", matches
# pytest: rule_based evaluation with regex operator — given field value "order-12345" and operator "regex" with value "order-\\d+", matches
# pytest: rule_based evaluation with gt operator — given numeric field value 10 and operator "gt" with value 5, matches
# pytest: rule_based evaluation with lt operator — given numeric field value 3 and operator "lt" with value 5, matches
# pytest: rule_based evaluation with gte operator — given field value 5 and operator "gte" with value 5, matches (boundary)
# pytest: rule_based evaluation with lte operator — given field value 5 and operator "lte" with value 5, matches (boundary)
# pytest: rule_based evaluation with exists operator — given field value is present, matches; given absent, does not match
# pytest: llm_classify calls LLM Gateway with fixed template containing classificationLabel + classificationDescription, user content in human-message role, and maps result to category targetNodeId
# pytest: llm_classify falls back to defaultTargetNodeId when LLM returns unrecognized category
# pytest: context_check reads AgencyRunContext key and evaluates contextConditions against it
# pytest: context_check falls back to defaultTargetNodeId when context key is missing
# pytest: default branch used when no rule_based rule matches
# pytest: default branch used when context_check finds no matching condition
# pytest: defaultTargetNodeId validated to exist in agency node list — raises error if missing
# pytest: rules evaluated in array order — first matching rule wins
# pytest: JSONPath field extraction from previous node output works for nested paths (e.g. $.result.status)
# pytest: invalid JSONPath expression returns None (does not raise), falls through to default
```

### Vitest Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencyConditionalBranch.test.ts`

```
# Vitest: saveBuilder validates conditional_branch nodeConfig — evaluationMode is required enum
# Vitest: saveBuilder validates conditional_branch requires defaultTargetNodeId
# Vitest: saveBuilder validates rule_based mode requires non-empty rules array
# Vitest: saveBuilder validates each rule has field, operator (7 allowed values), value, and targetNodeId
# Vitest: saveBuilder validates llm_classify mode requires categories array with at least 2 entries
# Vitest: saveBuilder validates classificationDescription max 200 chars
# Vitest: saveBuilder rejects unknown evaluationMode value
```

### Frontend Component Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/__tests__/ConditionalBranchNodeCard.test.tsx`

```
# Vitest: renders amber border and GitFork icon
# Vitest: displays evaluation mode badge (rule_based / llm_classify / context_check)
# Vitest: shows rule count for rule_based mode
# Vitest: shows category count for llm_classify mode
# Vitest: displays validation error indicator when validationErrors present
# Vitest: renders one source handle per rule/category plus one default handle
```

---

## Implementation Details

### 1. TypeScript Type Updates

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts`

Add `"conditional_branch"` to the `AgencyNodeType` union type.

### 2. nodeConfig Schema (ConditionalBranchConfig)

Define the following Zod schema for validation in `saveBuilder` (file: `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`). Add a new case inside the existing `.superRefine()` block that validates `nodeConfig` when `nodeType === "conditional_branch"`.

**ConditionalBranchConfig shape**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `evaluationMode` | `'rule_based' \| 'llm_classify' \| 'context_check'` | Yes | Determines which sub-fields are validated |
| `rules` | `Array<ConditionalRule>` | When `rule_based` | Min 1 entry |
| `classificationLabel` | `string` | When `llm_classify` | Short label for the classification task |
| `classificationDescription` | `string` (max 200) | When `llm_classify` | Describes what to classify |
| `categories` | `Array<{ label: string; targetNodeId: string }>` | When `llm_classify` | Min 2 entries |
| `contextKey` | `string` | When `context_check` | Key to read from AgencyRunContext |
| `contextConditions` | `Array<{ operator: string; value: string; targetNodeId: string }>` | When `context_check` | Conditions to match against context value |
| `defaultTargetNodeId` | `string` | Always | Fallback target; must reference a valid node in the agency |

**ConditionalRule shape**:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | Unique within the rules array |
| `field` | `string` | JSONPath expression (e.g. `$.result.status`) applied to previous node output |
| `operator` | `'equals' \| 'contains' \| 'regex' \| 'gt' \| 'lt' \| 'gte' \| 'lte' \| 'exists'` | 7 allowed operators |
| `value` | `string` | Comparison value (ignored for `exists`) |
| `targetNodeId` | `string` | Node to route to when rule matches |
| `label` | `string` (optional) | Display label for edge |

### 3. Python Orchestrator Handler

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py`

Add a new case in the `_execute_node` match statement:

```python
case "conditional_branch":
    next_node_id = await self._evaluate_conditional_branch(node, ctx)
    if next_node_id and next_node_id in self.nodes:
        result = await self._execute_node(self.nodes[next_node_id], ctx)
    else:
        result = f"[ConditionalBranch: fallback — no valid target in node {node_id}]"
    return result  # Like router, routing is already done
```

Add `"conditional_branch"` to the edge-skip set alongside `"router"` on the line that checks `if node_type not in ("router",):`.

**New method** `_evaluate_conditional_branch(self, node: NodeRow, ctx: ExecutionContext) -> str | None`:

Extract the evaluation logic into a dedicated helper module for testability.

**File**: `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_conditional_branch.py`

This module contains pure functions:

- `evaluate_rule_based(rules: list[dict], previous_output: str, ctx: ExecutionContext) -> str | None`
  - Parse `previous_output` as JSON (fall back to raw string if not JSON).
  - For each rule in array order, extract `field` via JSONPath (use `jsonpath_ng` library, already available in the project for data transform). If extraction fails, skip rule.
  - Apply operator comparison. For numeric operators (`gt`, `lt`, `gte`, `lte`), attempt float conversion; skip rule on failure.
  - Return `targetNodeId` of first matching rule, or `None`.

- `evaluate_llm_classify(config: dict, previous_output: str, llm_gateway_url: str, user_token: str) -> str | None`
  - Build a fixed prompt template: system message describes the classification task using `classificationLabel` and `classificationDescription`, lists valid category labels. User content (the text to classify) goes in the human-message role.
  - Call LLM Gateway (`POST {llm_gateway_url}/api/llm/chat`) with the agency's default model (or a fast model override from config).
  - Parse response for a category label match (case-insensitive strip). Return matching `targetNodeId` or `None`.
  - Wrap in try/except; log and return `None` on LLM failure (falls through to default).

- `evaluate_context_check(config: dict, context: "AgencyRunContext") -> str | None`
  - Read `contextKey` from `AgencyRunContext.get(key)`.
  - Evaluate each condition in `contextConditions` using the same operator logic as rule_based.
  - Return first matching `targetNodeId` or `None`.

The orchestrator method `_evaluate_conditional_branch` calls the appropriate function based on `evaluationMode`, then falls back to `defaultTargetNodeId` if the result is `None`.

### 4. Frontend Node Card

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/ConditionalBranchNodeCard.tsx`

Follow the same pattern as `RouterNodeCard.tsx`:

- **Color scheme**: Amber (border-amber-300, text-amber-500, bg-amber-50, etc.)
- **Icon**: `GitFork` from lucide-react
- **Badge**: Shows current `evaluationMode` value
- **Handles**:
  - One `target` handle at `Position.Top` (input)
  - One `source` handle per rule/category with unique `id` (mapped from `rules[i].id` or `categories[i].label`)
  - One `source` handle at `Position.Bottom` with id `"default"` and label "Default"
- **Validation dot**: Red `AlertCircle` icon when `validationErrors` is non-empty
- **Summary text**: e.g., "3 rules" or "4 categories" depending on mode

### 5. BaseAgencyNode Dispatcher Update

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx`

Add a new case before the default:

```typescript
case "conditional_branch":
  return <ConditionalBranchNodeCard {...props} />;
```

Import `ConditionalBranchNodeCard` at the top.

### 6. NodePropertyPanel Form

**File**: `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx`

Add a `ConditionalBranchForm` section (either inline or as a separate component). The form should:

- **Mode selector**: `Select` dropdown for `evaluationMode` (rule_based, llm_classify, context_check)
- **rule_based mode**:
  - List of rules with add/remove buttons
  - Each rule: `field` input (JSONPath), `operator` select (7 values), `value` input, `targetNodeId` select (from sibling nodes)
  - Drag-to-reorder support (rules evaluate in order)
- **llm_classify mode**:
  - `classificationLabel` input
  - `classificationDescription` textarea (max 200 chars, character counter)
  - Categories list: label input + targetNodeId select, add/remove
- **context_check mode**:
  - `contextKey` input
  - Conditions list: operator select + value input + targetNodeId select
- **Default target**: Always visible at the bottom, `defaultTargetNodeId` select from sibling nodes (required)

Use the existing `SiblingNode` interface from `NodePropertyPanel.tsx` for the target node dropdowns.

### 7. Validation in saveBuilder

In the existing `saveBuilder` procedure's `.superRefine()` block in `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`, add validation for `conditional_branch` nodes:

- `defaultTargetNodeId` must reference a node ID present in the same agency's node list
- Each `rule.targetNodeId` and `category.targetNodeId` must reference valid sibling nodes
- `classificationDescription` max 200 characters
- `rules` array must be non-empty when mode is `rule_based`
- `categories` array must have at least 2 entries when mode is `llm_classify`

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/types.ts` | Modify | Add `"conditional_branch"` to `AgencyNodeType` |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/ConditionalBranchNodeCard.tsx` | Create | New node card component (amber, GitFork) |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/BaseAgencyNode.tsx` | Modify | Add case for `conditional_branch` |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/NodePropertyPanel.tsx` | Modify | Add ConditionalBranchForm section |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` | Modify | Add Zod validation for `conditional_branch` nodeConfig in `saveBuilder` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_conditional_branch.py` | Create | Pure evaluation functions: `evaluate_rule_based`, `evaluate_llm_classify`, `evaluate_context_check` |
| `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_orchestrator.py` | Modify | Add `conditional_branch` case to match statement, add `_evaluate_conditional_branch` method, update edge-skip set |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/agency/test_conditional_branch.py` | Create | pytest unit tests for all 3 evaluation modes |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/agencyConditionalBranch.test.ts` | Create | Vitest tests for Zod validation |
| `/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/nodes/__tests__/ConditionalBranchNodeCard.test.tsx` | Create | Vitest component rendering tests |

---

## Integration Notes

- The `conditional_branch` node type behaves like `router` in the orchestrator: it performs its own routing and does NOT follow normal outgoing edges. Add it to the same skip set as `"router"` for edge traversal.
- JSONPath extraction uses the `jsonpath_ng` library (already a dependency for data transform features in section-21). If implementing this section before section-21, add `jsonpath-ng` to `python-backend/requirements.txt`.
- The LLM Gateway call in `evaluate_llm_classify` must use the existing internal HTTP client pattern (same as `agency_tools.py` HTTP calls) with the user's token for authentication and credit tracking. User content must always be in the human-message role to prevent prompt injection.
- Edge rendering on the canvas: each outgoing edge from a `conditional_branch` node should connect from a specific handle ID (rule ID, category label, or "default"). The `CommunicationEdge.tsx` component may need minor updates to render condition labels on edges, but this is cosmetic and can be deferred.
