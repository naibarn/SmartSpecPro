# Synthesized Specification - Feature 095 Work OS Automation Fabric

## 1. Objective

Deliver a production-ready automation fabric where Work OS becomes the runtime control plane for multi-step business work, including research-heavy, content-heavy, media-heavy, and video-heavy pipelines.

The fabric must support:
- manual assist
- semi-auto with editable checkpoints
- fully auto with approval gates

The same case must be allowed to change operating mode during execution without losing audit history.

## 2. First Release Target

The first release should prove one complete workflow family end to end:

1. Intake a content-production case.
2. Normalize the request into a Work OS case.
3. Run research and brief synthesis.
4. Produce draft prompts, article copy, and storyboard artifacts.
5. Generate image or other media assets.
6. Compose or render a video or other final output.
7. Pause at review or approval gates.
8. Resume after human edits.
9. Export the final result and close the case.

This flow is intentionally content/media-heavy because the codebase already has strong support for skill execution, document handling, media generation, and video composition. It is the smallest useful slice that proves the fabric without pretending to solve every enterprise workflow.

## 3. Product Definition

This feature is not a new workflow engine. It is an orchestration layer that composes the systems that already exist in the repo:
- Work OS for the canonical case ledger and timeline
- Skills for deterministic execution steps
- Agency Swarm for multi-agent research, critique, and planning
- Document Management for briefs, drafts, prompts, and storyboard artifacts
- Media Studio for image and media generation
- Video Editor for composition and rendering
- Automation Copilot for browser/external automation steps when a web automation adapter is required

## 4. Core Requirements

### 4.1 Canonical work envelope

- Every automation run must be attached to one Work OS case.
- The case remains the source of truth for state, evidence, ownership, approvals, exceptions, SLA, and final outcome.
- Intermediate outputs may be persisted in external surfaces, but their presence must be reflected back into the Work OS timeline.

### 4.2 Run model and lifecycle

- Each automation case must have a canonical run record.
- Each run must have ordered steps, explicit checkpoints, and a final disposition.
- Each step must record:
  - execution surface
  - input artifact references
  - output artifact references
  - risk tier
  - retry count
  - status
  - actor attribution
- Each checkpoint must record:
  - reason for the pause
  - editable artifact snapshot
  - approval state
  - resume cursor
  - who approved or edited it
- Mode changes must be versioned events on the run, not silent in-place toggles.

### 4.3 Three operating modes

- Manual assist:
  - The system proposes structure and drafts.
  - The human explicitly advances each step.
  - Best for risky, ambiguous, or new workflows.
- Semi-auto:
  - The system runs through safe, predictable steps.
  - It pauses at defined checkpoints for review, editing, or confirmation.
  - Best for common workflows that still need human shaping.
- Fully auto with gates:
  - The system runs end-to-end through the defined workflow graph.
  - It pauses only at approval gates or policy checkpoints.
  - Best for high-confidence, repeatable workflows.

### 4.4 Mode transition rules

- Manual assist may always downgrade or remain manual.
- Semi-auto may advance to fully auto only when the case has a validated template, no open critical exceptions, and the current checkpoint is in a safe state.
- Fully auto must immediately fall back to semi-auto or manual if policy, confidence, or authorization conditions are no longer satisfied.
- Any human can request a downgrade; upgrades to more autonomous modes should require the appropriate operator permission or case policy.
- A mode transition must be visible in the case timeline and audit trail.

### 4.5 Checkpoints and editability

- Every non-trivial workflow must expose explicit checkpoints.
- Checkpoints must be resumable, versioned, and attributable.
- Human edits must create a new revision or checkpoint state rather than destroying the prior history.
- A run must be able to resume from the last safe checkpoint after edits or failure recovery.

### 4.6 Step routing and execution adapters

- Research, planning, and critique-heavy work should route to Agency Swarm.
- Deterministic steps should route to Skills / Unified Orchestrator.
- Browser/external interactions should route to Automation Copilot when the policy/credit boundary is appropriate.
- Drafts, prompts, articles, and storyboard artifacts should be written to Document Management.
- Generated images and media should be produced in Media Studio.
- Video composition and render steps should be handled by Video Editor.

### 4.7 Artifact and evidence policy

- Intermediate drafts, prompts, articles, and storyboard artifacts should be stored in Document Management, with Work OS pointing to them as evidence.
- Generated media assets should be stored in Media Studio, with Work OS linking to the asset identifiers and generation provenance.
- Video compositions and render outputs should be stored in Video Editor or its existing output surface, again linked back into Work OS.
- Work OS timeline entries should be the canonical operator view of the run, not the primary binary store for every artifact.
- Edits must create a new artifact revision or a new checkpoint snapshot, not overwrite the prior evidence.

### 4.8 Observability and evidence

- Every step must generate timeline evidence in Work OS.
- The timeline must preserve source attribution so operators can tell whether evidence came from Work OS, a skill, a workpack, a role routine, a team run, or a synced desktop artifact.
- Monitoring surfaces must be able to summarize run health, checkpoint progress, approvals, and exceptions from the canonical case state.

### 4.9 Safety and security

- Every step must declare its risk tier.
- Every step must declare whether it is allowed to cause external side effects.
- Publish, export, destructive actions, or tenant-wide changes must require an approval gate unless a policy explicitly allows otherwise.
- Prompt, document, and browser inputs must be treated as untrusted content.
- The orchestrator must apply allowlists for execution surfaces and must not infer a new side effect surface on the fly.
- Retries and resumes must be idempotent or deduplicated by step/run keys so the system does not generate duplicate media, duplicate exports, or repeated side effects.
- Tenant isolation must be preserved across all adapter calls, persisted artifacts, and timeline projections.
- Any browser/external adapter use must remain behind the existing feature flag and policy gate model.

## 5. Scope

This feature should cover:
- mode selection per case
- template or graph resolution for automation runs
- step dispatch to the correct execution surface
- explicit checkpointing and resume semantics
- human edit / approval / override points
- persistence of drafts and artifacts in the appropriate storage surface
- timeline and dashboard visibility for operators
- compatibility with existing Work OS, skill, agency, media, and document flows
- rollback, retry, and rerun semantics
- safe mode downgrade when a run becomes uncertain
- safe mode upgrade only when confidence and policy allow it

## 6. Non-goals

This feature does not need to:
- replace Chat as the front door
- replace the existing skill registry
- replace Automation Copilot
- replace Media Studio, Document Management, or Video Editor internals
- create a second workflow engine beside Work OS
- convert every existing workflow into the new fabric at once
- eliminate human approval for high-risk or external side-effect steps

## 7. Success Criteria

The feature is successful when:
- a case can run in manual, semi-auto, or fully auto mode
- the mode can change during the run without breaking the case identity
- research, drafting, prompt creation, storyboard generation, asset generation, and video composition can proceed without the user clicking every step
- the user can stop, edit, approve, or rerun from a checkpoint
- Work OS always reflects the latest state, evidence, and outcome
- media/document/video outputs are reachable from the case timeline
- the same orchestration model works for content, media, and video production cases
- mode transitions are auditable and policy-checked
- retry/resume does not create duplicate outputs or duplicate side effects
- unsafe actions are forced through approval or manual assist instead of silently auto-running

## 8. Current Codebase Fit

The repository already contains the right primitives:
- `workOsService` and the Work OS timeline projections
- the skill registry and unified orchestrator for deterministic execution
- Automation Copilot for browser automation
- Agency Builder and export-to-skill flows
- Document Management, Media Studio, and Video Editor as specialized execution surfaces
- Work request, monitoring, and help surfaces that already point users toward Work OS

The implementation should extend those primitives rather than inventing a parallel orchestration stack.

## 9. Open Questions Resolved by This Spec

- Which orchestration layer is canonical? Work OS.
- Should the feature introduce a second workflow engine? No.
- Should open-ended reasoning be handled the same way as deterministic execution? No.
- Should intermediate drafts live in Work OS or Document Management? Document Management, with Work OS timeline evidence.
- Should manual, semi-auto, and fully-auto modes be separate products? No. They are modes on the same case and same fabric.
- Is fully auto allowed without gates for destructive or external side effects? No.
- Can the system infer a new execution surface dynamically? No, it must use an allowlisted adapter.
