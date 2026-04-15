# Research Notes - Feature 095 Work OS Automation Fabric

## Research decision

- Codebase research: yes
- Web research: no
- Testing: existing TypeScript/Vitest setup in `apps/web`, with `npm --prefix apps/web run test` for suites and `npm --prefix apps/web run check` for type validation

Reasoning:
- The requested feature is primarily an integration/orchestration problem inside an existing codebase.
- The main risk is not choosing a new external technology stack, but reusing the current Work OS, skill execution, agency, and media/document surfaces correctly.
- The implementation should follow the repo's existing server-service-router pattern and its schema-first testing style.

## Codebase findings

### 1. Work OS already provides the canonical case/timeline substrate

Relevant files:
- `apps/web/server/services/workOsService.ts`
- `apps/web/server/routers/workOs.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/client/src/pages/WorkRequest.tsx`
- `apps/web/client/src/pages/MyRequests.tsx`
- `apps/web/client/src/pages/AdminWorkOsDashboard.tsx`

Key observations:
- Work OS already stores requests, cases, tasks, approvals, exceptions, outcomes, SLA records, and a normalized case timeline.
- Timeline entries already unify multiple evidence sources, including `work_os`, `legacy_work_item`, `workpack_record`, `team_run`, and `role_routine`.
- The current surfaces already treat Work OS as a canonical control plane for work intake and review.

Implication:
- The new automation fabric should not create a separate ledger.
- The Work OS case should remain the authoritative envelope for orchestration state, evidence, and operator inspection.

### 2. Skills are the deterministic execution substrate

Relevant files:
- `apps/web/server/services/skillRegistry.ts`
- `apps/web/server/services/unifiedOrchestrator.ts`
- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillOrchestrator.ts`
- `apps/web/server/services/skillPipelineEngine.ts`

Key observations:
- Skills are loaded from disk and database, then resolved through a registry/cache boundary.
- The unified orchestrator already routes execution by capability family, with separate handling for media/image/video/audio and text-like workflows.
- The repo already has a strong separation between skill resolution, routing, and execution.

Implication:
- Skills should be used for deterministic steps in the fabric.
- The new orchestration layer should compose skills, not replace the skill registry or invent a second execution catalog.

### 3. Automation Copilot already exists as a separate browser automation channel

Relevant files:
- `apps/web/server/routers/automationCopilot.ts`
- `apps/web/shared/automation/contracts.ts`
- `apps/web/server/services/browserPolicyRuntime.ts`
- `apps/web/server/services/browserPolicyReleaseControl.ts`

Key observations:
- Automation Copilot is a tRPC-to-Python proxy with feature flags, browser-policy checks, and credit reservation.
- It is oriented toward browser/external automation and not general orchestration.
- It already has clear safety and tenant-gated boundaries.

Implication:
- The automation fabric should treat Automation Copilot as one execution adapter, not as the top-level workflow brain.
- Browser-based or external navigation steps can route through this channel when needed.

### 4. Agency Builder and Agency Swarm already support multi-agent planning, and skills can be exported from agency graphs

Relevant files:
- `apps/web/client/src/pages/AgencyBuilder.tsx`
- `apps/web/client/src/components/agency/ExportAsSkillDialog.tsx`
- `apps/web/client/src/components/agency/agencySkillExport.ts`
- `apps/web/client/src/pages/AdminSkills.tsx`

Key observations:
- Agency Builder can model multi-node graphs and export them as skills.
- Existing UX already supports source-graph linking, duplicate flows, and deep links.
- Agency-style work is therefore best treated as a research/planning/critique surface that can be converted into deterministic skills once stabilized.

Implication:
- Agency Swarm belongs in the fabric as the open-ended reasoning and critique stage.
- When a branch becomes stable enough, it should be promoted into a skill and then executed deterministically.

### 5. Document, media, and video surfaces already separate intermediate content from final execution

Relevant files:
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `apps/web/client/src/components/videoeditor/VideoEditorPhase3.tsx`
- `apps/web/server/services/presentationArticleGenerator.ts`
- `apps/web/server/services/videoEditorService.ts`

Key observations:
- Document Management is the canonical library for uploaded and generated content.
- Media Studio is the workbench for image/media generation.
- Video Editor is a dedicated composition and rendering surface.
- The repo already has patterns for keeping intermediate drafts, library items, and generated outputs distinct.

Implication:
- The fabric should store briefs, prompts, article drafts, and storyboard artifacts in Document Management.
- Media Studio and Video Editor should remain specialized execution targets, not be merged into Work OS storage.

### 6. The repo already contains workflow-like concepts that can be reused

Relevant files:
- `apps/web/server/services/workpackCompilerService.ts`
- `apps/web/server/services/workpackLaunchService.ts`
- `apps/web/server/services/workpackExceptionService.ts`
- `apps/web/server/services/roleRoutineSchedulerService.ts`
- `apps/web/server/services/roleCommandService.ts`
- `apps/web/server/services/desktopReleaseBuildService.ts`

Key observations:
- Workpacks already model multi-step plans, exceptions, retry/rollback behavior, and promotion paths.
- Role routines already model checkpoints, stale state, and safe resume/review semantics.
- Desktop-related services already treat execution as attributable, audited, and resumable.

Implication:
- The automation fabric should align with these existing state-machine patterns instead of inventing a one-off flow model.
- “Resume”, “rollback”, “checkpoint”, and “approval gate” are already natural concepts in the codebase.

## Testing notes

- Existing framework: Vitest
- Existing validation gate: `npm --prefix apps/web run check`
- Likely test locations:
  - `apps/web/server/services/__tests__/`
  - `apps/web/server/routers/__tests__/`
  - `apps/web/client/src/pages/__tests__/`
  - `apps/web/client/src/components/**/__tests__/`

Recommended testing strategy for this feature:
- Add schema tests for any new automation tables or enums.
- Add service tests for mode selection, step dispatch, checkpoint persistence, and resume behavior.
- Add router tests for tenant checks, approval gates, and execution-adapter routing.
- Add UI tests for mode switching, checkpoint edits, approval prompts, and timeline visibility.
