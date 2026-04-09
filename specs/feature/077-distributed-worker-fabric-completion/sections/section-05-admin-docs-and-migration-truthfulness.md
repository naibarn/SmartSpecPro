# Section 05: Admin, Docs, and Migration Truthfulness

## Goal

Align product messaging, admin visibility, and migration guidance with what the platform really supports after Feature 077.

## Why this section exists

The current help content is honest for OpenClaw workers, but the revised worker-fabric architecture needs a broader truth model:

- what is OpenClaw-specific
- what is desktop-local
- what is future-gated secure pool or cluster functionality

Without this section, the product risks overclaiming runtime parity.

## Scope

1. Update docs and admin surfaces to distinguish:
   - OpenClaw gateway workers
   - Desktop + ZeroClaw managed workers
   - NemoClaw secure pools
   - HiClaw collaborative clusters
2. Add migration notes that Feature 059 wording is partially superseded.
3. Ensure rollout docs explain runtime-family feature flags and kill switches.
4. Define workflow/persona-facing worker-node contracts and failure semantics at the docs/spec layer so UI and help copy do not overclaim orchestration behavior.
5. Keep monitoring truth aligned with what is actually implemented.

## Cross-section role

- This section depends on Sections 01-04 being specific enough that docs and operator surfaces can describe real behavior instead of placeholders.
- It does not introduce new runtime semantics; it translates the earlier sections into truthful admin, workflow, and migration language.

## Suggested files

- `apps/web/docs/help/en/openclaw-workers.md`
- `apps/web/docs/help/th/openclaw-workers.md`
- `apps/web/docs/help/en/workflow-editor.md`
- `apps/web/docs/help/th/workflow-editor.md`
- `apps/web/docs/help/en/workflows.md`
- `apps/web/docs/help/th/workflows.md`
- `apps/web/client/src/pages/AdminMonitoring.tsx`
- `apps/web/client/src/pages/WorkflowEditor.tsx`
- `apps/web/client/src/lib/workflow/useNodeRegistry.ts`
- `apps/web/client/src/components/workflow/config/DynamicNodeConfig.tsx`
- `apps/web/server/routers/workflow.ts`
- `specs/feature/README.md`

## Design rules

- Do not let docs imply that all declared runtimes are already production-ready.
- Keep OpenClaw docs accurate and keep desktop/runtime docs separate when behavior differs.
- Make migration from old Feature 059 language explicit instead of silently changing terminology.
- Workflow/persona docs should explain the difference between dispatch success, worker execution success, artifact publish success, and indexing success.
- Workflow editor and node-registry surfaces must hide or disable worker-runtime node affordances until the corresponding runtime-family rollout flag and backend support are both enabled.

## Testing first

- docs/public truthfulness checks
- admin monitoring tests for runtime-family display
- regression checks proving current OpenClaw operator guidance still works after broader worker-fabric docs are added
- workflow-builder or persona-surface contract tests for dispatch / wait / publish / index messaging and failure-state labels
- workflow-editor/node-registry tests for rollout-gated worker-runtime node visibility
