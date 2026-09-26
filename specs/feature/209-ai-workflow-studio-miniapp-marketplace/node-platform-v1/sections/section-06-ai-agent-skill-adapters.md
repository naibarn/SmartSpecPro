# Section 06 — LLM, AI agent, skill, and external agent adapters

## Goal

Make AI nodes functional and distinct: a prompt node accepts a prompt and
upstream values, structured LLM validates output, skills use their real schema,
and agents have bounded tools/memory/turns.

## Owned paths

- `apps/web/server/services/workflowStudioNodeAdapters/ai.ts`
- `apps/web/server/services/workflowStudioAiBindings.ts`
- AI/skill adapter tests and schema fixtures.

## Node coverage

`llm-prompt`, `llm-structured`, `classifier`, `summarizer`, `translator`,
`prompt-template`, `ai-agent`, `skill`, `external-agent`, and `subflow-call`.
Cross-spec AI/execution coverage additionally includes `external-agent-task`,
`capability-search`, `capability-describe`, `capability-invoke`,
`capability-status`, `capability-result`, `asset-select`, `asset-preview`,
`context-package`, `workspace-bind`, `git-operation`, `verification`,
`code-task`, `managed-agent-fleet`, and `agent-session-control`.

## Behavior

- LLM prompt/structured nodes expose model, prompt/template, upstream mapping,
  system instruction, temperature, max tokens, response format/schema, timeout,
  retry, fallback, and budget settings. Outputs include text/structured value,
  usage, model, and cost metadata where available.
- Classifier/summarizer/translator have opinionated config and output schemas;
  they must not collapse into the generic prompt node.
- Prompt template compiles explicit variables and reports missing values before
  execution.
- AI agent enforces tool allowlist, memory scope, max turns, budget, output
  schema, and approval gates for risky tools.
- Skill resolves actual skill metadata, renders `input.json`/`ui.json`, accepts
  typed mappings, and invokes existing `skillJobExecutor`/canonical worker
  contract with tenant/user/run identity.
- External agent uses an approved worker/runtime capability manifest. No path may
  fall back to retired Agency behavior.
- Subflow-call validates the callee contract and returns declared outputs.
- External-agent-task resolves Spec 200/206/210/211 logical requirements using
  the shared execution envelope. It may select native, A2A, Orca, ACP, Gas
  City, Runner, or approved container routes, but stores only logical policy
  in the definition and pins the resolved snapshot at admission.
- Capability nodes use the canonical search/describe/invoke/status/result
  contract. `context-package`, `asset-*`, workspace/Git and verification nodes
  preserve provenance, authorization, child lineage, effect receipts and
  authoritative postconditions.

## TDD-first checks

- Missing model/prompt/schema/settings fail before job admission.
- Upstream template values resolve safely and never leak secret values.
- Invalid structured output is a typed failure, not silent text success.
- Skill form values round-trip to the real executor payload.
- Agent tool/turn/budget scopes and external-agent permissions are enforced.
- A2A/Orca/ACP/Gas City route choice, Agent Card freshness, fallback ambiguity,
  session lifecycle, managed-fleet child limits, workspace scope, and
  verification evidence are tested without creating a second job or registry.

## Exit criteria

The user can drag an LLM or Skill node, configure it in forms, map prior outputs,
run it through the real capability, and inspect actual output/usage/error.

## UI/UX Contract

### Target User / JTBD

N/A for direct UI; this section defines real AI/Skill data and errors consumed by the inspector/run dock.

### Existing Pattern Reference

Reuse `DynamicSkillForm` and existing model selectors; rendered composition is section 10.

### Surface Inventory

N/A — adapter layer only.

### Component Map

N/A — section 10 owns LLM/Skill cards and forms.

### State Matrix

Missing model/prompt, schema error, provider unavailable, running, usage, and output states are emitted for UI rendering.

### Responsive Matrix

N/A — section 10 owns responsive AI/Skill forms.

### Accessibility Acceptance

N/A — section 10 verifies form labels and output semantics.

### Copy Contract

Return localized model/skill validation and provider error keys.

### Browser Evidence Required

N/A for direct browser behavior; section 12 covers real LLM/Skill evidence.
