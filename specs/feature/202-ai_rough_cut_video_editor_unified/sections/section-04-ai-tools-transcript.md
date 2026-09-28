# Section 04 — AI tools, transcript, inspector, suggestions

## Objective

Connect AI tool UX to typed intent/change-set contracts while keeping human
review and capability state explicit.

## Files and ownership

- Existing AI tools, transcript, inspector, and suggestion components under
  `apps/web/client/src/components/videoeditor/`.
- Add focused component tests and small shared UI state helpers as needed.

## Behavior

- Suggest, Draft, and Apply are distinct modes; Apply requires review.
- Tool settings expose capability, confidence, cost, evidence freshness,
  protected ranges, and review requirement before dispatch.
- Transcript anchors and timeline selection stay synchronized in canonical time.
- Suggestions support accept/reject/defer with audit metadata.
- Missing capability is actionable and never silently treated as success.

## TDD and acceptance

Test mode transitions, transcript anchors, selection sync, capability messaging,
suggestion actions, dialog keyboard behavior, and review gate.

## UI/UX Contract

Provide loading/empty/error/blocked/degraded/review/apply states; responsive
mobile review-first layout; keyboard focus and semantic labels; bilingual copy;
browser evidence for a suggestion through review to apply/reject.

### Target User / JTBD
Editor needs AI assistance without surrendering editorial control.

### Surface Inventory
AI tools panel, command bar, transcript editor, inspector, suggestions inbox.

### Component Map
Tool state owns mode/settings; transcript owns anchors; suggestions owns
accept/reject/defer; runtime services own readiness.

### State Matrix
Loading, empty, unavailable, suggestion, draft, review, apply, reject, defer,
error, and focus.

### Responsive Matrix
Mobile panel-first; tablet split transcript/timeline; desktop multi-panel.

### Accessibility Acceptance
Keyboard modes/dialogs, focus return, semantic labels, live errors, contrast,
and reduced motion.

### Copy Contract
Thai-first Suggest/Draft/Apply labels; English fallback; no silent capability
failure.

### Browser Evidence Required
Authenticated suggestion-to-review-to-apply/reject flow.
