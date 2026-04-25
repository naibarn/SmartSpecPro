# TDD Plan

This file mirrors `claude-plan.md` and describes the tests that should exist before each implementation section is built.

## 1. Shared Contract and Validation

Write tests for:

- bundle validation accepts a valid `subagents.json` plus the Feature 106 bundle files
- bundle validation rejects a manifest that references an undeclared subagent
- bundle validation rejects missing checkpoint or verification policy for a runtime-visible subagent
- bundle validation rejects a `subagents.json` file that contradicts `SKILL.md` or `skill.lock.json`
- bundle validation rejects missing or invalid security policy for a runtime-visible subagent
- bundle validation rejects manifest hash/signature mismatches and stale schema versions
- single-agent bundles remain valid when `subagents.json` is absent
- bundle discovery includes `agents/` and `subagents.json` in native bundle snapshots

Suggested test locations:

- `apps/web/server/services/__tests__/skillCompatibilityGate.subagents.test.ts`
- `apps/web/server/services/__tests__/skillFiles.subagents.test.ts`
- `python-backend/tests/unit/test_subagent_contracts.py`

## 2. ISC Create, Improve, and Migration Flow

Write tests for:

- create flow emits `agents/`, `subagents.json`, and the compatibility mirror for a requested subagent-aware skill
- improve flow preserves the existing bundle contract while adding subagent scaffolding when requested
- improve flow leaves single-agent bundles unchanged when subagents are not requested or not justified
- migration flow can convert a legacy skill into a subagent-aware bundle without breaking the slug or public contract
- UI schema and input schema surface the new subagent-aware fields and presets

Suggested test locations:

- `apps/web/skills/intelligence-skill-creator/tests/test_native_bundle_subagents.py`
- `apps/web/skills/intelligence-skill-creator/tests/test_creator_subagents.py`
- `apps/web/skills/intelligence-skill-creator/tests/test_improve_subagents.py`
- `apps/web/skills/intelligence-skill-creator/tests/test_migration_subagents.py`

## 3. OpenAI Agents Python Runtime and Supervisor

Write tests for:

- runtime descriptor includes subagent topology and the bundle path that was mounted
- runtime loader builds specialist agents and/or handoffs from the manifest
- manager-style orchestration prefers `Agent.as_tool()` for bounded specialist work
- handoff routing is only used when the manifest declares ownership transfer
- parent run checkpoints are written at each phase transition
- child lineage records persist the child run ID, role, status, checkpoint version, resume cursor, and verification state
- resume restores both parent phase state and child lineage state
- secret-like fields are redacted from persisted state
- bundle or manifest mismatch is rejected before any subagent code executes
- additive lineage migrations preserve existing runtime checkpoints and resume paths

Suggested test locations:

- `python-backend/tests/unit/test_openai_agents_skill_runtime.py`
- `python-backend/tests/unit/test_openai_agents_skill_supervisor.py`
- `python-backend/tests/unit/test_openai_agents_subagent_contracts.py`
- `python-backend/tests/unit/test_openai_agents_skill_persistence.py`

## 4. Web Execution Plumbing and Lineage Capture

Write tests for:

- `skillExecutor` packages the mounted bundle with the new subagent-aware files
- `skillExecutor` continues to skip `runs/`, `.git`, virtualenvs, and other garbage directories
- `skillStudioService` passes the bundle topology and trace metadata into a subagent-aware launch
- skill run metadata preserves parent/child lineage, task IDs, bundle version, and verification state
- router responses expose the new lineage fields without breaking existing consumers

Suggested test locations:

- `apps/web/server/services/__tests__/skillExecutor.subagents.test.ts`
- `apps/web/server/services/__tests__/skillStudioService.subagents.test.ts`
- `apps/web/server/routers/__tests__/skills.subagents.test.ts`

## 5. Maintenance, Compatibility, and Automatic Repair

Write tests for:

- analyzer scores a skill higher when the bundle is missing subagent manifest data or routing metadata
- analyzer differentiates between single-agent, manager-style, and subagent-aware bundles
- compatibility gate rejects invalid path or contract combinations for subagent-aware bundles
- applier preserves subagent topology when applying non-breaking maintenance changes
- applier rejects or escalates breaking topology changes
- maintenance repair is re-verified after patching

Suggested test locations:

- `apps/web/server/services/__tests__/skillMaintenanceAnalyzer.subagents.test.ts`
- `apps/web/server/services/__tests__/skillUpgradeApplier.subagents.test.ts`
- `apps/web/server/services/__tests__/skillCompatibilityGate.subagents.test.ts`
- `apps/web/server/routers/__tests__/skills.subagent-maintenance.test.ts`

## 6. Admin UI and Observability

Write tests for:

- Admin Skills shows subagent topology and lineage data when a skill is subagent-aware
- Admin run detail shows parent/child task IDs, checkpoint state, verification state, and distinct failure reasons
- blocked, failed, and completed child outcomes are labeled clearly in the UI
- dashboard shortcuts navigate to subagent maintenance and run detail views
- locale strings exist for the new topology, lineage, and failure labels in both English and Thai

Suggested test locations:

- `apps/web/client/src/pages/__tests__/AdminSkills.subagents.test.tsx`
- `apps/web/client/src/pages/__tests__/AdminLegacyUpgradeRunDetail.subagents.test.tsx`
- `apps/web/client/src/pages/__tests__/Dashboard.subagents.test.tsx`

## 7. Testing, Rollout, and Operational Hardening

Write tests for:

- full flow integration from create → load → run → persist → inspect → maintain
- legacy single-agent bundles still run unchanged while the new subagent contract exists
- security checks block undeclared paths, missing manifest policies, invalid manifest integrity data, and secret persistence
- resumable runs survive an interrupted parent run and a child run interruption
- runtime tracing contains tool calls, handoffs, and custom events needed for debugging

Suggested test locations:

- `python-backend/tests/integration/test_openai_agents_subagent_runtime_e2e.py`
- `python-backend/tests/security/test_openai_agents_subagent_security.py`
- `apps/web/server/services/__tests__/openaiAgentsRuntimeTracing.subagents.test.ts`
- `apps/web/client/src/pages/__tests__/AdminSkills.rollout.test.tsx`
