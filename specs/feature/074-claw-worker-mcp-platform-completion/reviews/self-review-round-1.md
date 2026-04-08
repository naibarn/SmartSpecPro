# Self Review Round 1

## Scope reviewed

- `claude-spec.md`
- `claude-research.md`
- `claude-interview.md`
- `claude-plan.md`
- `claude-plan-tdd.md`

## Scorecard

| Category | Result | Notes |
|---|---|---|
| Structural integrity | Pass | Plan and TDD mirror the same major workstreams and delivery phases. |
| Completeness vs spec | Pass after fixes | The plan covers canonical MCP, delegated-worker auth, truthful discovery, family parity, billing, legacy migration, and safety posture. |
| Implementability | Pass | The plan maps work to concrete files and existing services in `apps/web`. |
| Internal consistency | Pass after fixes | Discovery surfaces and callback behavior are now aligned more clearly. |
| Edge cases and safety | Pass after fixes | Retry/idempotency, untrusted content, active-content safety, approval gates, and browser gating are all covered. |

## Issues found and fixed

### 1. Static MCP catalog relationship was underspecified

Issue:

- the plan mentioned a machine-readable MCP catalog, but did not clearly say how it relates to authenticated `tools/list`

Fix applied:

- clarified that the static catalog is for general developer understanding only
- clarified that authenticated `tools/list` and the delegated manifest remain the runtime truth

### 2. Callback/reporting seam was too implicit

Issue:

- MCP-triggered work can create long-running jobs, but the plan did not clearly say how results should return to owner-facing surfaces

Fix applied:

- clarified that MCP-triggered work should reuse the existing worker callback posture from Feature 072 instead of inventing a second notification model
- added matching TDD coverage

### 3. Advanced MCP capability posture needed stronger wording

Issue:

- prompts/resources/browser parity could still be misread as near-term obligations

Fix applied:

- kept browser explicitly gated until policy parity is preserved
- kept prompts/resources as later optional capability work instead of first-pass commitments

## Remaining concerns

No blocking concerns remain for planning quality. The main implementation risk is still operational truthfulness: the team must resist exposing tools before their real execution adapters are ready.
