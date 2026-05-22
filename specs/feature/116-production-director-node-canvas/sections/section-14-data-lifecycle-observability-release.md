# Section 14: Data Lifecycle, Observability, and Release Readiness

## Goal

Define how Production Director projects, node configs, generated outputs, audit records, metrics, and user-facing accessibility/i18n behave after the feature ships.

This closes the gap between a working planning canvas and a production-ready system that can be operated, debugged, exported, archived, and safely rolled back.

## Project Lifecycle

ProductionSpace should support these user-visible states:

- draft,
- planning,
- ready_for_review,
- approved,
- generating,
- completed,
- archived,
- deleted/tombstoned,
- failed.

Required project actions:

- save,
- duplicate,
- archive,
- restore from archive,
- delete draft,
- export,
- open latest,
- restore previous version,
- cancel running execution.

Delete behavior must be explicit:

- draft delete can tombstone the ProductionSpace and detach generated draft refs;
- completed project delete should use soft delete/tombstone first;
- generated media/library assets should not be physically deleted unless the user explicitly deletes those assets and permissions allow it;
- audit-safe metadata should remain where required for credit/accounting/security.

## Retention and Storage References

ProductionSpace records should not rely only on volatile public URLs.

Output refs should preserve:

- storage key,
- library item ID,
- media task ID,
- provider task ID,
- public URL if available,
- thumbnail URL if available,
- config hash,
- generated-at timestamp.

Retention rules:

- project metadata remains until user/admin deletion policy removes it;
- generated output asset retention follows existing library/media retention policy;
- stale public URLs should be refreshable or relinkable through storage/library metadata;
- deleted upstream assets should show missing/relink warnings rather than crashing the canvas.

## Export Contract

Users should be able to export a Production Project package containing:

- ProductionBrief,
- ProductionSpace version,
- ordered shots,
- node graph,
- node configs,
- cue sheet/timeline,
- scripts/captions,
- output manifest,
- product evidence manifest,
- provider/task references,
- warnings and QA summaries.

The export should avoid embedding secrets, raw provider keys, or private signed URLs. Use safe manifests and resolvable library/storage references.

## UI/UX Contract: Export, Archive, Restore, Delete

### Target User / JTBD

- Role: creator/operator or admin managing completed or in-progress Production projects.
- Goal: export a safe package, archive/restore old work, delete drafts safely, and understand what will or will not happen to generated assets.
- Entry point: Project header menu, project search/open list, completed project summary, archive/export action rail.
- Success outcome: user can manage lifecycle actions with confidence, permissions, audit-safe feedback, and no accidental deletion of generated media assets.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Project header lifecycle menu | `ProductionProjectHeader.tsx` | Archive, restore, export, delete draft, duplicate, restore previous version. |
| Export dialog | `ProductionProjectExportDialog.tsx` or equivalent | Shows included sections, excluded secrets/private URLs, target format, and safe manifest preview. |
| Archive/restore confirmation | Production project dialogs | Explains visibility, reversibility, generated asset behavior, and audit record. |
| Delete draft confirmation | Production project dialogs | Confirms tombstone behavior and generated asset retention. |
| Lifecycle result toast/panel | shared Production workspace | Shows success/failure with audit ref and next action. |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| export ready | Dialog lists included manifest parts and excluded sensitive data. | UI test and export shape test. |
| export success | Success copy says secrets and private URLs were excluded and provides audit ref. | Browser evidence. |
| export failed | Retry-safe failure message with no raw stack trace. | Negative test. |
| archived | Project is read-only or hidden from default list with restore action where permitted. | Lifecycle UI test. |
| restore conflict | Shows current/latest version conflict and safe restore choices. | Conflict test. |
| delete draft | Confirmation explains tombstone and generated asset retention. | Permission/destructive confirmation test. |
| permission denied | Lifecycle actions hidden or disabled with request-access copy. | Security/UI test. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| 390x844 | Lifecycle menu opens as action sheet; export manifest preview scrolls without horizontal overflow. | Mobile screenshot. |
| 768x1024 | Dialogs remain readable with fixed action footer. | Tablet screenshot. |
| 1280x800 | Header menu, export preview, and warnings fit without clipping. | Laptop screenshot. |
| 1440x900 | Export preview can show manifest summary, excluded-data warning, and audit details together. | Desktop screenshot. |

### Accessibility Acceptance

- Lifecycle menu, confirmations, and export dialog are keyboard reachable and focus-trapped while open.
- Destructive actions must require explicit confirmation and describe impact on ProductionSpace vs generated media/library assets.
- Export preview uses readable tables/lists, not raw JSON as the only normal-mode view.
- Result toasts/panels expose role/status text and do not disappear before screen-reader users can consume the result.

### Browser Evidence Required

- Evidence must include export-ready, export-success, archive, restore, delete-draft, permission-denied, and export-failure states across required viewports where practical.

## Audit Events

Add audit events for:

- production_project_created,
- production_project_updated,
- production_project_archived,
- production_project_deleted,
- production_space_version_restored,
- production_planner_run_started,
- production_planner_run_completed,
- production_verifier_blocked,
- production_node_config_saved,
- production_node_generated,
- production_shot_generated,
- production_batch_started,
- production_batch_cancelled,
- production_handoff_created,
- production_credit_reserved,
- production_credit_refunded.

Audit metadata should include safe IDs and counts, not full prompts or raw product evidence unless the existing audit policy explicitly permits it.

Minimum audit payload shape:

```ts
interface ProductionAuditEventPayload {
  productionRunId: string;
  productionSpaceVersion?: number;
  shotId?: string;
  nodeId?: string;
  actionAttemptId?: string;
  surface?: string;
  status?: "started" | "succeeded" | "failed" | "blocked" | "cancelled";
  warningCodes?: string[];
  counts?: Record<string, number>;
  safeRefIds?: string[];
}
```

Audit payloads must exclude raw prompts, raw marketplace text, raw OCR, full review/comment text, private signed URLs, provider keys, and raw provider payloads unless a stricter existing audit policy explicitly permits them.

## Metrics and Alerts

Track:

- planner success/failure rate,
- verifier block rate,
- average shots per project,
- average nodes per shot,
- node config save conflicts,
- generation failure rate by node type/provider,
- credit reserved/spent/refunded,
- handoff success/failure rate,
- stale output URL count,
- project storage growth.

Alerts:

- repeated planner schema failures,
- high save conflict rate,
- high provider failure rate,
- credit reservation/refund mismatch,
- handoff failure spike,
- retention cleanup failure,
- storage growth anomaly.

Minimum alert thresholds should be configurable, but the release gate should include defaults for:

- repeated planner schema failures in a short window,
- save conflict rate above normal baseline,
- provider failure rate spike by provider/node type,
- credit reservation/refund mismatch,
- downstream handoff/import failure spike,
- stale output ref growth,
- storage growth anomaly.

## Admin and Kill Switches

Add feature flags or admin controls for:

- Production Space UI,
- Video Shot tab,
- live planner calls,
- live verifier calls,
- node config mode,
- run one node,
- run one shot,
- approved batch execution,
- Storyboard Review handoff,
- Video Edit handoff.

### Feature 116 Flag Truth Table

Use explicit flags or equivalent tenant-scoped controls. Existing F84-F90 flags can remain, but Feature 116 rollout must define these behaviors before implementation:

| Capability | Suggested flag/control | Off behavior | On behavior | Hard dependency |
| --- | --- | --- | --- | --- |
| Production Space UI | `mediaProductionDirectorEnabled` | Hide new workspace; preserve old Image/Video/Audio and read-compatible old runs. | Show Production workspace shell. | none |
| React Flow canvas preview | `mediaProductionGoalCanvasEnabled` | Show list/outline fallback only. | Show fixture/manual canvas preview. | Production Space UI |
| Video Shot tab | `mediaProductionVideoShotEnabled` | Hide tab; keep ordered shot list inside Production. | Enable dedicated Video Shot workspace. | Production Space UI |
| Node config mode | `mediaProductionNodeConfigEnabled` | Existing Image/Video/Audio tabs stay standalone; no `Save to Node`. | Enable Image/Video/basic TTS config mode. | Production Space UI, MVP adapters |
| Live planner | `mediaProductionStoryboardPlannerEnabled` | Fixture/manual planning only. | Enable planner skill calls. | capability registry, planner fixtures |
| Live verifier | `mediaProductionPlanVerifierEnabled` | Deterministic/fixture verification only. | Enable verifier skill calls. | verifier schema tests |
| Storyboard Review handoff | `mediaProductionStoryboardReviewHandoffEnabled` or narrowed `mediaProductionDualOutputEnabled` | Preview payload only; no downstream mutation. | Create/open Storyboard Review target. | operational gates, shared builder |
| Video Edit handoff | `mediaProductionVideoEditHandoffEnabled` or narrowed `mediaProductionDualOutputEnabled` | Preview payload only; no downstream mutation. | Create/open Video Edit project. | operational gates, shared builder |
| Run one node | `mediaProductionRunOneNodeEnabled` | Show readiness/estimate only. | Execute one ready node after confirmation. | node config mode, scheduler integration |
| Run one shot | `mediaProductionRunOneShotEnabled` | Disabled action with explanation. | Execute ready child graph for one shot. | run one node, scheduler tests |
| Approved batch execution | `mediaProductionLangGraphBatchEnabled` or `mediaProductionApprovedBatchEnabled` | Disabled action with explanation. | Execute approved batch. | run one shot, observability, cancellation |
| Emergency kill switch | tenant/admin kill switch | Fail closed for live calls and execution. | Normal flag rules apply. | none |

Flag precedence:

1. Emergency kill switch disables live planner, live verifier, node execution, batch execution, and live handoff regardless of other flags.
2. Production Space UI off hides new write UI but must preserve read-safe old run access where feasible.
3. Operational gates must pass before live planner, live handoff, run-one-node, run-one-shot, or batch execution can be enabled.
4. Dual-output/handoff flags must not imply provider-generation execution.
5. Execution flags must not imply planner/verifier flags.

Kill switches should fail closed:

- disabling live planner should still allow fixture/manual editing where safe;
- disabling execution should preserve read/edit access;
- disabling handoff should not delete existing projections;
- disabling Production Space should not break Image/Video/Audio standalone workflows.

Required tests:

- each flag off state renders the expected disabled/read-safe/fixture UI;
- emergency kill switch overrides all live and execution flags;
- enabling handoff does not enable provider execution;
- enabling run-one-node does not enable run-one-shot or batch execution;
- disabling Production Space does not break Image/Video/Audio, Gemini Omni suite, provider assets, Storyboard Review, or Video Edit.

## Accessibility and Keyboard Requirements

Canvas must not be the only way to use Production Director.

Required alternatives:

- shot list view,
- node list view,
- keyboard move/reorder controls,
- accessible node drawer,
- clear focus management when opening/closing tool surfaces,
- screen-reader labels for node status, readiness, warnings, and output refs,
- non-drag click-to-add asset flow,
- high-contrast warning/error states.

Keyboard must support:

- open selected node,
- open selected shot,
- save to node,
- return to Production,
- reorder shots,
- delete with confirmation,
- undo/redo where implemented.

## i18n Requirements

All user-facing labels must support Thai and English:

- node type labels,
- shot type labels,
- readiness states,
- error messages,
- conflict messages,
- audit-visible action labels,
- handoff labels,
- release/disabled feature messages.

Avoid showing raw enum names in normal UI.

## Acceptance

- User can archive and restore a Production Project.
- Export produces a safe manifest without secrets or raw signed URLs.
- Stale/missing output refs show repair/relink UI instead of crashing.
- Admin can disable live planner/execution without hiding existing projects.
- Metrics and audit events exist for planner, verifier, node config saves, execution, credits, and handoff.
- Audit payload schema tests prove unsafe raw marketplace/provider/prompt payloads are excluded.
- Metrics/alert configuration has safe defaults for planner failures, save conflicts, provider failures, credit mismatch, handoff failures, stale refs, and storage growth.
- Canvas functions have list/keyboard alternatives.
- Feature flag truth-table and kill-switch precedence tests pass.
- Thai and English labels exist for core Production, Shot, Node, and Handoff UI.
