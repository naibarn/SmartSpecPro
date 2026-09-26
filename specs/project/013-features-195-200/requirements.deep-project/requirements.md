# Features 195–200 Implementation Requirements

Implement the approved target specifications in dependency order:

1. `specs/feature/195-unified-async-job-control-plane/spec.md` — Unified Async Job Control Plane.
2. `specs/feature/196-universal-goal-orchestration/spec.md` — Universal Goal Orchestration, Capability and Command Gateway.
3. `specs/feature/197-runner-adaptive-execution-fabric/spec.md` — Runner Adaptive Execution Fabric.
4. `specs/feature/198-intelligent-chat-universal-orchestration-capability-evolution/spec.md` — Intelligent Chat and Capability Evolution.
5. `specs/feature/199-external-mcp-gateway-upstream-management/spec.md` — External MCP Gateway and Upstream Management.
6. `specs/feature/200-universal-coding-agent-control-plane/spec.md` — Universal External Agent Control Plane.

## Shared requirements

- Reuse canonical PostgreSQL `worker_jobs` and transactional outbox for durable execution.
- Keep Goal/Plan/Capability/Command, Runner/device, Chat/Assistant, External MCP and External Agent ownership separate.
- Reuse existing MCP, agent runtime, Runner and Chat code where present; label partial code honestly and map target additions to actual files.
- Enforce tenant/auth authority on the server, bounded retry, idempotency, lease/fencing, auditability and rollback-safe migrations.
- Keep realtime transport separate from durable state.
- Never add or reactivate Agency, work requests/workpacks, the retired `/workflows` engine, OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch.
- Do not run whole-repository typecheck because of RAM constraints.
- Implement and test every section in each source specification, with a focused gate after each feature.
- Finish with at least ten full cross-spec consistency rounds and repair discovered gaps.

## UI surfaces

- Feature 198 owns `/chat` and Universal Assistant control UI.
- Feature 199 owns role-scoped MCP Center/Connected Apps experiences built over current MCP settings/admin foundations.
- Feature 197 owns Runner connection/device experiences.
- Feature 200 owns Agent Panel/live task/approval/result experiences inside Chat/Assistant.

## Acceptance

All six specs have a deep plan, TDD plan and section task set; implementation follows the dependency order; focused tests and static checks pass for changed paths; no duplicate source of truth or retired dispatch path is introduced; target gaps are either implemented or recorded with an explicit blocker and evidence; the final ten-round audit has no unresolved high-confidence gap.
