# 095 - Work OS Automation Fabric

## Objective

Build an orchestration fabric that lets Work OS run real multi-step business workflows in three modes, while reusing the existing Skill Registry, Agency Swarm surfaces, Automation Copilot, Document Management, Media Studio, and Video Editor.

The goal is not to introduce a second workflow engine. The goal is to make Work OS the runtime control plane for a composed pipeline that can plan, draft, generate, review, approve, resume, and publish work.

The first release must prove one end-to-end content-production workflow family:
- research
- brief synthesis
- prompt/article/storyboard drafting
- media generation
- video composition
- review and approval
- export

## Plan Structure

1. Canonical automation run model and persisted orchestration state
2. Mode selection, workflow template resolution, and mode transition rules
3. Execution adapters, step routing boundaries, and surface allowlists
4. Checkpoints, human edits, approval gates, and resume semantics
5. Evidence, drafts, media outputs, and operator surfaces
6. Rollout, guardrails, and regression coverage

## 1. Canonical automation run model and persisted orchestration state

### What to build

- Add a canonical automation-run envelope tied to Work OS case identity.
- Persist the run mode, workflow template reference, current step, checkpoint state, and final disposition.
- Persist step records separately so the fabric can represent sequential work, branching work, retries, and resumed work without collapsing all state into one blob.
- Persist explicit checkpoint records for edit/review/approval points.
- Persist mode-change events so transitions are auditable and reversible.
- Keep Work OS as the source of truth for the automation lifecycle while allowing other surfaces to contribute evidence and artifacts.

### Why this is first

The mode system and execution adapters need a shared state model before any routing can be made reliable. If the runtime state is vague, the three modes will diverge immediately.

### Implementation notes

- Reuse Work OS as the parent identity instead of creating a parallel job ledger.
- Keep intermediate output references as durable pointers rather than duplicated content where possible.
- Make checkpoint state explicit enough to support resume, rerun, rollback, and edit history.

## 2. Mode selection and workflow template resolution

### What to build

- Add mode selection that can be set at case creation time and changed later.
- Resolve a workflow template from the case type, request metadata, existing workpack/role-routine patterns, or an Agency Swarm export.
- Support a confidence-driven fallback to manual assist when the system cannot safely choose a stronger mode.
- Allow a single case to begin in manual assist, transition to semi-auto after a human edit, and then continue as fully auto once confidence increases.
- Define the allowed mode transitions and the conditions that must be satisfied for each transition.
- Require an explicit policy check before upgrading to a more autonomous mode.

### Why this matters

The point of the fabric is flexibility. A user must be able to choose speed when the work is obvious and choose caution when the work is uncertain.

### Implementation notes

- Treat mode as a runtime property of the case, not as a separate product line.
- Keep template selection deterministic enough to be auditable.
- When the template is derived from an Agency graph or skill graph, keep a stable provenance link back to the source.

## 3. Execution adapters and step routing boundaries

### What to build

- Route deterministic step execution through Skills / Unified Orchestrator.
- Route open-ended research, planning, and critique through Agency Swarm.
- Route browser and external automation through Automation Copilot when the surface is policy-approved.
- Route draft artifacts and intermediate content into Document Management.
- Route image and media generation into Media Studio.
- Route composition and render steps into Video Editor.
- Ensure every adapter reports back step status, output pointers, and evidence to Work OS.
- Apply a surface allowlist so new execution surfaces cannot be introduced implicitly by step payloads.

### Why this matters

The fabric only works if each step uses the right executor. Open-ended reasoning should not be forced into a deterministic executor, and deterministic steps should not remain trapped in an agent loop.

### Implementation notes

- Keep adapter boundaries server-side.
- Preserve tenant checks and audit trails at every adapter call.
- Avoid coupling Work OS directly to the internal storage model of any specialized surface.

## 4. Checkpoints, human edits, approval gates, and resume semantics

### What to build

- Add checkpoint types for:
  - draft ready
  - review required
  - approval required
  - blocked by policy
  - safe-to-resume after edit
- Allow users to edit drafts, prompts, storyboards, and plan fragments at checkpoints.
- Add resume-from-checkpoint behavior so the run can continue without restarting from the beginning.
- Add approval gates that can pause fully auto runs until a human confirms the next stage.
- Support rollback or rerun from a known checkpoint when a branch fails.
- Require approval for publish, external side effects, destructive actions, and any step marked high risk.

### Why this matters

This is what makes the fabric production-ready. Without checkpointing and resume semantics, the system would either be brittle or force every workflow into manual operation.

### Implementation notes

- Version every meaningful checkpoint change.
- Store the human decision and the reason for the decision.
- Make checkpoint transitions machine-readable so they can be monitored and tested.

## 5. Evidence, drafts, media outputs, and operator surfaces

### What to build

- Ensure the Work OS timeline can surface:
  - run steps
  - checkpoints
  - approvals
  - exceptions
  - Document Management drafts
  - Media Studio assets
  - Video Editor composition/render outputs
- Add or normalize operator views for:
  - automation inbox
  - active runs
  - checkpoint queues
  - approval queues
  - exception desk
  - case timeline
  - run summary and health indicators
- Keep the timeline evidence attributed to the source surface that produced it.
- Ensure timeline entries link to source artifacts instead of copying binary content into Work OS.

### Why this matters

Operators need one place to understand what the fabric is doing, where it is blocked, and what evidence exists so far. Work OS is already the right place for that view.

### Implementation notes

- Keep evidence links deep and direct to the source surface.
- Treat Work OS as the canonical summary, not the storage system for every binary asset.
- Reuse existing Work Request, My Requests, Work OS Console, and Monitoring surfaces where possible.

## 6. Rollout, guardrails, and regression coverage

### What to build

- Roll out in compatibility-first slices:
  1. canonical run envelope and read-only projections
  2. mode selection and checkpoint state
  3. execution adapters
  4. human edit/approval/resume flow
  5. evidence surfacing and operator dashboards
  6. safety gates and idempotency protection
- Add regression tests for tenant isolation, adapter routing, checkpoint persistence, and resume semantics.
- Add guardrails so the fabric cannot mutate ownership or approval state outside the Work OS boundary.
- Keep compatibility with the existing Work OS, skill, agency, and automation copilot surfaces.
- Add a deterministic allowlist for external side-effect steps and make retries/resumes dedupe-safe.

### Why this matters

This is a platform layer. If it ships without staged rollout and regression coverage, it will create competing sources of truth and become hard to operate.

### Implementation notes

- Prefer additive migration steps.
- Use the existing Vitest and `npm --prefix apps/web run check` validation pattern.
- Keep the deterministic read projection contract intact even if a later backfill or feature-flag harness is added.

## Acceptance Criteria

- A case can be created in manual assist, semi-auto, or fully auto mode.
- The same case can switch modes mid-run without losing the audit trail.
- Research, drafting, prompt creation, storyboard creation, asset creation, and video composition can run without a user clicking every step.
- The user can edit or approve at explicit checkpoints and then resume the run.
- Work OS shows the full run history and evidence trail.
- Document Management, Media Studio, and Video Editor remain specialized surfaces but are reachable from the case timeline.
- Agency Swarm can drive open-ended planning or critique, and the result can be promoted into a deterministic skill or step.
- Automation Copilot can be used for browser/external steps without becoming the top-level engine.
- Unsafe actions require gates or manual assist, and retries do not duplicate side effects.
