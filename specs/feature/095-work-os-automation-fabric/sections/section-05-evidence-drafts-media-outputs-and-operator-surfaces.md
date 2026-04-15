# Section 05 - Evidence, Drafts, Media Outputs, and Operator Surfaces

## Goal

Expose the automation fabric cleanly to operators and users by making Work OS the summary surface while keeping artifacts in their native systems.

## What this section must deliver

- Work OS timeline entries for steps, checkpoints, approvals, exceptions, and mode changes.
- Source-attributed evidence for Work OS, skills, Agency Swarm, workpacks, role routines, and team runs.
- Links from Work OS to Document Management drafts and versions.
- Links from Work OS to Media Studio assets and Video Editor outputs.
- Operator surfaces for inbox, active runs, checkpoint queues, approval queues, exception desk, and health indicators.
- No duplicate binary storage in Work OS.

## Files likely to change

- Work OS timeline projection logic
- Monitoring/admin pages
- Request surfaces that lead into the run
- UI components that display or deep-link evidence

## Implementation notes

- Keep Work OS as the canonical summary, not the blob store.
- Link to source artifacts instead of copying them.
- Preserve attribution so operators know where each artifact came from.

## Expected behavior

- Operators can inspect one case and understand the complete state of the run.
- Drafts and assets are reachable through direct links from the timeline.
- Monitoring can summarize run health and blocked checkpoints from the canonical state.

## Test expectations

- Timeline projection tests for all evidence sources.
- UI tests for run mode, checkpoint visibility, and deep links.
- Evidence-link integrity tests so the summary points to source artifacts.

## Risks to watch

- Turning Work OS into a second artifact store.
- Losing source attribution when artifacts cross systems.
- Making operator surfaces depend on noncanonical read paths.

## Implementation Result

This section is satisfied by the existing operator surfaces plus the new automation evidence projection:

- Work OS timeline entries already aggregate automation evidence, workpack/role/team evidence, and other linked sources into a single case view.
- The Work OS console now exposes a first-class automation run summary with current mode, current step, checkpoint state, disposition, and a resume action for approved checkpoints.
- Monitoring exposes browser automation health, source-specific deep links, and a manual reconciliation action so operators can see and clear pending browser claims without hunting through raw logs.
- [`apps/web/server/services/workAutomationExecutionService.ts`](/home/dev/projects/SmartSpecPro/apps/web/server/services/workAutomationExecutionService.ts) now emits real step outputs into the native systems for each adapter surface, then writes the canonical pointers back into the Work OS timeline.
- The monitoring and request surfaces expose deep links and help guidance so operators can jump directly into the relevant evidence slice.
- Drafts, media, and video outputs remain in their native systems; Work OS only stores the canonical pointer and provenance summary.
