# Implementation Plan

This plan describes how to evolve SmartSpecPro Feature 106 into a full OpenAI Agents Python runtime that can create, improve, run, maintain, and migrate skills with first-class specialist subagents.

The implementation strategy is intentionally incremental:

- preserve the existing single-skill contract
- add subagent support as an explicit opt-in bundle capability
- keep the orchestrator in control by default
- use `Agent.as_tool()` for bounded specialist work first
- reserve handoffs for cases where ownership should truly transfer
- keep runtime state, lineage, and traceability in durable files and database records

The plan uses the existing codebase seams rather than inventing a parallel system.

## 1. Shared Contract and Validation

### Objective

Define the machine-readable and prose bundle contract for subagent-aware skills, then teach the registry, compatibility gate, and bundle creator to validate it consistently before execution.

### Why this comes first

Nothing else should be able to run if the bundle contract is ambiguous. The runtime, maintenance pipeline, and UI all depend on the same authoritative bundle description.

### What the contract must express

The bundle must keep the Feature 106 artifacts and add subagent-aware artifacts:

- `SKILL.md` as the primary human-readable contract
- `skill.lock.json` as the bundle lock and compatibility source
- `MODEL_COMPATIBILITY.md` as the runtime/model policy mirror
- `agents/orchestrator.md`
- `agents/specialists/*.md`
- `references/subagents.md`
- `subagents.json` as the machine-readable manifest

The machine-readable manifest must describe:

- orchestrator metadata
- subagent name, role, mode, entrypoint, and tool boundary
- handoff policy
- checkpoint policy
- verification policy
- fallback policy
- routing rules
- security policy
- manifest integrity data

The security policy must describe:

- tool allowlist and denylist rules
- network egress permissions
- filesystem scope for each agent and subagent
- secret handling and redaction boundaries
- fanout and concurrency ceilings
- whether a subagent may use `Agent.as_tool()`, handoff, or both

The integrity data must make validation deterministic:

- manifest hash or signature reference
- lock hash or version pin reference
- schema version for `subagents.json`

### Files and modules to extend

- `apps/web/skills/intelligence-skill-creator/isc/native_bundle.py`
- `apps/web/skills/intelligence-skill-creator/isc/creator.py`
- `apps/web/skills/intelligence-skill-creator/isc/cli.py`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`

### Implementation notes

- Extend native bundle scaffolding so it emits `agents/` and `subagents.json` alongside the existing Feature 106 files.
- Add parsing and validation helpers for `subagents.json` so runtime and maintenance do not need to infer topology from prose.
- Keep `SKILL.md` authoritative for humans, but require `subagents.json` to agree with it before the bundle can be marked valid.
- Add bundle discovery rules for subagent-aware bundles without breaking `skill.md`/`SKILL.md` compatibility or legacy manifests.
- Reject contract/path mismatches before the runtime loads any subagent code.
- Keep compatibility metadata explicit in `skill.lock.json` and `MODEL_COMPATIBILITY.md`, including runtime tier, subagent support tier, and deterministic-script expectations.
- Validate manifest integrity and security policy before any subagent code is loaded or any specialist tool is invoked.

### Expected outcome

After this section, the repository can represent a subagent-aware bundle as a concrete contract, and all validation layers agree on what files must exist and what fields must match.

## 2. ISC Create, Improve, and Migration Flow

### Objective

Teach the Intelligence Skill Creator to generate subagent-aware bundles, improve legacy skills toward subagent awareness when it is genuinely useful, and migrate old bundles into the new contract without losing compatibility.

### Why this comes second

The authoring flow should be able to produce the same contract that the runtime expects. If the creator cannot emit the right bundle shape, the runtime changes will never be reachable through normal product flows.

### Behavior to support

- create a new skill with one orchestrator and one or more specialists
- improve an existing skill into a subagent-aware bundle only when delegation materially helps the workflow
- preserve single-agent bundles as valid outputs
- generate `agents/` markdown, `subagents.json`, and compatibility docs
- preserve deterministic wrapper scripts and mirror files during migration

### Files and modules to extend

- `apps/web/skills/intelligence-skill-creator/python/skill.py`
- `apps/web/skills/intelligence-skill-creator/isc/creator.py`
- `apps/web/skills/intelligence-skill-creator/isc/native_bundle.py`
- `apps/web/skills/intelligence-skill-creator/isc/cli.py`
- `apps/web/skills/intelligence-skill-creator/schemas/input.schema.json`
- `apps/web/skills/intelligence-skill-creator/schemas/ui.schema.json`
- `apps/web/skills/intelligence-skill-creator/skill.md`
- `apps/web/skills/intelligence-skill-creator/SKILL.md`

### Implementation notes

- Add create/improve guidance that can distinguish between single-agent, manager-style, and handoff-style bundles.
- Add input fields for subagent-aware creation and improvement requests so the UI can collect explicit intent instead of guessing from prose alone.
- When improving a legacy skill, preserve existing slugs, public inputs, and output contracts unless the user explicitly asks for a breaking change.
- Generate specialist scaffold files only when the workflow benefits from delegation. Do not force every bundle to become subagent-aware.
- Keep the compatibility mirror behavior during migration so older loaders still find the expected bundle entrypoint files.

### Expected outcome

After this section, ISC can create or improve a bundle that the runtime can mount without manual editing, and the migration path from legacy single-agent bundles is explicit and safe.

## 3. OpenAI Agents Python Runtime and Supervisor

### Objective

Extend the Python backend so OpenAI Agents Python can load a subagent-aware skill bundle, resolve its topology, execute specialist agents as tools or handoffs, and checkpoint both parent and child execution units.

### Why this comes third

The runtime is the core execution path. It should consume the contract from Section 1 and the bundles from Section 2, then expose durable phase-based execution for the rest of the system.

### Runtime behavior to implement

- inspect the mounted bundle before execution
- read `SKILL.md`, `skill.lock.json`, and `subagents.json`
- build the orchestrator agent and the specialist agents described in the manifest
- choose `Agent.as_tool()` for bounded specialist tasks by default
- use handoffs only when ownership should move to a specialist
- maintain parent and child checkpoints across phases
- persist lineage and verification state for resumable runs

### Files and modules to extend

- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_skill_runtime.py`
- `python-backend/app/services/openai_agents_skill_supervisor.py`
- `python-backend/app/services/openai_agents_skill_persistence.py`
- `python-backend/app/services/openai_agents_subagent_contracts.py`

### Implementation notes

- Keep `RunContextWrapper.context` for local dependencies and runtime state, but do not place secrets there because runtime state may be serialized.
- Use sessions or resumable run state for durable conversation memory rather than stitching history manually.
- Use SDK tracing spans so tool calls, handoffs, and custom subagent events remain visible in the OpenAI trace viewer and in product logs.
- Trace tool calls, handoffs, checkpoints, and subagent phases so the run history can be inspected later.
- Persist a normalized lineage record with parent run ID, child run IDs, role, status, checkpoint version, resume cursor, verification status, and artifact references.
- Treat subagent-aware execution as an extension of the current phase supervisor, not as a separate runtime stack.
- Prefer loading only the specialist agents required by the manifest and routing rules for the current run so large bundles do not inflate every prompt or tool surface.
- Respect a per-run fanout budget so child subagents cannot be spawned without limit; parallel specialist calls should stay bounded by the manifest routing rules and the existing runtime budget policy.
- Finalize only after the parent run and every runtime-visible child subagent have passed the required verification step.

### Data model

- Extend the existing generic agent runtime archive instead of inventing a parallel system.
- Prefer extending `agent_runtime_traces` and `agent_runtime_checkpoints` with lineage fields over creating a separate persistence stack.
- Keep the parent run ID, child run ID, subagent name, subagent role, bundle version, verification state, schema version, and resume cursor queryable from the same durable archive that stores runtime traces.
- If the existing generic trace/checkpoint tables become too wide, add a compact lineage table keyed by tenant and run IDs, but keep checkpoint and resume state canonical in one place.
- Apply additive schema migrations first, then backfill lineage rows, then switch readers to the new fields, and only then remove legacy fallback paths.
- Version any new lineage schema explicitly so the runtime can reject incompatible bundle or checkpoint data early.

### Expected outcome

After this section, the Python backend can execute a skill with specialist subagents, record the full run lineage, and resume safely after interruption.

## 4. Web Execution Plumbing and Lineage Capture

### Objective

Teach the web backend to package, launch, trace, and persist subagent-aware runs so the runtime data is visible to the rest of the product.

### Why this comes fourth

The runtime needs a launch path. The web backend already owns skill execution and studio flows, so it should be extended to pass topology and trace metadata through the existing workflow instead of bypassing it.

### Files and modules to extend

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`

### Implementation notes

- Extend bundle packaging so subagent-aware files are mounted and preserved in sandboxed execution.
- Capture runtime metadata such as parent run IDs, child run IDs, task IDs, bundle version, and verification status alongside the existing failure metadata.
- Use the same lineage model for every launch surface: admin-triggered runs, skill studio runs, runtime-driven orchestrator calls, and retry/resume flows for parent or child execution.
- Ensure sandbox skip rules continue to exclude garbage like `runs/`, `.git`, and virtual environments, while still allowing the new `agents/` and `subagents.json` files.
- Expose topology and lineage through the same skills router that already serves maintenance and run detail data.
- Keep failure reasons actionable: distinguish parent orchestration failures, child subagent failures, and contract/compatibility failures.
- Preserve the existing authorization envelope for every launch surface. Subagent-aware runs must not bypass the same user/admin checks, execution token checks, or tenant scoping that the current skill runtime already enforces.

### Expected outcome

After this section, the web backend can launch a subagent-aware skill, retain the trace data needed for debugging, and expose that lineage to the UI and maintenance pipeline.

## 5. Maintenance, Compatibility, and Automatic Repair

### Objective

Extend the maintenance system so it can detect subagent contract drift, rank legacy skills for subagent migration, and repair bundles safely without widening scope or breaking existing callers.

### Why this comes fifth

Maintenance should operate on the same contract that create and runtime use. It should not guess about subagents; it should compare the manifest, bundle files, and runtime state against the declared contract.

### Files and modules to extend

- `apps/web/server/services/skillMaintenanceAnalyzer.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/routers/skills.ts`

### Implementation notes

- Teach the analyzer to score missing subagent manifests, missing checkpoint policies, stale routing, and scope widening as separate maintenance signals.
- Treat manifest hash mismatches, signature failures, and policy drift as first-class maintenance signals.
- Preserve the current bundle compatibility scoring, but add subagent topology completeness as a first-class factor.
- Let the upgrade applier repair non-breaking subagent metadata automatically when the bundle is otherwise healthy.
- Require explicit approval for breaking topology changes, path widening, or contract rewrites.
- Re-verify the bundle after any automatic repair before marking the recommendation healthy.

### Expected outcome

After this section, maintenance can tell the difference between a simple missing file, a broken topology, and a real migration opportunity, and it can safely repair the first two without silently changing behavior.

## 6. Admin UI and Observability

### Objective

Expose subagent topology, parent-child lineage, and failure reasons in the admin experience so operators can see what happened without reading logs or opening raw artifacts.

### Why this comes sixth

The UI should consume real runtime data only after the backend can produce it reliably. At that point the UI can remain thin and truthful instead of inventing status from heuristics.

### Files and modules to extend

- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/client/src/pages/AdminLegacyUpgradeRunDetail.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`
- locale files used by the admin pages and runtime detail pages

### Implementation notes

- Add topology cards and child-run inspection panels to the maintenance views.
- Show parent/child lineage, task IDs, status, checkpoint state, and verification state in a way that makes failures easy to diagnose.
- Keep the existing maintenance filters and shortcuts, but add subagent-specific views for orchestrator failure, child failure, and handoff failure.
- Add dashboard shortcuts for maintenance inspection so operators can jump straight into the runtime detail surface.
- Make sure the UI renders blocked versus failed versus completed outcomes consistently and can surface repair or retry actions when they are actually allowed.

### Expected outcome

After this section, operators can inspect subagent-aware runs from the dashboard and admin pages without losing the parent/child context that explains why a run succeeded or failed.

## 7. Testing, Rollout, and Operational Hardening

### Objective

Lock the behavior down with tests, then roll out the feature in a way that preserves backward compatibility and prevents unsafe bundle execution.

### Why this comes last

The feature spans the creator, runtime, maintenance, and UI layers. It needs coverage at each boundary and at the integration points between them before it can be considered production-ready.

### Testing strategy

- Python backend tests should use `pytest`, asyncio auto mode, and the existing coverage thresholds.
- Web tests should use `vitest` with jsdom for client views and node for server/shared service tests.
- New tests should cover contract validation, runtime routing, lineage persistence, maintenance drift detection, and UI observability.

### Files and modules to extend

- `python-backend/tests/unit/test_openai_agents_skill_runtime.py`
- `python-backend/tests/unit/test_openai_agents_skill_supervisor.py` or a new companion test module
- `python-backend/tests/unit/test_openai_agents_subagent_contracts.py` or a new companion test module
- `apps/web/server/services/__tests__/skillCompatibilityGate*.test.ts`
- `apps/web/server/services/__tests__/skillMaintenanceAnalyzer*.test.ts`
- `apps/web/server/services/__tests__/skillUpgradeApplier*.test.ts`
- `apps/web/client/src/pages/__tests__/AdminSkills*.test.tsx`
- `apps/web/client/src/pages/__tests__/AdminLegacyUpgradeRunDetail*.test.tsx`
- `apps/web/client/src/pages/__tests__/Dashboard*.test.tsx`

### Rollout notes

- Keep single-agent bundles valid during the rollout.
- Ship validation and discovery changes before enabling automatic creation of subagent bundles.
- Enable runtime loading only after manifest validation and lineage persistence are in place.
- Enable maintenance repair only after the validator can reject contract mismatches safely.
- Add integration tests for the full flow: create → load → run → persist → inspect → maintain.
- Add security tests for path integrity, manifest mismatch rejection, manifest hash or signature verification, security-policy enforcement, and secret redaction in runtime state.
- Add migration tests that prove additive lineage/schema changes do not break existing single-agent checkpoints or resume paths.

### Expected outcome

After this section, the feature is covered by tests and can be rolled out incrementally without breaking existing single-agent skill behavior.

## Execution Order

1. Shared contract and validation
2. ISC create, improve, and migration flow
3. OpenAI Agents Python runtime and supervisor
4. Web execution plumbing and lineage capture
5. Maintenance, compatibility, and automatic repair
6. Admin UI and observability
7. Testing, rollout, and operational hardening

## Success Criteria

- The system can create a subagent-aware bundle without manual edits.
- The runtime can load the bundle, resolve subagents, and execute them safely.
- Parent and child execution lineage persists across checkpoints and resumes.
- Maintenance can detect drift and repair non-breaking issues safely.
- The UI can show the same runtime truth that the backend persists.
- Single-agent skills still work unchanged.
