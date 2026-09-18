# Feature 200 implementation evidence

## Section status

- section-01-agent-contracts-and-job-handoff: implemented provider-neutral manifest/event contracts and handoff to existing `external_agent_task`.
- section-02-provider-adapters: implemented one adapter registry interface; Codex/Claude/Antigravity/DeepSeek/Hermes/OpenClaw process adapters remain provider/runtime gates.
- section-03-runner-and-runtime: Runner eligibility reuses Feature 197 contracts; process/workspace execution remains a connected-runtime gate.
- section-04-context-skills-assets-mcp: manifest carries scoped references and MCP grant IDs; direct credential/upstream access is rejected.
- section-05-verification-and-ui: event/manifest boundaries are implemented, and the inline Task Control tab in the global `AI Chat & Feedback` surface exposes the Agent entry with live Job/Runner/MCP readiness, open task-group control and composer handoff. The `/chat` entry remains available, but global chat/control access does not navigate there. Verified diff/artifact projection and provider-runtime Agent event evidence remain integration gates.
- section-06-migration-tests-and-acceptance: no second Job ledger or local Docker/OpenSandbox dispatch was added; provider matrix/rollback remain release gates.
- Task Control multi-step tracking: the existing panel now consumes a protected
  `workerJobs.taskGroups` projection, shows all returned open groups with
  bounded continuation, and expands plan/workflow groups into ordered steps
  with status, progress, latest safe event, worker and permitted cancellation.
  Completed dependency predecessors are included only through tenant/requester
  scoped canonical job IDs.

## Evidence

Focused Agent contract suite: 3 tests passed. The job handoff uses the existing
external-agent Job type rather than introducing `agent.external_task`.

Focused UI evidence: `UniversalControlPlanePanel.test.tsx` covers loading,
partial-error, live job/Runner/MCP states and task handoff to Chat composer.
Browser smoke passes at 390×844, 768×1024 and 1440×900 for the inline Task
Control tab and responsive Job/Runner/MCP projections. Provider-backed Agent
start, live events, verified diff/artifact and final result evidence remain
runtime gates. The single `AI Chat & Feedback` button embeds this same Task
Control Center and Chat composer without creating a second Agent execution
surface.

Focused hierarchical Task Control evidence: 26 Vitest tests pass across the
worker monitor, router, orchestration contract and panel suites. The monitor
tests cover plan grouping, dependency predecessor inclusion, progress clamping,
malformed metadata isolation and safe-field redaction. Playwright passes 4/4
control-plane browser tests across mobile/tablet/desktop plus the global
outside-`/chat` entry; the browser fixture expands a two-step plan and checks
step progress without horizontal overflow.

## 2026-09-18 implementation audit corrections

- Agent manifests now normalize bounded identity/list fields, reject duplicate
  references and fail closed for malformed runtime payloads/events.
- The existing `external_agent_task` handoff and adapter registry remain the
  only provider boundary. Provider process adapters, connected runtime result
  projection, verified diff/artifact rendering and browser/UI evidence remain
  explicit integration gates. The panel does not claim an Agent result is
  verified merely because a Job exists.
