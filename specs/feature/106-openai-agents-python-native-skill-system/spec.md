# Feature 106: OpenAI Agents Python Native Skill System

Version: 0.1
Date: 2026-04-23
Status: Proposed
Depends-on: 101-openai-agents-sdk-chat-team-orchestration, 105-work-os-team-orchestrator-unified-automation
Audience: Skill Runtime, ISC, Skill Registry, Python Backend, Work OS, Security, QA, DevEx

---

## 1. Executive summary

SmartSpecPro already has three strong ingredients:

- a large skill library under `apps/web/skills`
- an Intelligence Skill Creator (ISC) that can create and improve skills
- an OpenAI Agents SDK adapter path in the Python backend

What it does not yet have is a **native skill system for OpenAI Agents Python**.

Today, the platform still executes skills through a hybrid model:

- skill discovery is primarily DB and internal-manifest driven
- skill execution still assumes `skill.py` or `skill.js` style entrypoints
- the OpenAI Agents runtime uses plain `Agent` construction rather than sandbox-mounted skills
- checkpointing exists, but long-running skill work is not supervised as a phase-based durable run
- maintenance and evaluation exist, but they are not enforced against a plug-and-play Agents Python bundle contract

That leaves the platform in an awkward middle state:

- it has enough infrastructure to look agentic
- but not enough contract discipline to make skills portable, durable, or safely resumable

Feature 106 turns skills into a first-class workflow bundle for OpenAI Agents Python and introduces a native execution path built on:

- `SandboxAgent`
- `Capabilities.default()`
- `Skills(lazy_from=LocalDirLazySkillSource(...))`
- deterministic wrapper scripts
- phase-based supervision with checkpoint and resume
- maintenance workflows that operate on the same bundle contract used at runtime

This is worth doing because it is better than continuing to expand the current hybrid runtime. The current model keeps adding compatibility logic between DB registry state, skill manifests, runtime envelopes, and legacy code entrypoints. That increases coupling and hides execution assumptions. A native Agents Python skill bundle creates one contract for authoring, runtime loading, verification, and maintenance.

Feature 106 is therefore the recommended continuation spec after Feature 105 for the "run skill" portion of the platform.

---

## 2. Why this follow-on is worth doing now

### 2.1 The current hybrid model will get harder to maintain

The repository currently mixes:

- `SKILL.md` and `skill.md`
- DB-backed skill metadata
- internal capability-manifest seeds
- direct Python and JavaScript skill entrypoints
- runtime request envelopes that do not directly encode bundle contracts

That approach can keep shipping features, but it becomes harder to reason about:

- what the true source of skill truth is
- what "compatible with runtime" actually means
- how to recover a partially completed skill run
- how to prove that maintenance changes are safe

### 2.2 Native Agents Python support is a cleaner target than more legacy bridging

The better path is not to add more compatibility code around the existing shape. The better path is to formalize one skill bundle contract and make every relevant system speak that contract:

- ISC create
- ISC improve
- evaluator and validator
- runtime loader
- supervisor
- maintenance pipeline

### 2.3 This feature improves both correctness and security

A native bundle contract improves:

- portability because every skill exposes the same runtime entrypoints
- determinism because core logic moves into scripts or CLI wrappers
- durability because long work is explicitly phase-based
- security because runtime execution can be constrained to declared entrypoints and output paths

### 2.4 Feature 105 benefits directly

Feature 105 depends on reliable capability planning and reusable skill execution. If skills are not durable, verifiable, and resumable in a standardized way, the Work OS + Team Orchestrator stack will keep carrying hidden operational risk.

Feature 106 gives Feature 105 a stronger execution substrate for skill-based work.

---

## 3. Problem statement

The current codebase already has meaningful foundations:

- the Python backend has an OpenAI Agents SDK adapter boundary
- runtime request and checkpoint contracts already exist
- the platform already has checkpoint persistence
- ISC already supports create, evaluate, improve, and patch application
- many skills already have `SKILL.md`

However, the current implementation still has five architectural gaps.

### 3.1 Runtime is not using the required Agents Python skill-loading pattern

The current Python runtime still constructs plain SDK agents and runs them directly. It does not load skills through sandbox-mounted `Skills(...)`.

That means the runtime contract is still centered on:

- runtime request payloads
- allowed skill slugs
- internal capability manifests

rather than on:

- discoverable skill bundles
- sandbox-mounted skill loading
- wrapper-script entrypoints

### 3.2 Skill contract is still legacy-entrypoint oriented

Current ISC generation and evaluation still assume:

- `python/skill.py`
- `js/skill.js`
- `skill.manifest.json`
- direct import or direct code execution during evaluation

That is not the same as a workflow bundle where `SKILL.md` is the primary contract and wrapper scripts are the required operational interface.

### 3.3 Long-running skill work is resumable only at a runtime-state level

The platform can persist checkpoint payloads and resume cursors, but it does not yet supervise a skill run as a durable sequence of phases such as:

1. discover
2. inspect
3. plan
4. execute
5. verify
6. summarize
7. finalize

Without that phase model, recovery is less explainable and operational logs are weaker than they should be.

### 3.4 Maintenance workflows are not tied tightly enough to the runtime bundle contract

ISC improve and evaluation exist, but they do not yet enforce the exact bundle shape the runtime should load. That means a skill can appear "valid" according to one toolchain while still being non-native for Agents Python execution.

### 3.5 Security depends too much on prompts and conventions

Some important constraints are encoded today as generator instructions or patch checks, not as runtime-enforced bundle policy. That makes drift more likely and weakens the platform's ability to prove safe execution.

---

## 4. Goals

### 4.1 Product goals

- Create new skills that are immediately usable by OpenAI Agents Python runtime.
- Let the platform plug those skills into runtime without ad hoc loader logic per skill.
- Make long-running skill work durable and resumable without losing artifacts or progress.
- Make maintenance and improvement of existing skills use the same contract as new skill creation.
- Keep a provider-neutral compatibility story while providing the richest path for OpenAI models.

### 4.2 Architecture goals

- Make `SKILL.md` the primary skill contract.
- Move execution-critical behavior into deterministic wrapper scripts or CLI entrypoints.
- Use one bundle structure for create, evaluate, improve, migrate, and runtime load.
- Make runtime supervision phase-based and checkpointed.
- Fit the implementation into the existing repo rather than inventing a parallel project layout detached from current code paths.

### 4.3 Safety goals

- No runtime execution from undocumented hidden conventions.
- No direct reliance on prose-only logic inside `SKILL.md`.
- No skill execution from client-supplied arbitrary paths.
- No finalize step without explicit verification.
- No auto-apply maintenance patch unless the change is classified as non-breaking.
- No checkpoint or artifact persistence of raw secrets, provider credentials, or user tokens.

---

## 5. Non-goals

This feature does not aim to:

- rewrite every existing skill bundle in one release
- remove the existing DB-backed skill registry in the first migration step
- replace Chat or Team runtime contracts outside the skill-specific scope
- replace all legacy capability manifests immediately
- make every provider support every OpenAI-only feature
- require that all historical skills become native bundle compatible before rollout starts

It does aim to:

- upgrade existing skills in parallel with new skill creation
- concentrate migration effort on high-usage and high-risk bundles first
- make the native contract the default target for new work and the preferred target for maintenance work

---

## 6. Locked decisions

1. **OpenAI Agents Python bundle support is a native target, not an adapter afterthought.**
   - ISC must support `target_platform = agents_python` directly.
   - The bundle shape is not a derived export hidden behind legacy manifests.

2. **`SKILL.md` is the primary bundle contract.**
   - `skill.md` may remain as a mirrored compatibility alias during migration, but it is not the primary contract for the native target.

3. **Wrapper scripts are mandatory for executable skills.**
   - Every native bundle must provide `scripts/run.sh` and `scripts/verify.sh`.
   - Runtime and maintenance flows must call these entrypoints instead of reimplementing business logic in free-form prompts.

4. **Sandbox-mounted skills are the required runtime loading model.**
   - The runtime must use `SandboxAgent + Capabilities.default() + Skills(LocalDirLazySkillSource(...))`.
   - Mounting raw skill folders without the Skills capability is not the primary path.

5. **Long-running skill work must be phase-supervised.**
   - Resume is not only a raw SDK `RunState` concern.
   - The system must persist skill-phase progress and restore from phase checkpoints.

6. **Verification is required before final output.**
   - Every native skill workflow must have an explicit verification command.
   - Failed verification blocks finalize.

7. **Maintenance uses the same bundle contract as creation.**
   - Improve, evaluate, patch, verify, and migrate all operate on the same native bundle structure.
   - Existing skills should be brought into that same structure as part of normal maintenance whenever the upgrade is safe.

8. **Breaking maintenance changes require approval.**
   - Auto-evaluate and auto-propose are allowed.
   - Auto-apply is allowed only for non-breaking changes.

9. **Runtime policy beats prose.**
   - Security-sensitive rules must be enforced through bundle metadata, script invocation policy, and runtime path restrictions, not only by what `SKILL.md` says.

---

## 7. Current codebase fit

This feature should reuse existing systems, but change what they consider authoritative.

| Existing area | Current truth | Gap Feature 106 fills |
|---|---|---|
| `apps/web/skills/intelligence-skill-creator/isc/creator.py` | ISC can generate skills, but output is still legacy-entrypoint oriented | Add native `agents_python` target and bundle exporter |
| `apps/web/skills/intelligence-skill-creator/isc/cli.py` | CLI supports `list`, `evaluate`, `improve`, `apply` | Add `create`, `improve --target-platform`, `evaluate`, and `migrate-legacy` for native bundles |
| `apps/web/skills/intelligence-skill-creator/isc/evaluator.py` | Evaluation executes skill code directly | Evaluate wrapper scripts, bundle structure, and runtime compatibility instead |
| `apps/web/skills/intelligence-skill-creator/isc/validator.py` | Patch checks focus on `skill.py` shape | Add bundle-contract and script-entrypoint validation |
| `apps/web/server/services/skillRegistry.ts` | DB and folder sync are primary sources of truth | Make native bundle metadata first-class and reduce dependency on legacy conventions |
| `apps/web/server/services/skillFiles.ts` | Current manifest resolution supports multiple legacy patterns | Add native bundle resolution and explicit native-bundle validation |
| `apps/web/server/routers/skills.ts` | Skill APIs still center on registry and custom execution logic | Add native bundle compatibility checks and runtime integration hooks |
| `apps/web/server/services/skillCompatibilityGate.ts` | Compatibility snapshots already compare manifests, schemas, tests, and runtime profile | Promote native-bundle upgrade detection and prioritization for existing skills |
| `apps/web/server/services/skillMaintenanceAnalyzer.ts` | Maintenance analysis already identifies GenJS candidates and missing contract pieces | Expand it into the engine that ranks legacy skills for parallel upgrade |
| `apps/web/server/services/skillUpgradeApplier.ts` | Skill upgrades already have a direct/proposal/queued apply path | Reuse this path to move existing skills toward the native bundle contract |
| `python-backend/app/services/openai_agents_adapter.py` | Uses plain `Agent` and runtime envelopes | Introduce a native skill runtime path built around sandbox-mounted skills |
| `python-backend/app/services/openai_agents_contracts.py` | Request, response, and checkpoint schemas already exist | Extend or complement them with phase-progress and native-skill execution metadata |
| `apps/web/server/services/agentRuntime/checkpointService.ts` | Checkpoint persistence exists | Add native-skill phase persistence and artifact indexing semantics |

---

## 8. Recommended solution

The best continuation path is:

1. keep ISC as the core authoring and improvement engine,
2. add a native `agents_python` target to ISC,
3. standardize skill bundles around `SKILL.md + scripts + references + compatibility + lock`,
4. add a dedicated native skill runtime and supervisor in the Python backend,
5. update Node registry and skill APIs so bundle metadata becomes authoritative,
6. migrate legacy skills incrementally through evaluator-driven maintenance,
7. keep a parallel upgrade lane for existing high-usage skills so the new contract improves runtime performance as soon as possible.

This is better than extending the current hybrid runtime because it makes one contract do all of the following:

- authoring
- runtime loading
- evaluation
- maintenance
- migration
- security enforcement

### 8.1 Parallel upgrade strategy

This feature should not treat legacy skills as a later cleanup project. The operating model is:

- create new skills directly in the native bundle contract
- continuously upgrade existing high-value skills to the same contract
- prefer compatibility-preserving bundle upgrades over net-new wrappers where possible
- use analyzer-driven recommendations to prioritize the skills that are most executed, most brittle, or most expensive to maintain
- keep a compatibility mirror only while it increases migration safety, not as a permanent second contract

The goal is to maximize runtime efficiency by reducing the number of code paths the platform must support at once. When a legacy skill is upgraded, the same native runtime, validation, maintenance, and verification paths should immediately become available to it.

---

## 9. Canonical native bundle contract

### 9.1 Required directory shape

The native Agents Python skill bundle for this repo must be:

```text
apps/web/skills/<skill-name>/
  SKILL.md
  skill.md                      # optional compatibility mirror during migration
  scripts/
    run.sh
    verify.sh
  references/
    input_contract.md
    output_contract.md
    maintenance.md
  MODEL_COMPATIBILITY.md
  skill.lock.json
```

Optional directories may include:

- `assets/`
- `schemas/`
- `examples/`
- provider-specific helper files

### 9.2 `SKILL.md` requirements

`SKILL.md` must contain YAML frontmatter with at least:

```yaml
---
name: <skill-name>
description: <short discovery description>
version: <semver>
target_platform: agents_python
---
```

It must include these sections:

- `When To Use`
- `Inputs`
- `Workflow`
- `Exact Commands`
- `Guardrails`
- `Verification`
- `Final Response Checklist`

### 9.3 Wrapper script requirements

Every executable native bundle must provide:

- `scripts/run.sh`
- `scripts/verify.sh`

Rules:

- accept explicit input or file-path arguments
- write outputs only to declared paths
- return non-zero on failure
- print concise status lines
- avoid interactive prompts

### 9.4 `MODEL_COMPATIBILITY.md` requirements

This file must document:

- hard minimum capabilities
- recommended capabilities
- optional features
- known provider caveats
- support tier classification

### 9.5 `skill.lock.json` requirements

This file must pin reproducible metadata such as:

- skill name
- version
- target platform
- entrypoints
- declared output paths
- validation commands
- supported modes
- compatibility mirror policy

Example:

```json
{
  "name": "example-skill",
  "version": "1.0.0",
  "target_platform": "agents_python",
  "entrypoints": {
    "run": "scripts/run.sh",
    "verify": "scripts/verify.sh"
  },
  "outputs": [
    "out/"
  ],
  "supported_modes": [
    "create",
    "improve",
    "maintenance"
  ]
}
```

---

## 10. Repo mapping and module layout

This feature must fit the current repository layout rather than inventing a separate standalone project tree.

### 10.1 ISC engine changes

Add native-bundle support under:

```text
apps/web/skills/intelligence-skill-creator/isc/
  exporters/
    agents_python.py
    legacy_platform.py
  evaluators/
    agents_python.py
  migrations/
    legacy_to_agents.py
```

Existing modules such as `creator.py`, `evaluator.py`, `validator.py`, and `cli.py` should either route into these new modules or be slimmed into orchestration shells that call them.

### 10.2 Python backend runtime changes

Add native skill runtime modules under:

```text
python-backend/app/services/
  openai_agents_skill_runtime.py
  openai_agents_skill_supervisor.py
  openai_agents_skill_persistence.py
```

These modules are skill-runtime specific. They should not overload the generic Chat/Team adapter until the native skill path is proven stable.

### 10.3 Node platform integration changes

Extend the current Node side under:

```text
apps/web/server/services/
  skillRegistry.ts
  skillFiles.ts
  agentRuntime/
    skillRuntimeOrchestrator.ts
    checkpointService.ts
```

and:

```text
apps/web/server/routers/skills.ts
```

The goal is not to remove these modules, but to make them native-bundle aware and reduce reliance on legacy manifest inference.

---

## 11. Runtime architecture

### 11.1 Required build pattern

The native skill runtime must use this shape:

- `SandboxAgent`
- `Capabilities.default()`
- `Skills(lazy_from=LocalDirLazySkillSource(...))`

The runtime must mount:

- the relevant repo workspace
- the skills root
- runtime state/output/log directories

### 11.2 Workspace layout

Inside the runtime workspace, use:

```text
workspace/
  repo/
  .agents/
  state/
  out/
  logs/
```

### 11.3 Runtime instructions

The native skill runtime instructions must explicitly require the agent to:

- read task input before execution
- discover and load the skill before inspecting skill files
- call wrapper scripts rather than reimplementing core logic
- persist progress checkpoints
- run verification before finalize

### 11.4 Runtime request contract additions

The native skill execution path must record:

- target skill slug
- bundle path or resolved bundle ref
- loaded skills
- current phase
- artifact outputs
- verification command
- resume hint

This can extend the existing runtime contracts or use a native-skill sub-contract layered above them.

---

## 12. Long-running phase supervision

### 12.1 Mandatory phase model

Every native skill run must follow explicit phases:

1. `discover`
2. `inspect`
3. `plan`
4. `execute`
5. `verify`
6. `summarize`
7. `finalize`

### 12.2 Required persisted state

Each phase must persist:

- phase status
- current phase
- loaded skills
- last command
- produced artifacts
- verification command when relevant
- resume hint

### 12.3 Required files

Each run must write or update:

- `state/progress.json`
- `state/last_session_state.json`
- `logs/phase_<n>.md`
- `out/artifact_index.json`

### 12.4 Max-turn and interruption handling

The supervisor must support:

- phase-specific `max_turns`
- output trimming or compaction
- resume after interruption
- retry policy by phase
- recovery when turn budget is exhausted

### 12.5 No-loss rule

If a phase fails, the platform must be able to:

- restore the last persisted session state
- restore the last sandbox state when available
- reload prior progress and artifact index
- continue from the latest safe phase boundary

---

## 13. ISC native target requirements

### 13.1 New input schema support

ISC must support:

```json
{
  "target_platform": "agents_python"
}
```

Supported values are:

- `agents_python`
- `legacy_platform`
- `dual`

### 13.2 CLI requirements

The ISC CLI must support:

```bash
python -m isc.cli create --input-file ... --target-platform agents_python
python -m isc.cli evaluate --skill ...
python -m isc.cli improve --skill ... --target-platform agents_python
python -m isc.cli migrate-legacy --skill ...
```

### 13.3 Create behavior

`create --target-platform agents_python` must emit a native bundle with:

- `SKILL.md`
- `scripts/run.sh`
- `scripts/verify.sh`
- `references/`
- `MODEL_COMPATIBILITY.md`
- `skill.lock.json`

### 13.4 Improve behavior

`improve --target-platform agents_python` must:

- evaluate the current bundle
- propose or apply native-bundle-safe changes
- re-run verification
- bump version and lock metadata when appropriate

### 13.5 Evaluate behavior

Native evaluation must verify:

- required file presence
- frontmatter presence and validity
- required section presence
- script existence and executability
- declared path contracts
- verification command validity
- compatibility file validity
- plug-and-play readiness for `Skills(...)`

### 13.6 Migrate behavior

`migrate-legacy` must:

1. inspect legacy metadata and entrypoints
2. derive the primary use case and workflow
3. map behavior into `SKILL.md`
4. generate wrapper scripts
5. generate compatibility and lock metadata
6. run evaluation and verification

---

## 14. Maintenance lifecycle

Maintenance must become a first-class native-bundle workflow.

### 14.1 Required lifecycle

1. evaluate bundle
2. detect drift or failure
3. propose patch
4. classify breaking vs non-breaking
5. run verify
6. update changelog and lock/version
7. apply or hold for approval

For legacy skills, this lifecycle should run continuously in the background so high-traffic bundles can be upgraded without waiting for a separate migration project.

### 14.2 Patch policy

Default behavior:

- auto-evaluate: yes
- auto-propose patch: yes
- auto-apply: only non-breaking
- breaking changes: require approval

### 14.3 Maintenance write scope

Maintenance is allowed to modify only:

- `SKILL.md`
- `skill.md` compatibility mirror when enabled
- `scripts/`
- `references/`
- `MODEL_COMPATIBILITY.md`
- `skill.lock.json`

It must not silently rewrite unrelated runtime files outside the target skill bundle.

---

## 15. Model compatibility policy

### 15.1 Hard minimum

A provider or model is not compatible unless it supports:

- tool or function calling
- multi-step tool loop behavior
- reliable long-form instruction following
- stable plain-text final output

### 15.2 Recommended

Recommended behavior includes:

- strong tool selection
- good context tolerance for task plus skill plus tool output
- stable structured summarization
- support for important model settings

### 15.3 Optional feature gates

Only use when supported:

- structured outputs
- handoffs
- multimodal input
- OpenAI-native prompt objects
- hosted web or file search

### 15.4 Support tiers

- `Tier A - Universal`: plain text + tools + sandbox skills
- `Tier B - Recommended`: tool choice, truncation, session-friendly behavior
- `Tier C - Full OpenAI`: hosted search tools, server-managed conversation, OpenAI-native features

---

## 16. Security model

### 16.1 Bundle trust and loading rules

- The platform must never trust arbitrary client-provided skill paths.
- Bundle resolution must happen through server-owned canonical roots.
- The runtime must only load skills that pass native-bundle validation or are explicitly classified as legacy during migration mode.

### 16.2 Entrypoint allowlisting

- Runtime execution must only invoke entrypoints declared in `skill.lock.json`.
- Script path traversal or undeclared shell invocation is forbidden.

### 16.3 Output-path confinement

- Skills may only write to declared output directories.
- Verification must reject unexpected writes outside allowed work directories.

### 16.4 Checkpoint redaction

- Checkpoint and session persistence must redact secrets, tokens, and raw credentials.
- User tokens and gateway credentials may not be stored in progress files or artifact indexes.

### 16.5 Verification gate

- No skill run may finalize successfully unless verify passes.
- Verification failure must be visible as a runtime terminal state, not hidden as a warning.

### 16.6 Maintenance safety

- Auto-apply is forbidden for breaking changes.
- Patch generation must be restricted to the bundle write scope.
- Migration or maintenance scripts may not silently introduce new external dependencies without policy review.

---

## 17. Rollout strategy

### 17.1 Phase 1 - Make it work

- Add `agents_python` native target to ISC
- Add native bundle exporter
- Add native evaluator for bundle structure
- Create a dedicated Python native-skill runtime
- Prove one or two representative skills can load through `Skills(...)`
- Start compatibility analysis on existing skills so the most valuable legacy bundles can be upgraded immediately

### 17.2 Phase 2 - Make it durable

- Add supervisor
- Add progress/session/artifact persistence
- Add resume and max-turn recovery
- Add verification logging and artifact indexing

### 17.3 Phase 3 - Make it maintainable

- Add native maintenance lifecycle
- Add `migrate-legacy`
- Add patch policy and lock/version bump behavior
- Add native bundle checks to registry and skill APIs
- Turn maintenance analysis into a standing upgrade queue for existing skills

### 17.4 Phase 4 - Make it production-grade

- Add provider-matrix tests
- add durability metrics and tracing
- add rollout flags and compatibility reporting
- reduce reliance on legacy manifest paths for native-ready skills

---

## 18. Testing and verification requirements

### 18.1 Authoring tests

Must verify:

- create emits every required file
- output paths match declared lock metadata
- generated scripts are executable and non-interactive

### 18.2 Runtime tests

Must verify:

- skill discovery through `Skills(...)`
- wrapper script execution inside sandbox
- phase progress persistence
- checkpoint and resume across interruption
- verify-before-finalize enforcement

### 18.3 Maintenance tests

Must verify:

- evaluate detects missing files and missing sections
- improve preserves native bundle validity
- migrate-legacy creates a runnable native bundle
- existing legacy skills can be ranked and upgraded without breaking current callers

### 18.4 Security tests

Must verify:

- path traversal is rejected
- undeclared entrypoints are rejected
- checkpoints redact secrets
- writes outside allowed outputs are rejected
- breaking auto-apply is blocked

### 18.5 Compatibility tests

Before production-ready status:

- at least one OpenAI model must pass the full path
- at least one non-OpenAI provider tier must pass the supported compatibility tier for the skill

---

## 19. Operational checklist

Before marking the feature ready, the platform must have:

- native `agents_python` target in ISC
- native bundle exporter
- native bundle evaluator
- `create`, `improve`, `evaluate`, `migrate-legacy` CLI support
- native skill runtime using sandbox-mounted skills
- phase supervisor
- progress and artifact persistence
- compatibility documentation
- verification path

Before marking production-ready, the platform must prove:

- native skill creation works
- native bundle discovery works
- long-run resume works without losing artifacts
- skill maintenance works on the native bundle
- verification runs before finalize every time
- compatibility is validated across at least two provider tiers

---

## 20. Definition of done

Feature 106 is complete when all of the following are true.

1. **Create path**
   - `isc create --target-platform agents_python` emits a valid native bundle.

2. **Plug-and-play path**
   - The runtime discovers the skill through `Skills(lazy_from=...)` and uses it successfully.

3. **Long-run path**
   - Phase-based skill execution can pause, resume, and recover after interruption without losing work.

4. **Maintenance path**
   - `isc improve --target-platform agents_python --skill <name>` operates on native bundles and enforces verify.

5. **Migration path**
   - At least one legacy skill can be migrated into the native bundle shape and evaluated successfully.
   - The upgrade flow can be repeated across the current skill catalog without requiring a separate rewrite track.

6. **Compatibility path**
   - Compatibility contracts are documented and validated across at least one OpenAI model and one non-OpenAI provider tier.

7. **Operational path**
   - Progress logs, artifact indexes, verification commands, and terminal states are durable and inspectable.

---

## 21. Recommended next planning unit

This feature is intentionally scoped as a follow-on architecture spec. The recommended implementation sequence after approval is:

1. native ISC target and exporter
2. native evaluator and validator
3. dedicated Python native-skill runtime
4. phase supervisor and persistence
5. Node registry and router integration
6. legacy migration and maintenance hardening

That sequence creates the shortest path to proving end-to-end value while reducing migration risk.
