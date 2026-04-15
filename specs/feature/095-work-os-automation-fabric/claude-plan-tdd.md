# 095 - Work OS Automation Fabric - TDD Plan

## 1. Canonical automation run model and persisted orchestration state

### Tests to write first

- Assert the new run envelope stores Work OS case linkage, operating mode, workflow template reference, current step, checkpoint state, and final disposition.
- Assert step records can represent sequential steps, retries, and resumptions.
- Assert checkpoint records are explicit and attributable.
- Assert mode-change events are persisted and visible in the run history.
- Assert Work OS timeline projections can include automation-run evidence without losing tenant or case identity.

### Failure signal

- Runs exist without a case linkage.
- Step history collapses into one opaque blob.
- Checkpoint states are not distinguishable from generic run state.

## 2. Mode selection and workflow template resolution

### Tests to write first

- Assert manual assist, semi-auto, and fully auto are valid mode values.
- Assert the mode resolver can derive a mode from request metadata or explicit selection.
- Assert template resolution can choose a graph from workpack, role-routine, skill, or agency provenance.
- Assert low-confidence resolution falls back to manual assist rather than auto-running unsafely.
- Assert a single case can change modes during execution while preserving the run identity.
- Assert upgrading from semi-auto to fully auto requires a policy-checked safe state.
- Assert downgrading from fully auto to manual assist is allowed and audited.

### Failure signal

- The resolver invents a mode that is not supported.
- Template provenance is lost.
- Mode changes create a new unrelated case instead of continuing the same run.

## 3. Execution adapters and step routing boundaries

### Tests to write first

- Assert deterministic steps route to the skill execution path.
- Assert open-ended research or critique steps route to Agency Swarm rather than a deterministic executor.
- Assert browser/external steps route to Automation Copilot only when policy and feature-flag checks pass.
- Assert document/media/video outputs are stored or referenced through the expected specialized surface.
- Assert every adapter reports status and evidence back to Work OS.
- Assert step payloads cannot introduce an unapproved execution surface.
- Assert retries and resumes reuse the same dedupe key or step identity.

### Failure signal

- A step lands in the wrong executor.
- Browser automation bypasses policy checks.
- Adapter output is not surfaced in Work OS.

## 4. Checkpoints, human edits, approval gates, and resume semantics

### Tests to write first

- Assert a checkpoint can be created in a review-needed state and then advanced after human edit or approval.
- Assert the system can resume from the last safe checkpoint instead of restarting from scratch.
- Assert edits create a new revision or checkpoint history entry.
- Assert fully auto runs pause at approval gates and do not continue until approved.
- Assert rollback or rerun from checkpoint is possible without breaking the case identity.
- Assert publish, external side effect, destructive, and high-risk steps require a gate or manual assist path.
- Assert a checkpoint edit does not mutate the prior snapshot.

### Failure signal

- Edits erase prior history.
- Resume starts from the wrong step.
- Approval gates fail open.

## 5. Evidence, drafts, media outputs, and operator surfaces

### Tests to write first

- Assert Work OS timeline entries can show run steps, checkpoints, approvals, and exceptions together.
- Assert timeline entries preserve source attribution for Work OS, skill, agency, document, media, and video evidence.
- Assert drafts and storyboard artifacts can be linked from Work OS to Document Management.
- Assert media outputs and video render outputs are reachable from the case timeline.
- Assert the UI surfaces can display the current run mode and checkpoint state.
- Assert timeline entries point to source artifacts instead of duplicating binary payloads into Work OS.

### Failure signal

- Timeline evidence is unlabeled.
- Operators cannot see the active checkpoint.
- Draft and media outputs are disconnected from the case.

## 6. Rollout, guardrails, and regression coverage

### Tests to write first

- Assert legacy Work OS and related surfaces still function while the new fabric is introduced.
- Assert tenant isolation is preserved across intake, orchestration, checkpoints, approvals, and timeline access.
- Assert no mutation path can bypass the Work OS boundary for ownership, approval, or checkpoint state.
- Assert compatibility-first rollout can keep manual assist working while semi-auto and fully auto are gated.
- Assert the core lifecycle regression suite covers intake, mode selection, execution routing, checkpointing, resume, and final evidence capture.
- Assert side-effect steps cannot execute without allowlist approval.
- Assert repeated retries do not create duplicate media, duplicate exports, or duplicate approvals.

### Failure signal

- A mutation path bypasses the canonical boundary.
- Legacy users lose access to the old flow.
- Tenant boundaries leak.
