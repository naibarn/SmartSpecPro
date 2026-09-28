# Deep-plan research: Feature 151

## Research decision

This plan requires repository research, dependency research, and testing-context research. SocratiCode was attempted as the preferred discovery layer but its `codebase_*` tools are not available in this runtime, so the evidence below comes from targeted `rg`, file reads, package metadata, and existing focused tests. No broad rewrite or unrelated worktree cleanup was performed.

## Current implementation evidence

- The Node runtime already has a versioned contract in `apps/web/shared/agentRuntime/types.ts` (runtime/trace/checkpoint versions, supported surfaces/origins, request/response schemas, review verdicts, checkpoints, trace and retry policy).
- `apps/web/shared/agentRuntime/skillManifest.ts` already models skill capabilities, supported callers, evidence, review checklists, failure modes, write scope, side-effect class, risk and budget metadata. This is the correct registry seam for Orchestra planning rather than inventing a second skill catalog.
- Python mirrors the contract in `python-backend/app/services/openai_agents_contracts.py`, with tests in `python-backend/tests/unit/test_openai_agents_contracts.py`.
- The authenticated Python runtime boundary is `python-backend/app/api/internal_openai_agents_runtime.py`; it exposes run, streamed run, resume, cancel and health operations. `openai_agents_adapter.py` and `openai_agents_skill_runtime.py` provide the SDK execution seams.
- Node orchestration is split across `apps/web/server/services/agentRuntime/client.ts`, `requestBuilder.ts`, `skillRuntimeOrchestrator.ts`, and the chat/team/responses orchestrators. The implementation should extend these seams and preserve their existing trace/checkpoint behavior.
- Existing focused tests cover adapter contracts, imports, stream/resume, trace redaction, skill runtime, sub-agent contracts, internal API, and multiple Agency Swarm paths. They must remain green while Agency is frozen and migrated.

## Dependency evidence

At planning time, `python-backend/requirements.txt` contains `openai>=2.36.0,<3`, `openai-agents==0.17.4`, and `agency-swarm==1.8.0`. The current Python project requires Python 3.12. PyPI reports `openai-agents` 0.21.1 as the latest release and its metadata requires `openai>=3,<4`, `pydantic>=2.12.2`, and HTTPX-compatible modern dependencies. Therefore an unconditional SDK bump while Agency imports remain active is unsafe: the resolver conflict must be handled as a migration wave with a separate read-only Agency export profile.

Official SDK documentation describes the Agent/Runner model, tools, handoffs/agents-as-tools, guardrails, sessions, and tracing. Orchestra uses those primitives for planning and specialist delegation, but the platform retains deterministic contract, budget, evidence, credit, and side-effect gates outside the model.

Sources:

- https://pypi.org/project/openai-agents/
- https://pypi.org/pypi/openai-agents/json
- https://openai.github.io/openai-agents-python/

## Constraints and implications

1. Contract changes must be additive and support current/current-minus-one compatibility; Node remains authoritative for tenant, user, credit, attempt and side-effect admission.
2. Vision-required tasks must fail closed before paid generation when evidence is unreadable, ambiguous, missing, or contains unresolved people. Text-only fallback is never an implicit downgrade.
3. Provider limits (including Kie/Grok 4096 characters) must be explicit capability profiles. The composer may compress only through a recorded repair; it must never silently truncate or drop references.
4. Custom character descriptions have precedence over inferred left/right position, and duplicate character selections remain user-controlled. The verifier must detect contradictory speaker/identity cues before credits are spent.
5. Future scene modes (phone UI, cross-location cuts, shouting across locations, narration, prop interactions) are registry task kinds and rule packs, not one-off prompt patches.
6. Agency Swarm has no active execution fallback. It is frozen, reconciled, then removed only after historical read-only migration and zero active references are proven.

## Focused verification baseline

Use `DEBUG=false uv run --with pytest python -m pytest --no-cov <focused tests>` for Python because the repository-wide coverage gate is not useful for a focused slice. Use the existing Vitest scripts for Node runtime tests and `git diff --check` for every section. Browser, provider-credit, deployment, and authenticated production checks remain explicit release gates and are not claimed by local tests.
