# Feature 107: OpenAI Agents Python Subagent Skill Runtime

Version: 0.1
Date: 2026-04-23
Status: Proposed
Depends-on: 101-openai-agents-sdk-chat-team-orchestration, 105-work-os-team-orchestrator-unified-automation, 106-openai-agents-python-native-skill-system
Audience: Skill Runtime, ISC, Skill Registry, Python Backend, Work OS, Admin UX, QA, Security, DevEx

---

## 1. Executive summary

SmartSpecPro now has the beginnings of a native OpenAI Agents Python skill system:

- ISC can create and improve native `agents_python` bundles
- the maintenance pipeline already knows how to rank, queue, retry, and normalize skill upgrades
- the backend already has execution, proposal, and trace persistence paths
- the admin UI already exposes maintenance queues and run details

What it still does not have is a **first-class subagent skill runtime**.

Today, the system can:

- create skills
- improve skills
- run skills
- review maintenance work

But it still treats "skill with subagent" as an optional orchestration detail rather than a stable contract. That creates gaps in portability, maintenance, and runtime traceability:

- a skill cannot yet declare its own specialist subagents as a first-class bundle artifact
- the runtime cannot yet load a skill and discover its subagents from the same mounted contract
- the maintenance system cannot yet upgrade legacy skills into subagent-aware bundles as a normal first-class path
- admin and monitoring views do not yet expose subagent lineage, task ownership, and subagent-level execution results as standard runtime data

Feature 107 closes that gap. It upgrades SmartSpecPro from:

- "skill runtime with some orchestration support"

to:

- "OpenAI Agents Python skill runtime with orchestrator + specialist subagents + reusable skills + durable runs"

This feature should be treated as the next native-runtime spec after Feature 106. Feature 106 defines the bundle contract for native Agents Python skills. Feature 107 extends that contract so skills can also declare, mount, run, inspect, and maintain specialist subagents in a deterministic and auditable way.

---

## 2. Why this feature is worth doing now

### 2.1 The current skill model is still single-skill first

The current runtime and skill authoring flow still assume a primarily single entrypoint model:

- create a skill bundle
- run a skill bundle
- improve a skill bundle
- inspect proposal / maintenance results

That works for simple skills, but it becomes limiting when a skill needs:

- a planning subagent
- a research subagent
- a validation subagent
- a maintenance subagent
- a specialist follow-up agent for bounded subtasks

### 2.2 Subagent work is already partially present elsewhere in the repo

The repository already has orchestration, agent, and handoff concepts in other areas:

- orchestration UIs and logs
- agent-to-agent routing
- policy and handoff checks
- long-running task ledgers
- workpack / team orchestration

But those capabilities are not yet expressed as a unified **skill bundle contract**.

### 2.3 Native subagent support reduces hidden coupling

If subagent support is encoded as runtime-specific ad hoc logic, every new skill will need custom loader behavior, custom execution plumbing, and custom admin inspection code.

If subagent support becomes part of the bundle contract, then:

- ISC can generate it
- the runtime can load it
- maintenance can improve it
- admin can inspect it
- verification can validate it

That is a much better long-term maintenance shape.

---

## 3. Problem statement

The current codebase has strong foundations, but it still has five architectural gaps for subagent-aware skills.

### 3.1 Skills do not yet declare subagents as bundle-native artifacts

Feature 106 introduced native bundle support, but bundle metadata still primarily describes a skill as a single workflow package. There is no first-class contract yet for:

- subagent roles
- subagent capabilities
- subagent entrypoints
- subagent tool boundaries
- parent-child run lineage

### 3.2 The runtime does not yet mount and resolve skill-local subagents as a standard execution model

The runtime can already load bundles and run skills, but it does not yet treat a subagent as something that is:

- bundled with the skill
- discoverable from the mounted skill directory
- routable from the orchestrator
- observable as a child of the same skill run

### 3.3 Create and improve flows do not yet optimize for subagent architecture

ISC can create and improve skill bundles, but it does not yet ask:

- should this skill spawn subagents?
- which subagents are deterministic wrappers versus reasoning agents?
- what is the approved tool boundary for each subagent?
- what lineages must be checkpointed?

### 3.4 Skill maintenance does not yet understand subagent contract drift

Current maintenance and compatibility scoring can detect native bundle drift, missing scripts, and runtime incompatibility. It does not yet fully score:

- missing subagent manifests
- stale subagent routing
- broken parent/subagent contract links
- incorrect subagent ownership or fallback behavior

### 3.5 Execution visibility is not yet subagent-aware end-to-end

The system has run and maintenance monitoring, but subagent lineage is not yet a standard inspection dimension across:

- create
- improve
- run
- retry
- maintenance
- admin details

---

## 4. Goals

### 4.1 Product goals

- Let a skill bundle declare one or more specialist subagents as part of the contract.
- Let the OpenAI Agents Python runtime load and execute those subagents as part of the skill run.
- Make skill creation and skill improvement aware of subagent architecture from the start.
- Make skill maintenance detect and repair subagent contract drift.
- Expose subagent lineage and results in admin and monitoring UIs.

### 4.2 Runtime goals

- Use OpenAI Agents Python as the primary runtime path for subagent-aware skills.
- Keep the orchestrator in control by default.
- Allow subagents to be used as tools or via handoff, depending on the bundle contract.
- Persist checkpoints for both the parent run and any child subagent runs.
- Make retry and resume behavior explicit and safe.

### 4.3 Architecture goals

- Extend the native bundle contract from Feature 106 without replacing it.
- Keep `SKILL.md` as the primary bundle contract.
- Preserve deterministic wrapper scripts for operational entrypoints.
- Make subagent manifests discoverable from the mounted skill bundle.
- Keep runtime policy and execution policy separate from prose-only instructions.

### 4.4 Safety goals

- No subagent may escape the skill's declared path or tool boundary.
- No hidden subagent behavior should be required for successful execution.
- No finalize without verification of parent and subagent work.
- No auto-apply maintenance change for a breaking subagent contract update.
- No secret or token persistence in bundle artifacts or checkpoints.

---

## 5. Non-goals

This feature does not aim to:

- replace the entire existing skill registry in one step
- remove single-skill support
- force every skill to have subagents
- make every subagent a handoff agent
- make the runtime dependent on one specific specialist topology
- remove existing orchestration or handoff features that already work elsewhere in the product

It does aim to:

- support subagent-aware skills as a native option
- upgrade existing high-value skills gradually
- keep single-skill bundles valid
- make subagent use opt-in and explicit

---

## 6. Locked decisions

1. **OpenAI Agents Python remains the primary runtime target.**
   - Subagent-aware skills should be designed for the native Agents Python path first.
   - Other runtime profiles may exist, but they are not the primary contract for this feature.

2. **A skill may be single-agent or subagent-aware.**
   - Subagents are optional.
   - When declared, they must be discoverable from the bundle contract.

3. **The orchestrator stays in control by default.**
   - Use agents-as-tools for bounded specialist work.
   - Use handoffs only when ownership must truly move.

4. **The bundle contract must declare subagent topology explicitly.**
   - Topology may include orchestrator, specialists, and any child subagents.
   - Topology must be inspectable without executing the skill.

5. **Every execution unit must be checkpointable.**
   - Parent skill run checkpoints are required.
   - Child subagent execution checkpoints are required when the subagent is runtime-visible.

6. **Maintenance and migration must understand subagent-aware bundles.**
   - ISC improve, maintenance, and migration paths must preserve or repair subagent declarations.

7. **Verification is mandatory before finalization.**
   - Parent run verification is required.
   - Subagent contracts and routing must also verify before the skill is considered healthy.

---

## 7. Current codebase fit

This feature should reuse the existing codebase instead of building a separate system.

| Existing area | Current truth | Gap Feature 107 fills |
|---|---|---|
| `apps/web/skills/intelligence-skill-creator/python/skill.py` | ISC can create/improve skills and now detects native bundle target hints | Add subagent-aware create/improve guidance and subagent preset generation |
| `apps/web/skills/intelligence-skill-creator/isc/native_bundle.py` | Native bundle contract already exists for `agents_python` | Extend the contract to include subagent manifests and topology metadata |
| `apps/web/skills/intelligence-skill-creator/isc/creator.py` | Can write native bundles and compatibility docs | Add subagent-aware planning and code/scaffold generation |
| `apps/web/skills/intelligence-skill-creator/isc/cli.py` | Supports create/improve/evaluate/migrate paths | Add subagent-aware bundle operations and inspection helpers |
| `apps/web/server/services/skillExecutor.ts` | Executes skill bundles and preserves richer failure metadata | Add subagent lineage capture and nested execution trace data |
| `apps/web/server/services/skillStudioService.ts` | Owns skill execution orchestration and proposal/apply flows | Extend it to submit and track subagent-aware runs |
| `apps/web/server/services/skillUpgradeApplier.ts` | Applies skill maintenance and retries | Preserve and repair subagent topology during upgrades |
| `apps/web/server/services/skillMaintenanceAnalyzer.ts` | Scores legacy skills for upgrade readiness | Rank subagent-capable migration candidates and missing topology features |
| `apps/web/server/routers/skills.ts` | Exposes maintenance and upgrade APIs | Expose subagent lineage, topology, and compatibility endpoints |
| `apps/web/client/src/pages/AdminSkills.tsx` | Admin maintenance UI already shows queues and details | Add subagent topology cards, runtime lineage, and nested inspection views |
| `apps/web/client/src/pages/AdminLegacyUpgradeRunDetail.tsx` | Shows run detail, task IDs, errors, and metadata | Extend run detail for subagent ancestry, child task IDs, and nested results |
| `python-backend/app/services/openai_agents_adapter.py` | Adapter path exists for OpenAI Agents SDK runtime | Make the adapter aware of subagent skill bundle loading and topology metadata |
| `python-backend/app/services/openai_agents_skill_runtime.py` | Native Agents skill runtime exists | Extend it to load subagent-aware bundles and emit child-run lineage |
| `python-backend/app/services/openai_agents_skill_supervisor.py` | Phase-supervised skill runs already exist | Add child subagent checkpointing and resume semantics |

---

## 8. Bundle contract

Feature 107 extends the Feature 106 native bundle with explicit subagent metadata.

### 8.1 Required bundle shape

```text
skills/<skill-name>/
  SKILL.md
  skill.lock.json
  scripts/
    run.sh
    verify.sh
  references/
    input_contract.md
    output_contract.md
    maintenance.md
    subagents.md
  agents/
    orchestrator.md
    specialists/
      <specialist-name>.md
  subagents.json
  MODEL_COMPATIBILITY.md
  skill.md              # compatibility mirror during migration
```

### 8.2 Subagent metadata contract

Each subagent declaration should include:

- `name`
- `role`
- `owner`
- `runtime_mode`
- `tool_boundary`
- `handoff_policy`
- `inputs`
- `outputs`
- `checkpoint_policy`
- `verification_command`
- `fallback_behavior`

### 8.3 Topology contract

The bundle must describe:

- the orchestrator role
- which subagents exist
- whether each subagent is tool-like or handoff-like
- whether the subagent is local-only or externally routed
- which checkpoints are required at each boundary
- how child results are aggregated into the parent run

### 8.4 Compatibility contract

Every bundle should keep `MODEL_COMPATIBILITY.md` and `skill.lock.json` current with:

- supported runtime tier
- subagent support tier
- deterministic-script expectations
- verification policy
- migration or compatibility notes

### 8.5 Machine-readable subagent contract

In addition to prose documents, subagent-aware bundles must include a machine-readable contract file so the runtime and maintenance layers do not need to parse freeform text.

Recommended file:

```text
subagents.json
```

Required top-level fields:

- `version`
- `orchestrator`
- `subagents`
- `routing`
- `checkpointPolicy`
- `verificationPolicy`
- `fallbackPolicy`

Required subagent fields:

- `name`
- `role`
- `mode`
- `entrypoint`
- `toolBoundary`
- `handoffPolicy`
- `checkpointPolicy`
- `verificationCommand`
- `fallbackBehavior`

The validator must reject bundles where:

- a declared subagent lacks a matching entrypoint or contract
- a routing rule points to an undeclared subagent
- checkpoint or verification policies are missing for runtime-visible subagents
- the machine-readable contract contradicts `SKILL.md` or `skill.lock.json`

---

## 9. Functional requirements

### 9.1 Skill creation

The system must be able to create new skills that include subagents.

Required behavior:

- accept a user description that asks for a skill with subagents
- plan the orchestrator and specialist roles
- generate subagent-aware bundle metadata
- generate references and scripts for each subagent
- validate that the bundle contract is complete
- emit a usable `SKILL.md` and compatibility mirror

The create flow should be able to infer patterns such as:

- planning + research + validation
- orchestrator + specialist review
- main skill + domain-specific specialist subagent

### 9.2 Skill improvement

The system must be able to improve existing skills toward subagent awareness.

Required behavior:

- detect whether an existing skill is single-agent or already subagent-aware
- propose adding subagents only when it materially improves the workflow
- preserve existing bundle compatibility
- repair missing or stale subagent metadata
- re-verify the entire bundle after patching

Improvement should support:

- create subagent topology from legacy single-skill workflows
- upgrade brittle monolithic skills into orchestrator + specialist bundles
- preserve deterministic entrypoints
- preserve or improve runtime traceability

### 9.3 Skill execution

The system must be able to run subagent-aware skills from every supported entrypoint in the product.

Required execution paths:

- admin-triggered skill runs
- skill studio / maintenance-triggered runs
- runtime-driven skill calls from orchestrator flows
- retry/resume of failed child or parent execution
- long-running runs with checkpoints

Required runtime behavior:

- load the skill bundle
- read the orchestrator contract
- discover subagents from bundle metadata
- decide whether to call a subagent as a tool or hand off ownership
- persist the parent run and child run traces
- verify outputs before completion

### 9.4 Maintenance

The system must be able to maintain subagent-aware skills.

Required behavior:

- detect missing or broken subagent metadata
- detect invalid parent/subagent routing
- detect incompatible runtime assumptions
- propose safe upgrades first
- apply non-breaking fixes automatically when allowed
- re-verify after maintenance

### 9.5 Migration

The system must be able to migrate legacy skills to subagent-aware bundles.

Required behavior:

- ingest a legacy skill bundle or manifest
- identify whether the skill should remain single-agent or become subagent-aware
- generate subagent scaffolds when the workflow benefits from delegation
- preserve compatibility mirror behavior during transition
- maintain stable slugs and versioning

### 9.6 Discovery and loading

The runtime must be able to discover and load subagent-aware skills dynamically.

Required behavior:

- load from the mounted skill bundle
- inspect bundle metadata without executing it
- determine topology before run time
- reject bundles missing required subagent metadata when subagent mode is declared

### 9.7 Observability

The system must expose subagent execution as a first-class trace.

Required behavior:

- parent run and child run IDs
- task IDs or tool call IDs for each subagent
- status, checkpoint, and verification state per subagent
- error message and recovery hints per failure
- summary aggregation at the parent level

---

## 10. Runtime architecture

### 10.1 Supervisor

The supervisor remains the outer durable layer.

Responsibilities:

- create or reuse session memory
- restore run checkpoints
- resume parent skill execution
- persist phase progress
- manage failure recovery
- coordinate verification and finalization

### 10.2 Orchestrator agent

The orchestrator owns the run unless a handoff is required.

Responsibilities:

- inspect task intent
- load the relevant skill
- determine whether the skill is subagent-aware
- select specialist subagents
- decide tool-call versus handoff
- checkpoint after each phase

### 10.3 Specialist sub-agents

Subagents are narrow and bounded.

Recommended built-ins:

- planning specialist
- code specialist
- research specialist
- validation specialist
- maintenance specialist
- migration specialist

### 10.4 Parent-child run ledger

Every parent run must record:

- child subagent IDs
- subagent role
- subagent task objective
- checkpoint references
- final subagent outputs
- parent aggregation result

### 10.5 Skill loader

The skill loader must:

- read `SKILL.md`
- inspect `skill.lock.json`
- inspect subagent manifests when present
- mount wrapper scripts
- validate compatibility before execution

---

## 11. Orchestration patterns

### 11.1 Agents as tools

Use when:

- the parent orchestrator should stay in control
- the subtask is bounded
- the result needs to be merged back into the same run

Examples:

- code specialist reviews a patch
- research specialist gathers references
- validation specialist checks bundle integrity

### 11.2 Handoffs

Use when:

- the specialist should own the next user-visible step
- conversation continuity matters
- the specialist needs a separate routing identity

Examples:

- orchestrator hands off to maintenance specialist
- orchestrator hands off to migration specialist
- support triage hands off to skill-specific troubleshooting

### 11.3 Mixed hierarchy

Use both when:

- the parent orchestrator starts the run
- a specialist temporarily owns a bounded phase
- the specialist may call narrower helpers as tools
- the parent later resumes for synthesis and finalization

---

## 12. Persistence and recovery

Subagent-aware runs must remain durable.

### 12.1 Required state

- conversation memory
- sandbox workspace state
- parent run checkpoint state
- child subagent checkpoint state
- retry lineage and verification state

### 12.2 Run lineage model

Every subagent-aware execution must persist a normalized lineage record with at least:

```json
{
  "parent_run_id": "string",
  "skill_slug": "string",
  "orchestrator_agent": "string",
  "child_runs": [
    {
      "child_run_id": "string",
      "subagent_name": "string",
      "subagent_role": "string",
      "status": "queued|running|completed|failed|blocked|canceled",
      "checkpoint_version": "string",
      "resume_cursor": "string",
      "verification_status": "pending|passed|failed",
      "artifact_refs": ["string"]
    }
  ]
}
```

### 12.3 Persistence requirements

- Parent and child runs must be queryable independently.
- Child runs must reference the parent run and the bundle version they executed against.
- Resume must restore both phase state and child-run lineage.
- Failure records must preserve the original child failure reason and the parent aggregation reason.

### 12.4 Checkpoint rule

No phase transition may occur without writing a checkpoint artifact.

### 12.5 Resume behavior

On resume, the runtime must restore:

- parent phase
- child subagent progress
- any required tool outputs
- verification state

### 12.6 Failure classes

Required failure classes:

- tool failure
- subagent failure
- parent orchestrator failure
- checkpoint write failure
- validation failure
- compatibility failure

Each failure should be classified as:

- retryable
- non-retryable
- needs maintenance
- needs migration

---

## 13. Security and governance

### 13.1 Minimum controls

- subagent bundle loading must be allowlisted
- execution must remain path-constrained
- wrapper scripts must be deterministic where possible
- verification must run before finalization
- maintenance changes must preserve contract boundaries
- bundle loading must reject contract/path mismatches before any subagent code executes
- subagent tool boundaries must be enforced at runtime, not only documented in prose

### 13.2 Sensitive boundaries

- no subagent may access undeclared host paths
- no subagent may persist secrets into bundle artifacts
- no subagent may bypass the parent orchestrator's policy gates
- no subagent may introduce a broader network, filesystem, or tool scope than the parent contract allows

### 13.3 Required security checks

The implementation must add validation for:

- bundle integrity: lockfile or signature/hash consistency
- subagent contract integrity: `subagents.json` must agree with `SKILL.md`
- path integrity: all declared bundle paths must resolve inside the mounted skill root
- tool integrity: each subagent may only use explicitly allowed tools
- handoff integrity: handoffs may not widen permissions or network scope
- checkpoint integrity: resume state must not accept foreign or untrusted lineage data

### 13.4 Governance rules

- subagent contracts are versioned
- topology changes are reviewed like API changes
- breaking topology changes require approval
- compatibility drift is tracked in lock metadata and admin inspection views

---

## 14. Current codebase fit: implementation touchpoints

This feature should primarily extend the following files and systems:

- `apps/web/skills/intelligence-skill-creator/python/skill.py`
- `apps/web/skills/intelligence-skill-creator/isc/creator.py`
- `apps/web/skills/intelligence-skill-creator/isc/native_bundle.py`
- `apps/web/skills/intelligence-skill-creator/isc/cli.py`
- `python-backend/app/services/openai_agents_adapter.py`
- `python-backend/app/services/openai_agents_skill_runtime.py`
- `python-backend/app/services/openai_agents_skill_supervisor.py`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillMaintenanceAnalyzer.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/services/skillCompatibilityGate.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/client/src/pages/AdminLegacyUpgradeRunDetail.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`

The goal is not to invent a parallel subsystem, but to extend these existing contracts until they can support subagent-aware skills safely.

---

## 15. Rollout plan

### Phase 1 — Bundle contract

Deliver:

- subagent metadata in native bundle plans
- subagent-aware `SKILL.md` and `skill.lock.json`
- validation for topology completeness
- basic create path support

### Phase 2 — Runtime loading

Deliver:

- runtime can inspect mounted subagent bundle metadata
- runtime can resolve subagents before execution
- runtime can record parent-child lineage

### Phase 3 — Execution and resume

Deliver:

- parent run can invoke specialist subagents
- child subagent runs checkpoint independently
- resume can restore both parent and child state

### Phase 4 — Maintenance and migration

Deliver:

- analyzer ranks skills needing subagent upgrades
- applier can rewrite or scaffold subagent-aware bundles
- admin views can inspect subagent drift and runtime failures

### Phase 5 — Product UI and observability

Deliver:

- UI views for topology, lineage, and subagent status
- failure views that clearly separate parent and child failures
- dashboard shortcuts to subagent maintenance and inspection

---

## 16. Acceptance criteria

The feature is complete when all of the following are true:

### Runtime

- A skill can declare one or more subagents in its bundle contract.
- The OpenAI Agents Python runtime can load the skill and discover its subagents.
- The orchestrator can route work to subagents as tools or via handoff.
- Parent and child runs are persisted with lineage.
- The runtime rejects bundles whose subagent manifest and bundle metadata disagree.

### Create / improve

- ISC can create a new subagent-aware skill bundle.
- ISC can improve an existing bundle into a subagent-aware bundle when requested.
- The improvement workflow can preserve compatibility and add subagents only when useful.
- The create and improve flows can emit a machine-readable subagent manifest.

### Maintenance / migration

- Maintenance can detect subagent contract drift.
- Migration can convert legacy skill bundles into subagent-aware bundles.
- Upgrades and migrations re-verify before being marked healthy.
- Maintenance can detect invalid routing, missing checkpoint policies, and scope widening.

### Observability / UX

- Admin views can show subagent topology, parent-child run lineage, and subagent-level errors.
- Failed or blocked child work is clearly separated from parent orchestration failures.
- Retry and normalize flows work without losing traceability.
- The UI can identify whether a failure belongs to the orchestrator, a child subagent, or the parent/child handoff boundary.

### Safety

- No execution step depends on undocumented hidden conventions.
- No finalization can occur before verification.
- No subagent can escape its declared contract or path boundary.

---

## 17. Implementation recommendation

The best implementation strategy is:

1. extend Feature 106's native bundle contract rather than replacing it
2. define subagents as explicit bundle artifacts
3. keep the orchestrator in control by default
4. allow specialist subagents as tools first, handoffs second
5. add durable lineage and checkpoints before adding extra autonomy
6. upgrade maintenance and migration to preserve the same contract
7. expose subagent visibility in admin and monitoring only after runtime data exists

That order keeps the system deterministic and recoverable while still moving toward a full subagent-capable OpenAI Agents Python runtime.
