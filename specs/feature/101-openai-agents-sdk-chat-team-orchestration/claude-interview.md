# Interview Transcript: Feature 101 OpenAI Agents SDK Chat And Team Orchestration

Date: 2026-04-20

## Interview Outcome

No additional user interview questions were required in this deep-plan run.

Reason:

- The source spec already contains the business and product constraints that normally require user input.
- The user previously delegated remaining trade-off decisions to Codex, asking to choose the best path where judgment is needed.
- The most important non-negotiables are already explicit:
  - use OpenAI Agents SDK for Chat and Team orchestration
  - keep SDK imports behind a Python adapter boundary
  - route all LLM calls through the existing SmartSpecPro gateway so credit deduction remains correct
  - do not hardcode LLM model choices
  - make Team plans visible before execution
  - make every Team step auditable with owner, reviewer, result, verdict, repair loop, and terminal reason
  - remove hidden per-step fallback behavior inside the new runtime
  - keep legacy orchestration only as controlled rollout/rollback
  - support SDK upgrades without destabilizing existing behavior

## Assumptions

1. Chat, Team, Responses, and shared skill runtime are all in scope for this feature. Activation may still be staged independently per surface through separate flags and replay gates.
2. The SDK runtime should be introduced incrementally through feature flags and shadow mode rather than replacing the legacy path in one release.
3. The existing Team audit UI should remain the presentation contract. The runtime should enrich persisted data instead of forcing a full UI rewrite.
4. The existing Node gateway remains the billing, model governance, provider policy, and tenant attribution authority.
5. The Python backend can receive signed execution envelopes from Node and must treat them as the maximum permission scope.
6. Existing Team/Auto-Team tables should be reused wherever they already model execution stage, review, trace, final result, approval, and checkpoint semantics.
7. A generic runtime trace/checkpoint model is still needed for Chat and non-work surfaces because not every Chat turn has Work OS backing.
8. OpenAI Agents SDK upgrades must be explicit dependency changes with adapter contract tests, replay fixtures, trace shape assertions, and shadow/canary validation.

## Auto-Decisions

### Runtime Pattern

Use a hybrid pattern:

- Node owns policy, feature flags, runtime selection, plan locking, persistence, gateway selection, and Team step advancement.
- Python owns the OpenAI Agents SDK adapter, agent/tool/handoff construction, SDK run invocation, trace normalization, and SDK version reporting.
- Team execution remains plan-driven and deterministic. The SDK can execute/review/repair a step, but Node decides whether the next serial step may start.

Rationale: This keeps Team auditable and prevents another "LLM freely decides the workflow" problem.

### SDK Boundary

Create a new `python-backend/app/services/openai_agents_adapter.py` instead of expanding `agency_swarm_adapter.py`.

Rationale: `agency_swarm_adapter.py` is already a temporary agency-oriented exception. A new adapter gives Chat/Team a clean boundary and makes import guard tests simple.

### Model Routing

Do not let the adapter independently choose providers or hardcoded model ids. Node resolves model/gateway metadata through the existing Chat/Team routing stack and sends a gateway-routed model config to the adapter.

Rationale: The user explicitly required Chat/Team model behavior to match the existing gateway/model-selection path and not drift into provider-specific hardcoding.

### Persistence Strategy

Extend existing Team tables and add only cross-surface generic runtime tables:

- extend `team_runs` with hot runtime metadata and a versioned runtime-state envelope
- use `auto_team_execution_stages`, `auto_team_review_records`, and `auto_team_trace_events` for Team projections
- add `agent_runtime_traces` for generic redacted Chat/Team runtime archive
- add `agent_runtime_checkpoints` for Chat/Responses/shared-skill/non-work pause/resume
- reuse `work_approvals` and `work_automation_run_checkpoints` when Team runs are work-backed

Rationale: This avoids a parallel audit model and preserves current Team ledger semantics.

### Feature Flag Rollout

Add disabled-by-default tenant flags for master enablement, Chat shadow, Team shadow, Chat active, Team active, and force rollback. Freeze the chosen runtime on every run.

Rationale: This enables safe rollout and prevents mid-run behavior drift.

### Security Posture

Fail closed by default:

- no permission envelope means no adapter run
- no allowed tool means no tool call
- handoffs use scope intersection, not scope union
- connector access stays brokered by Node/platform services
- traces and logs store redacted data only
- production SDK tracing must disable sensitive input/output capture

Rationale: Rich agent traces and tool calls create a larger blast radius if secrets or permissions leak.

### Testing Strategy

Use the repository's existing contract-test style:

- TypeScript/Vitest for schema, feature flags, routers, Node runtime selection, trace persistence, Team invariants
- Python/pytest for adapter DTOs, SDK import boundary, gateway client construction, streaming/cancel/resume normalization, guardrail/handoff behavior
- replay fixtures for Chat and Team parity

Rationale: This matches current repo conventions and gives regression confidence without requiring broad E2E rewrites first.
