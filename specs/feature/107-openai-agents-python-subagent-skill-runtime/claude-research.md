# Research Notes

## Research Decision

Research auto-decision:
- Codebase: yes. This is an existing Git repository with a mature web backend, Python backend, skill runtime, and admin UI.
- Web topics: yes. The feature depends on OpenAI Agents Python orchestration, handoffs, agents-as-tools, sessions/resume, tracing, and guardrails.
- Testing: yes. Existing conventions are pytest for `python-backend/` and vitest for `apps/web/`.

## Codebase Research

### Existing skill and bundle seams

- `apps/web/skills/intelligence-skill-creator/python/skill.py` already routes create/improve flows and detects native bundle hints such as `agents_python`.
- `apps/web/skills/intelligence-skill-creator/isc/native_bundle.py` already scaffolds native bundles with `SKILL.md`, `skill.lock.json`, scripts, references, and compatibility metadata.
- `apps/web/skills/intelligence-skill-creator/isc/creator.py` and `isc/cli.py` already own bundle generation and migration-style flows.
- `apps/web/server/services/skillFiles.ts` and `skillRegistry.ts` already resolve manifests, bundle files, and lockfiles. They are the natural place to extend bundle discovery for `subagents.json` and `agents/`.

### Runtime and durability seams

- `python-backend/app/services/openai_agents_adapter.py` is the real adapter for OpenAI Agents Python runtime behavior.
- `python-backend/app/services/openai_agents_skill_runtime.py` already mounts a native skill bundle into a sandboxed agent shell flow.
- `python-backend/app/services/openai_agents_skill_supervisor.py` already has phase-based execution and checkpoint persistence concepts.
- `python-backend/app/services/openai_agents_skill_persistence.py` already writes durable state into `state/`, `logs/`, and `out/` and redacts sensitive fields before persistence.

### Maintenance and observability seams

- `apps/web/server/services/skillCompatibilityGate.ts` already snapshots bundle contents, hashes manifests, and classifies native bundle readiness.
- `apps/web/server/services/skillMaintenanceAnalyzer.ts` already scores skills for upgrade readiness and can be extended to score subagent topology drift.
- `apps/web/server/services/skillUpgradeApplier.ts` already owns maintenance apply/retry logic and is the right place to preserve or repair topology during upgrades.
- `apps/web/server/services/skillExecutor.ts` already packages skill bundles into sandbox executions and skips risky directories such as `runs/`, `node_modules/`, `.git`, and virtualenvs.
- `apps/web/server/services/skillStudioService.ts` already launches create/improve workflows and passes skill execution tokens into the runtime.

### Admin UI seams

- `apps/web/client/src/pages/AdminSkills.tsx` already exposes maintenance queues, apply actions, and legacy upgrade filters.
- `apps/web/client/src/pages/AdminLegacyUpgradeRunDetail.tsx` already shows task IDs, run metadata, and failure reasons.
- `apps/web/client/src/pages/Dashboard.tsx` already links into maintenance and can host shortcuts for subagent visibility.

## Web Research

### OpenAI Agents SDK orchestration

- OpenAI Agents Python documents two primary orchestration patterns: agents as tools and handoffs.
- Use `Agent.as_tool()` when a central orchestrator should stay in control and call specialists for bounded subtasks.
- Use handoffs when ownership should truly move to a specialist and that specialist should become the active agent.
- Nested handoffs are documented as beta, so the plan should not depend on them for the core workflow.

Source:
- https://openai.github.io/openai-agents-python/multi_agent/
- https://openai.github.io/openai-agents-python/tools/
- https://openai.github.io/openai-agents-python/handoffs/

### Context, sessions, and resume

- `RunContextWrapper.context` is for local dependencies and state and is not sent to the LLM.
- Persistent conversation state belongs in sessions or resumable run state, not in ad hoc prompt text.
- `Runner.run(...)` and the SDK session abstractions support keeping state across turns and resuming interrupted runs.
- The plan should keep secret material out of serialized state because run state may be persisted.

Source:
- https://openai.github.io/openai-agents-python/context/
- https://openai.github.io/openai-agents-python/running_agents/
- https://openai.github.io/openai-agents-python/sessions/
- https://openai.github.io/openai-agents-python/results/

### Tracing and guardrails

- The Agents SDK includes built-in tracing for generations, tool calls, handoffs, guardrails, and custom events.
- Tool guardrails exist for `function_tool`, but they do not cover every tool class uniformly.
- `Agent.as_tool()` does not currently expose tool-guardrail options directly, so contract validation and runtime allowlists must enforce boundaries outside the guardrail layer.

Source:
- https://openai.github.io/openai-agents-python/tracing/
- https://openai.github.io/openai-agents-python/guardrails/
- https://openai.github.io/openai-agents-python/ref/tool_guardrails/

## Testing Approach

### Python backend

- Framework: `pytest`
- Async mode: `asyncio_mode = auto`
- Coverage: 80% minimum enforced by `python-backend/pyproject.toml`
- Common markers: `unit`, `integration`, `e2e`, `slow`, `security`, `sandbox`, `agency`
- Example conventions:
  - `python-backend/tests/unit/test_openai_agents_skill_runtime.py`
  - `python-backend/tests/test_skill_manifest.py`
  - `python-backend/tests/security/test_security.py`

Recommended command:
- `cd python-backend && uv run pytest`

### Web app

- Framework: `vitest`
- UI tests: `jsdom` via `apps/web/vitest.config.ts`
- Server/shared tests: `node`
- Common file patterns:
  - `apps/web/client/src/pages/__tests__/...`
  - `apps/web/server/services/__tests__/...`
  - `apps/web/shared/__tests__/...`

Recommended command:
- `cd apps/web && npm run test`

## Plan Implications

- The implementation should extend existing seams instead of introducing a parallel runtime.
- The bundle contract should be machine-readable and validated before execution.
- The orchestrator should remain in control by default and use agents as tools first.
- Handoffs should remain available but optional, not mandatory for the core path.
- Durable lineage and resumable state need to be stored separately from the LLM conversation context.
- Security checks must live at the loader/validator boundary because SDK guardrails alone are not sufficient for every tool shape.
