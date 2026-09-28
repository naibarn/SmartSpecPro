# Section 05 — Monitoring, UI Projection and Cross-Spec Adapters

## Source coverage

Feature 195 sections 208–224, 278 and all monitoring/result/artifact/cost/progress/delivery plus cross-spec acceptance requirements.

## Deliverable

Expose truthful Job detail/list/event/attempt/recovery/artifact/cost projections and typed adapters for Features 196–200. Extend existing monitoring/job-history UI rather than adding a second execution dashboard.

## UI/UX Contract

### Target User / JTBD
End users and operators track authorized work, intervene safely and understand terminal evidence from existing job/history surfaces.

### Existing Pattern Reference
Reuse existing worker job monitor, media history and task card patterns found under `apps/web/client/src` and `apps/web/server/services/workerJobMonitorService.ts`.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Job list/detail | existing worker/job history routes | Add durable event/attempt/provenance projection |
| Task card | Chat/Assistant consumer | Consume canonical Job state |
| Recovery controls | existing job control UI | Add authorized cancel/retry/unknown states |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Job status view | existing monitor component | display state/evidence | workerJobs router |
| Event timeline | existing/adjacent task component | ordered events | Job event projection |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton with no false progress | focused React test |
| empty | no jobs copy and safe action | jsdom test |
| error | retry/readiness explanation | router/UI test |
| success | terminal evidence/artifact | integration test |
| partial/unknown | explicit reconciliation state | reconnect test |
| disabled/focus/hover | policy-aware controls | a11y/browser test |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | stacked status/actions | browser screenshot |
| tablet 768x1024 | two-column detail where space allows | browser screenshot |
| desktop 1440x900 | timeline and evidence side by side | browser screenshot |

### Accessibility Acceptance
Keyboard path, visible focus, semantic status/live regions, labels, contrast and reduced-motion-safe updates are required.

### Copy Contract
Thai/English copy distinguishes queued, running, waiting, failed, canceled, completed and unknown; no spinner implies completion; localization fallback is deterministic.

### Browser Evidence Required
Capture admission, reconnect, cancel and terminal-result flows using the project browser-verification procedure.

## TDD steps

1. Add projection/route/UI tests for loading, unknown, reconnect and terminal states.
2. Implement projections/adapters and reuse current components.
3. Run focused tests and browser checks where available.

