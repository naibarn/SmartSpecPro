# Section 05 — Workspace/Result Verification and Agent UI

## Source coverage

Feature 200 sections 12–14, 20, 25, 31–39, 42, 47, 50 and all UI/result/verification acceptance requirements.

## Deliverable

Verify workspace diffs, artifact lineage, output schema and native evidence before terminal success; render Agent Panel/live task/approval/diff/result from canonical Job/session projections.

## UI/UX Contract

### Target User / JTBD
End users/project owners start an approved Agent Task from `/chat`/Assistant and inspect verified work.

### Existing Pattern Reference
Reuse Chat plan/approval/live-task cards, job monitor, Runner connection and Library artifact views.

### Surface Inventory
Agent Panel, provider/runtime selector, task manifest/context scope, approval dialog, live events, diff/artifact verification and final result.

### Shared Task Control Projection
The same Feedback/Chat launcher and `/chat` Universal Control Plane panel MUST
show open multi-step work from the protected `workerJobs.taskGroups` projection.
Users can expand each group to inspect ordered steps, status, bounded progress,
worker/runtime, latest safe event and prerequisites, while retaining the
existing cancel action. Grouping uses valid plan metadata first, then workflow
run, then an isolated single-job fallback; completed in-scope predecessors are
shown under the active group. The panel discloses the bounded 500-job source
scan and links to the existing full Job view when exhaustive inspection is
needed.

### Component Map
Chat owns presentation; Feature 200 owns Agent state; Feature 195 owns Job; Feature 197 owns Runner; 199 owns MCP grants.

### State Matrix
Loading, empty, error, success, partial, unknown, disconnected, approval, verification-failed, disabled, selected, hover and focus.

### Responsive Matrix
Mobile 390×844, tablet 768×1024, laptop 1024×768, desktop 1440×900 and wide desktop 1280×800 for diffs/logs.

### Accessibility Acceptance
Keyboard controls, focus, labels, live-region semantics, contrast, reduced motion and safe streaming updates.

### Copy Contract
Thai/English copy identifies provider, workspace scope, pending approval, verification, untrusted output, failed and completed; no credentials.

### Browser Evidence Required
Start → approve → live event → disconnect/recover → verify → result.

## TDD steps

Test verification and UI state matrix first; implement projections/components; run focused jsdom/browser checks.
