# Feature 095: Work OS Automation Fabric

## Problem
The current codebase has strong building blocks for `Work OS`, `Skills`, `Agency Swarm`, `Document Management`, `Media Studio`, and `Video Editor`, but the end-to-end path is still fragmented.

Today, users can:
- create and track work cases in Work OS
- invoke skills and agency workflows
- generate documents, media, and video assets
- inspect evidence in timelines and dashboards

What is still missing is a unified automation fabric that can:
- run work in manual, semi-automatic, or fully automatic modes
- move a case through research, planning, drafting, asset creation, review, and export
- allow humans to intervene, edit, or approve at checkpoints
- keep one canonical case ledger in Work OS while execution happens across skills and media systems

## Goal
Build a production-ready orchestration model where Work OS becomes the runtime control plane for multi-step business work, including content and media production pipelines.

The solution must support three operating modes:
1. Manual assist
2. Semi-auto with editable checkpoints
3. Fully auto with approval gates

The same case should be able to change mode during execution when confidence, risk, or user preference changes.

## Proposed Solution
Use Work OS as the canonical case ledger and orchestration controller.

The controller should:
- select a workflow template or task graph based on the case type
- dispatch steps to Skills, Agency Swarm, Document Management, Media Studio, and Video Editor
- treat Automation Copilot as the browser/external automation adapter, not the top-level workflow engine
- persist every checkpoint, artifact, and ownership change in Work OS
- pause for human approval when required
- resume from the last checkpoint after edits or failures

Agency Swarm should handle open-ended reasoning, research, and critique-heavy work.
Skills should handle deterministic special-purpose steps.
Document Management should hold intermediate drafts, briefs, prompts, and storyboard artifacts.
Media Studio should generate images and other media assets.
Video Editor should assemble, revise, and export video timelines.
The same case should be able to switch between manual assist, semi-auto, and fully auto modes without losing audit history.

The first release should prove a single end-to-end workflow family first:
- intake a content-production case
- research and summarize the brief
- draft prompt/article/storyboard artifacts
- generate images or other media assets
- compose a video or final output
- pause for review and approval
- export the final result

## Scope
This feature should cover:
- workflow mode selection per case
- a first-release workflow family with research -> draft -> asset creation -> review -> export
- checkpointed execution with editable drafts
- human approval gates
- automatic routing to research, prompt creation, article drafting, storyboard generation, image generation, and video composition
- persistence of all intermediate outputs in Work OS
- direct integration points with existing codebase surfaces
- recovery, retry, and rerun semantics
- mode transition rules and approvals for switching between manual assist, semi-auto, and fully auto
- explicit safety boundaries for tenant isolation, data egress, and browser/external actions

## Non-goals
This feature does not need to:
- replace the existing Chat front door
- rewrite Media Studio, Document Management, or Video Editor internals
- remove manual workflows
- fully redesign Skills or Agency Swarm
- solve every possible enterprise workflow in one release

## Success Criteria
The feature is successful when:
- a case can run in manual, semi-auto, or fully auto mode
- the case can move through research → draft → review → asset creation → export without users clicking every step
- humans can edit or approve at checkpoints without breaking the run
- Work OS always reflects the latest state, evidence, and final outcome
- the same orchestration model works for document, media, and video production cases
- the system can safely resume from a checkpoint after human edits or a failure
- the system can refuse unsafe automation and fall back to manual assist without losing the case
- each automation step is attributable, tenant-scoped, and idempotent enough to retry safely

## Current Codebase Fit
The repository already contains relevant starting points:
- `Work OS` case and timeline surfaces
- Work OS timeline sources for `work_os`, `legacy_work_item`, `workpack_record`, `team_run`, and `role_routine`
- `Skills` registry and execution flows
- `unifiedOrchestrator` for deterministic skill/media routing
- `Agency Builder` export/duplication into skills
- `Agency Swarm` builder and runtime surfaces
- `automationCopilot` for browser/external automation with feature flags and credit gating
- `Document Management`, `Media Studio`, and `Video Editor`
- Work request and monitoring pages that already link to Work OS and help content

This feature should extend those surfaces instead of creating a parallel orchestration system.

## Safety and Security

- Every run step must have a declared execution surface and a declared risk level.
- Browser/external actions must stay behind the existing Automation Copilot feature flag, policy gate, and credit gate.
- Work OS must remain the only place that can authorize ownership, approval, SLA, exception, and final outcome transitions.
- Human approval must be mandatory for publish, external side effects, destructive actions, and any step marked high risk by policy.
- Intermediate content from external sources must be treated as untrusted input, not as instructions.
- Retry and resume must be idempotent or guarded by dedupe keys so that reruns do not create duplicate side effects.

## Open Questions
- Which case families should be enabled first after the initial content-production workflow proves out?
- Which steps in the first workflow family can be fully auto by default, and which remain gate-only?
- What confidence threshold should permit a run to move from semi-auto to fully auto?
- Which artifact types need immutable snapshots versus editable working drafts?
