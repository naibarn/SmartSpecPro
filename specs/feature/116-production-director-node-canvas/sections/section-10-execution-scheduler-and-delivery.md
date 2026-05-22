# Section 10: Execution Scheduler and Delivery Outputs

## Goal

Define how approved shots and nodes execute after planning, while keeping credit reservation, progress, retries, cancellation, and downstream delivery predictable.

## Execution Levels

Execution can happen at several levels:

- configure only,
- generate one node,
- run one shot,
- run selected shots,
- run approved batch,
- handoff only,
- final render/export.

The scheduler must respect graph dependencies and shot order.

## Node Lifecycle

Executable nodes should use a consistent lifecycle:

- `draft`
- `needs_config`
- `ready`
- `queued`
- `reserving_credits`
- `running`
- `completed`
- `qa_running`
- `qa_passed`
- `qa_warning`
- `needs_revision`
- `failed`
- `cancelled`

The parent shot status should derive from child nodes and QA gates.

## Credit Reservation Rules

Provider-generation credits may be reserved only when:

- node config snapshot exists,
- node readiness passes,
- parent shot is approved or execution policy permits selected-shot run,
- upstream required outputs exist,
- verifier has no blocking issue,
- user confirms spend for the node/shot/batch,
- idempotency key is available.

Planning, verification, layout editing, shot editing, and `Save to Node` must not reserve provider-generation credits.

## Scheduling Rules

Scheduler should:

- execute independent child nodes in parallel where safe,
- preserve required order for script/audio/video dependencies,
- stop a shot when a required node fails,
- continue independent shots if policy permits,
- support cancellation at node, shot, and batch level,
- support retry from last failed node,
- avoid rerunning completed nodes unless config changed or user requests rerun.

## Integration With Existing Media Generation And Credits

`scheduleProductionExecution` must be a coordinator over existing media generation paths, not a parallel provider submission stack.

Canonical integration points:

- `apps/web/server/services/mediaGenerationService.ts` remains the provider execution boundary for image/video/audio generation.
- `apps/web/server/routers/media.ts` remains the reference for credit checks, async task creation, reserved-credit metadata, cancellation/status behavior, and post-completion reconciliation.
- Production execution service should live in `productionExecutionSchedulerService` and call a small adapter layer that prepares the same normalized inputs expected by existing media generation services.
- Production must attach `originSurface: "media_studio"` plus Production metadata such as `productionRunId`, `spaceVersion`, `shotId`, `nodeId`, `configSnapshotId`, `actionAttemptId`, `idempotencyKey`, and reserved-credit fields to created media tasks.
- The scheduler records an action attempt before dispatch, transitions it to `reserving_credits`, then `running` only after credit reservation and provider submission/task creation succeed.

Credit contract:

- `hasEnoughCredits` is advisory before user confirmation.
- `deductCredits` / existing reservation-style metadata is used only after readiness passes and the user confirms spend.
- If provider submission fails after credit deduction, the scheduler must call the same refund path/pattern used by existing media routes.
- Terminal failed/cancelled tasks must trigger refund or reconciliation according to existing media task rules.
- Actual-cost reconciliation must preserve the current post-completion refund/charge-capping behavior where media routes already implement it.
- Planning, verifier, preview handoff, `Save to Node`, and fixture rendering must never call credit deduction.

Polling/status contract:

- Production node status derives from existing media task status where possible: pending/processing/completed/failed/cancelled.
- Provider task IDs are stored as refs, but normal UI shows friendly progress labels.
- Production polling must not poll providers directly when existing task/status polling can supply status.
- If a provider-specific poller is needed later, it must be added behind a separate execution flag and reuse existing media task reconciliation.

Cancellation and retry contract:

- `cancelProductionExecution` maps node/shot/batch cancellation to existing cancellable media tasks where available and records skipped/non-cancellable tasks explicitly.
- Cancellation is idempotent and scoped. Cancelling one node must not cancel sibling nodes unless they depend on it.
- Retry uses the same `ProductionActionAttempt` idempotency family but a new attempt ID; unchanged completed nodes are reused unless the user requests rerun.
- Retry from a failed required node rechecks current readiness, credit estimate, feature flags, and expected versions before dispatch.

Required tests:

- run-one-node uses existing media generation adapter and records Production metadata on the task;
- credit deduction happens only after readiness and confirmation;
- submission failure refunds reserved credits;
- terminal failed/cancelled task reconciles unused credits;
- cancellation is idempotent and scoped to node/shot/batch;
- retry does not rerun unchanged completed nodes;
- provider polling/status updates attach outputs back to the correct node only.

## Progress and Observability

UI should show:

- per-node status,
- per-shot status,
- batch progress,
- credit reserved/spent/refunded,
- current provider task IDs,
- last error and retry action,
- QA status,
- downstream handoff status.

Server should record action attempts for:

- configure,
- generate,
- QA,
- handoff,
- render/export.

## Captions, Subtitles, and Delivery Variants

Production-grade video output often needs captions and platform variants.

Add support for:

- `caption_subtitle` node,
- transcript source from script or speech-to-text,
- SRT/VTT export,
- burn-in subtitle metadata for Video Edit,
- localized subtitle variants,
- platform delivery variant nodes such as TikTok, Shopee, Reels, YouTube Shorts, landscape YouTube, square ad.

Delivery variants should reference the same approved shots but can override:

- aspect ratio,
- duration trims,
- caption style,
- language/subtitle track,
- CTA/end card,
- safe-area layout.

## Storyboard Review and Video Edit Handoff Contract

Handoff payload should include:

- productionRunId,
- spaceVersion,
- ordered shots,
- shot metadata,
- child node output refs,
- video clip refs,
- audio refs,
- caption/subtitle refs,
- product/claim evidence refs,
- QA summaries,
- missing/blocked warnings,
- variant instructions,
- source idempotency key.

Handoff should be idempotent and should open the existing downstream project when repeated.

### Handoff Builder Architecture

Use a shared pure TypeScript mapper as the canonical handoff builder:

- create `apps/web/shared/productionHandoffBuilders.ts` or an equivalent shared, server-safe module with no React/browser imports;
- server services call the shared builder before inserting Storyboard Review tasks or Video Editor projects;
- client UI may call the same builder for preview/snapshot display only;
- existing `apps/web/client/src/lib/storyboardVideoProject.ts` remains the current client-side Video Editor project helper until a shared builder can replace or wrap its pure mapping pieces;
- do not import client React modules into server routers/services.

Server-side handoff rules:

- Storyboard Review and Video Edit live handoff are performed by `productionHandoffProjectionService`, not by UI-only conversion code.
- Video Edit handoff must create/update existing `videoEditorProjects` through server-safe project payloads compatible with the existing Video Editor contract.
- If richer conversion behavior exists only in `storyboardVideoProject.ts`, first extract the pure mapping into a shared module and add compatibility tests before server live handoff is enabled.
- Incomplete-media behavior must be explicit: either create non-renderable placeholders the editor can display safely or disable `Open in Video Edit` until usable media refs exist.
- Never use provider task IDs as clip URLs.

Typed payloads must be explicit and versioned:

```ts
interface ProductionStoryboardReviewHandoffPayload {
  schemaVersion: string;
  productionRunId: string;
  sourceSpaceVersion: number;
  idempotencyKey: string;
  orderedShots: Array<Record<string, unknown>>;
  clipRefs: Array<Record<string, unknown>>;
  audioRefs: Array<Record<string, unknown>>;
  captionRefs: Array<Record<string, unknown>>;
  cueSheet: Record<string, unknown>;
  productEvidenceManifests: Array<Record<string, unknown>>;
  qaSummary: Record<string, unknown>;
  warnings: Array<Record<string, unknown>>;
}

interface ProductionVideoEditHandoffPayload extends ProductionStoryboardReviewHandoffPayload {
  timeline: Record<string, unknown>;
  transitions: Array<Record<string, unknown>>;
  deliveryVariants: Array<Record<string, unknown>>;
}
```

Handoff result shape:

- `created`: new downstream project/task was created.
- `existing`: matching downstream project/task already exists and should be opened.
- `disabled`: target is disabled by feature flag or missing dependency.
- `conflict`: source space changed and user must revalidate before handoff.
- `failed`: unexpected error with retry-safe idempotency key.

Live handoff must remain disabled until Section 14 operational gates are implemented. Before that, builders can be used for snapshot tests and preview payloads only.

## UI/UX Contract: Handoff and Execution

### Target User / JTBD

- Role: creator/operator deciding whether to preview, hand off, or generate approved work.
- Goal: understand what is safe to do now, what costs credits, what is disabled by flags/readiness, and where the resulting output will appear.
- Entry point: approved Production plan, handoff nodes, execution action rail, Storyboard Review/Video Edit preview, run-one-node/run-one-shot confirmation.
- Success outcome: user can preview handoff payloads without mutation, confirm credit-spending generation only after readiness, follow progress, cancel/retry safely, and recover from failures.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Handoff action rail | Production Workspace / node drawer | Preview package, disabled live handoff reason, create/open downstream target when enabled. |
| Handoff preview dialog | `ProductionHandoffPreviewDialog.tsx` or equivalent | Shows ordered shots, refs, product manifests, warnings, and target availability. |
| Execution confirmation dialog | `ProductionExecutionConfirmDialog.tsx` | Shows scope, readiness, credit estimate, refund rules, and idempotency/attempt summary. |
| Execution progress panel | `ProductionExecutionProgress.tsx` | Node/shot/batch status, credits reserved/spent/refunded, cancel/retry, provider-friendly status. |
| Failure recovery panel | `ProductionExecutionFailurePanel.tsx` | Retry from failed node, cancel remaining, repair missing refs, view safe debug summary. |

### Component Map

| Component | Owns | Consumes | Must expose |
| --- | --- | --- | --- |
| `ProductionHandoffPreviewDialog` | preview-only target package | shared handoff builder output, flags, verifier state | no live mutation when disabled, clear target state. |
| `ProductionExecutionConfirmDialog` | spend confirmation | readiness, credit estimate, selected scope, policy | explicit credit confirmation and cancellation before dispatch. |
| `ProductionExecutionProgress` | live attempt state | action attempts, media task refs, credit/refund status | friendly lifecycle labels and cancel/retry affordances. |
| `ProductionExecutionFailurePanel` | recoverable failure copy | last error, failed node/shot, retry eligibility | next action without stack traces or raw provider payloads. |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| preview-only handoff | `Preview handoff package`; live handoff button disabled with reason. | UI/browser test. |
| target disabled | Disabled target copy names the flag/dependency in user terms and offers export/copy-safe-preview where allowed. | Flag truth-table test. |
| ready to execute | Confirmation dialog shows scope, credit estimate, readiness summary, and generated-output destination. | E2E journey. |
| reserving credits | Progress state says credits are being confirmed and no provider status is shown yet. | Scheduler/UI test. |
| running | Node/shot progress shows friendly labels and cancel where supported. | Browser progress fixture. |
| partial failure | Completed independent outputs remain attached; failed required node shows retry/cancel path. | Scheduler/UI test. |
| cancelled | Completed outputs remain visible; cancelled/skipped tasks are explicit. | Cancel test. |
| permission denied | Read-only preview, no live handoff/execution. | Security/UI test. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| 390x844 | Handoff/execute actions collapse into a bottom-safe action sheet; confirmation/progress dialogs are full-screen and scrollable. | Mobile screenshot. |
| 768x1024 | Preview/progress panels can occupy side sheet or modal without covering blocker list. | Tablet screenshot. |
| 1280x800 | Action rail, preview summary, and progress timeline fit with no overlap. | Laptop screenshot. |
| 1440x900 | Full preview can show ordered shots, manifests, warnings, and target status together. | Desktop screenshot. |

### Accessibility Acceptance

- Preview, confirmation, progress, and failure dialogs trap focus and return focus to the invoking handoff/execution control.
- Credit-spending actions require an explicit button label such as `Generate approved outputs`; do not use ambiguous `Run` for spend confirmation.
- Progress changes must announce politely and must not move focus unexpectedly.
- Cancellation and retry controls must be keyboard reachable and confirm destructive scope where needed.
- Provider task IDs may appear only in debug details; normal UI shows friendly lifecycle labels from Section 01.

### Browser Evidence Required

- Evidence must include preview-only handoff, disabled Storyboard Review handoff, disabled Video Edit handoff, run-one-node confirmation, no-credit-spend before confirmation, running/progress fixture, failure/retry fixture, cancellation fixture, and permission denied states.

## Acceptance

- Running one shot executes only its ready child node graph in dependency order.
- Batch execution does not rerun completed unchanged nodes.
- Cancelling a batch leaves completed outputs attached to nodes.
- Credits are never reserved during planning/config-only flows.
- Caption/subtitle nodes can attach SRT/VTT or burn-in metadata to Video Edit handoff.
- Delivery variants preserve shot order while allowing platform-specific overrides.
- Storyboard Review and Video Edit handoff are idempotent.
- Server and client preview use the same shared handoff builder fixtures.
- Video Edit live handoff does not depend on importing React/client-only modules into server code.
