# Interview Transcript — UI/UX Improvement Plan

## Interview mode

No blocking clarification was required. The request explicitly asks for an
ordered improvement plan that makes the Spec 202/203 Web Editor as complete as
practical, and the previous UI audit supplies concrete gaps and evidence
boundaries. The following decisions are therefore recorded as working defaults
for implementation.

## Decisions captured

### Scope

- Improve the active `/video-editor` Web Editor and its `/worker-jobs` handoff.
- Treat `/video-editor?legacy=1` as rollback compatibility, not a second
  canonical UI to redesign.

### Priority

1. Protect user work: revision, autosave, conflict, external update, and
   recovery states.
2. Make execution truth visible: capability, agent/runtime, pinned revision,
   progress, degraded, QC, and terminal states.
3. Make all dialogs, panels, tabs, and mobile flows keyboard and screen-reader
   usable.
4. Expose AI review/transcript/change-set/QC contracts through a coherent
   review-first workflow.
5. Normalize responsive behavior, visual tokens, copy, and browser evidence.

### Product boundaries

- No silent overwrite, no false completed state, and no UI claim of Windows
  Worker parity when the runtime contract is blocked or degraded.
- No new project store, workflow engine, retired `/workpacks` integration,
  OpenSandbox/Docker path, or client-side authorization decision.
- A shared primitive should be reused when it already exists in the product;
  divergence requires an explicit editor-specific reason.

### Proof expectations

- Every UI state must have focused tests where practical.
- Browser evidence is required for release claims and must cover required and
  extended viewports plus keyboard, focus, overflow, console, and async states.
- Missing browser or target-runtime evidence is recorded as skipped/unproven,
  never as pass.

## Open decisions deferred safely

- Exact final copy wording can be finalized during implementation while
  respecting the Thai-first copy contract and safe English fallback.
- The visual token migration may be incremental; no full Phase3 rewrite is
  required before behavior/state correctness is proven.
- Conflict auto-merge policy remains server-authoritative. The UI must expose
  the server result and available actions rather than implement merge semantics
  independently.
