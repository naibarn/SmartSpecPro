# Codebase Gap Analysis - Feature 095 Work OS Automation Fabric

## Executive summary

The requested automation fabric is feasible with the current codebase, but it is not yet implementable as a single production-ready change without additional specification on state, policy, and safety.

The repo already has the most important primitives:
- Work OS as a canonical case/timeline/approval/exception substrate
- skill execution and deterministic routing
- Agency-style multi-agent planning surfaces
- Automation Copilot as a browser/external automation adapter
- Document Management, Media Studio, and Video Editor as specialized execution surfaces
- Workpack and role-routine systems that already model checkpoints, resumability, approvals, and side-effect risk

What is still missing is a first-class orchestration layer that ties those primitives together with an explicit run model, mode transition policy, checkpoint rules, artifact policy, and dedupe-safe retry semantics.

## What already exists and is close enough to reuse

### 1. Work OS is already the correct canonical ledger

Evidence:
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/routers/workOs.ts`
- Work OS timeline sources already include `work_os`, `legacy_work_item`, `workpack_record`, `team_run`, and `role_routine`

Assessment:
- Good foundation for a canonical case ledger
- Already supports the kind of evidence aggregation the fabric needs
- Needs a new automation-run model, but not a new ledger

### 2. Skills and the unified orchestrator are a good deterministic execution layer

Evidence:
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/unifiedOrchestrator.ts`
- `apps/web/server/services/skillPipelineEngine.ts`

Assessment:
- Strong fit for deterministic steps, media routing, and bounded tool use
- Existing capability classification and fallback behavior are useful
- Missing a top-level automation fabric that chooses when to call skills versus other adapters

### 3. Automation Copilot already fills the browser/external adapter role

Evidence:
- `apps/web/server/routers/automationCopilot.ts`
- `apps/web/server/services/browserPolicyReleaseControl.ts`
- `apps/web/server/services/browserPolicySettingsBridge.ts`

Assessment:
- Good existing policy-gated adapter for browser/external actions
- Should be reused, not replaced
- It is not a full orchestration brain, so the new fabric must stay above it

### 4. Workpack and role-routine systems already encode several production patterns we need

Evidence:
- `apps/web/server/services/workpackCompilerService.ts`
- `apps/web/server/services/workpackLaunchService.ts`
- `apps/web/server/services/workpackExceptionService.ts`
- `apps/web/server/services/roleRoutineSchedulerService.ts`
- `apps/web/server/services/roleCommandService.ts`

Assessment:
- Workpack already models side-effect classes, approval checkpoints, idempotency, retry disposition, and planner-derived runtime intent
- Role routines already model checkpoints, freshness, resume review, and rollback-style recovery
- These systems are the best reference for the new automation fabric state machine

### 5. UI surfaces already expose many of the right operator entry points

Evidence:
- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/client/src/pages/AdminWorkOsDashboard.tsx`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/components/automation/AutomationChatModal.tsx`

Assessment:
- Users already have intake, request, monitoring, and help surfaces that could host mode selection and checkpoint editing
- The UI does not yet expose a first-class automation fabric lifecycle, but the navigation and admin surfaces are there

## Gaps that must be closed before implementation is production-ready

### 1. No explicit automation-run state machine yet

Current state:
- The repo has workpack runs, role checkpoints, Work OS cases, and task executors
- It does not yet have a dedicated automation-run envelope with explicit run, step, checkpoint, and mode-change events across the whole fabric

Why this matters:
- Manual assist, semi-auto, and fully auto are not just UI labels
- They require lifecycle rules, resume cursors, and explicit transitions

Recommendation:
- Add an automation-run model before wiring execution adapters
- Treat mode changes as auditable events, not silent toggles

### 2. Mode transition policy is not yet defined

Current state:
- We know the system should support all three modes
- We do not yet have a policy for when a run can upgrade or downgrade modes

Why this matters:
- Unsafe upgrades are the main way a fabric like this becomes risky
- Without explicit rules, fully auto can drift into unbounded behavior

Recommendation:
- Define allowed transitions and their preconditions
- Require policy validation before semi-auto -> fully auto
- Allow any safe downgrade to manual assist

### 3. Step routing boundaries are not yet unified under one fabric contract

Current state:
- Skill routing, agency flows, browser automation, workpacks, and role routines all exist
- They are still separate execution surfaces with their own rules

Why this matters:
- The fabric must decide which surface owns each step
- If the boundary is fuzzy, automation will become fragmented and hard to resume

Recommendation:
- Introduce an allowlisted step surface contract
- Force every step to declare:
  - execution surface
  - risk tier
  - external side-effect flag
  - retry semantics

### 4. Artifact policy is implied but not formalized enough

Current state:
- Document Management, Media Studio, Video Editor, and Work OS already exist
- It is not yet formalized which artifact types are authoritative where

Why this matters:
- Drafts, prompts, storyboards, media outputs, and video renders need a clear source-of-truth location
- Without this, Work OS can become a duplicate blob store

Recommendation:
- Make Document Management the canonical store for drafts and planning artifacts
- Make Media Studio and Video Editor the canonical stores for media outputs
- Keep Work OS as the evidence and lineage layer

### 5. Idempotency and dedupe behavior are not fully specified for the new fabric

Current state:
- Workpack services already have patterns for idempotency and retry safety
- The automation fabric itself does not yet define step-level dedupe keys or rerun rules

Why this matters:
- Retry/resume can easily duplicate media generation, exports, approvals, or external side effects

Recommendation:
- Require a dedupe key for every side-effecting step
- Make rerun / resume behavior explicit per step class
- Treat duplicates as a first-class failure mode

### 6. Safety gates are needed at the fabric level, not only in individual adapters

Current state:
- Automation Copilot already has feature flags and browser-policy gates
- Workpack step policy already handles some approval and side-effect risk

Why this matters:
- The new fabric will combine multiple adapters
- Safety cannot depend only on the adapter; the orchestrator must also enforce policy

Recommendation:
- Add a fabric-wide allowlist for execution surfaces
- Require approval for publish, destructive, and external side-effect steps
- Keep untrusted inputs untrusted all the way through the pipeline

### 7. The first release workflow family is still too broad unless explicitly pinned

Current state:
- The spec now says “content-production pipeline” first
- The exact first workflow template is still not locked to a concrete template ID or graph shape

Why this matters:
- Without a pinned first workflow, implementation can sprawl across too many cases

Recommendation:
- Pick one content/media workflow family first
- Define its steps, checkpoints, and gates up front
- Use that flow as the proving ground before generalizing

## Feasibility verdict

### Can this be automated?

Yes.

But it will be automation through a controlled orchestration model:
- deterministic steps handled by skills
- open-ended work handled by Agency Swarm
- browser/external work handled by Automation Copilot
- drafts and assets stored in their canonical surfaces
- Work OS carrying the case, run, and evidence timeline

### Can it be production-ready?

Yes, but only if the implementation is staged.

The smallest safe production-ready slice is:
1. one content-production workflow family
2. explicit run and checkpoint records
3. explicit mode transition rules
4. explicit approval gates
5. explicit idempotency / dedupe behavior
6. source-attributed timeline evidence

### What would make it unsafe?

- silent mode upgrades
- missing approval gates for side-effecting steps
- no dedupe keys for retries
- storing artifacts only in Work OS instead of source systems
- allowing arbitrary execution surfaces to be introduced by payload

## Recommended implementation order

1. Define the automation-run state machine and data model.
2. Define mode transition rules and approval policy.
3. Define the first release workflow family.
4. Define execution adapter contracts and allowlists.
5. Define checkpoint/edit/resume semantics.
6. Define artifact lineage and evidence links.
7. Define dedupe / retry safety.
8. Then wire UI and router surfaces.

## Bottom line

The codebase is ready for this feature in principle, but not yet ready for a naive “wire everything together” implementation.

The right path is a controlled automation fabric built on top of the existing systems, with Work OS as the canonical run ledger and the specialized systems as execution adapters.
