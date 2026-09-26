# Section 11 — AI Draft/Edit compiler and safe graph mutation

## Goal

Make “สร้าง Draft ด้วย AI” and “ปรับ Workflow ด้วย AI” real, reviewable, and
registry-safe.

## Owned paths

- `apps/web/server/services/workflowBuilderCompiler.ts`
- `apps/web/server/services/workflowStudioAiDraft.ts`
- AI procedure regions in `apps/web/server/routers/workflowStudio.ts`
- compiler/service tests and AI panel tests.

## Behavior

- Accept goal/prompt, optional current graph, selected flow/node, desired output,
  and constraints.
- Produce only known registry node IDs, valid versions, typed ports, configs,
  bindings, branch handles, and subflow contracts.
- Return a candidate graph, explanation, assumptions, node/edge diff, unresolved
  inputs, readiness diagnostics, and estimated capability/cost metadata.
- Use deterministic normalization/validation after the LLM response. Reject
  invented node IDs, hidden secrets, invalid ports, cycles without control node,
  unsupported providers, arbitrary URLs/queries, and unbounded loops.
- Apply only after explicit user action and draft revision match. Persist an
  undoable candidate/apply record; published versions are immutable and AI never
  executes a response directly.

## UI behavior

The AI panel must have a real prompt field, examples, loading/error/empty/success
states, candidate graph summary, diff view, warnings, Apply to draft, Reject,
and Revert. A selected node/flow context is visible. The panel reuses existing
AI draft/dialog patterns and the Workflow Studio mockup layout.

## UI/UX Contract

- Target/JTBD: builder asks AI to create or change a workflow and understands
  exactly what will change before applying it.
- Existing pattern: reuse `AIDraftModal` and `AutomationChatModal` patterns;
  diverge only for graph diff/registry diagnostics.
- Surfaces: builder AI action, prompt panel/dialog, candidate diff, diagnostics,
  apply/reject/revert confirmation.
- States: prompt empty, generating, invalid candidate, warnings, valid candidate,
  applying, revision conflict, applied, rejected.
- Responsive: mobile/tablet use a sheet with fixed Apply/Reject actions;
  desktop uses right/bottom panel consistent with the mockup.
- Accessibility: labeled prompt, live generation status, focus return after
  dialog, keyboard reachable diff and Apply/Reject, visible errors.
- Copy: Thai/English plain language; say “AI เสนอการเปลี่ยนแปลง” rather than
  implying that AI already changed or ran the workflow.
- Browser evidence: capture prompt, candidate diff, invalid candidate, apply,
  and revision conflict at mobile/tablet/desktop.

## TDD-first checks

- Natural-language goal maps to known registry IDs and valid graph.
- Invalid/secret/unbounded/incompatible model output is rejected.
- Diff/explanation/diagnostics are stable and actionable.
- Apply requires explicit action/revision and supports undo/revert.
- Published graph cannot be changed/run by an AI response.
- UI handles all generation/apply/error/revision states.

## UI/UX Contract

### Target User / JTBD

Builder asks AI to create or change a workflow and understands the exact candidate before applying it.

### Existing Pattern Reference

Reuse `AIDraftModal` and `AutomationChatModal`; diverge only for graph diff and registry diagnostics.

### Surface Inventory

Prompt field, generation state, candidate graph summary, diff/diagnostics, Apply, Reject, Revert, and revision-conflict dialog.

### Component Map

AI service/compiler supplies candidate/diff; the section 10 AI panel renders and applies it.

### State Matrix

Empty prompt, generating, invalid candidate, warning, valid candidate, applying, conflict, applied, rejected, and error must be explicit.

### Responsive Matrix

Mobile/tablet use a sheet with fixed Apply/Reject actions; desktop uses the mockup-aligned side/bottom panel.

### Accessibility Acceptance

Prompt and actions are labeled; generation status is announced; focus returns after dialog; diff and Apply/Reject are keyboard reachable.

### Copy Contract

Thai/English copy must say that AI proposes changes, never imply the graph already changed or ran.

### Browser Evidence Required

Capture prompt, candidate, invalid candidate, apply, and revision conflict at mobile/tablet/desktop.

## Exit criteria

AI Draft/Edit visibly does useful work: it creates or changes a typed workflow
candidate, explains it, surfaces gaps, and applies safely to a draft.
