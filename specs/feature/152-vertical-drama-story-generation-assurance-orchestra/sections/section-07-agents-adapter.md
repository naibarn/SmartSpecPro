# Section 07: Feature 151 Adapter and Optional Agents SDK

## Objective

Provide a typed adapter to the existing assurance runtime and a safe optional
Agents SDK path without moving business authority out of Node.

## Owned paths

- `apps/web/server/services/verticalDramaStoryGenerationAgentAdapter.ts`
- `apps/web/server/services/verticalDramaStoryGenerationSkills.ts`
- existing Feature 151 registry/adapter seam
- optional package/config seam and focused adapter tests

## Required behavior

- Derive Feature 151 `AgentTaskContract` with matching versions, inputRefs,
  evidence/output/validation/side-effect policy, provider policy, rule packs,
  budgets, idempotency, and Node-computed policy/contract hash.
- Register story generation under a stable task kind and map runtime states to
  domain states, including approval and reconciliation.
- Skills are deterministic-context, plan-alignment, continuity-review, and
  repair-planning capabilities with versioned rule-pack IDs.
- If Agents SDK is present, use structured output, tool guardrails, redacted
  tracing, bounded turns/concurrency, and serializable approval state behind a
  flag. If absent, the adapter remains a typed no-op/fallback and does not add a
  dependency solely for this feature.
- Python/agent output is advisory; Node revalidates hashes, schema, source,
  quality, side effects, and final persistence.

## TDD and proof

Test contract parity, hash mismatch rejection, flag-off fallback, malformed
structured output, guardrail rejection, trace redaction, approval resume, and
budget exhaustion. Do not claim live Agents SDK/provider proof in local tests.

## UI/UX Contract

### Target User / JTBD
N/A: agent orchestration is an internal adapter; user-visible states are
specified in section 06.

### Existing Pattern Reference
Reuse Feature 151 runtime status and approval payload conventions.

### Surface Inventory
None directly.

### Component Map
None.

### State Matrix
N/A; adapter states map to section 06 summaries.

### Responsive Matrix
N/A; no UI is changed.

### Accessibility Acceptance
N/A; approval metadata must remain accessible to the consuming UI.

### Copy Contract
N/A; expose stable reason codes only.

### Browser Evidence Required
None for this section; adapter tests and trace-redaction checks are required.
