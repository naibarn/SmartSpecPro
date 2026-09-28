# Section 08 — safe UI and checkpoint review workflow

## Purpose and scope

This section exposes the durable server state from Sections 02–07 without making
the browser an authority. The user must be able to inspect the story, exact
per-shot prompts, generated images, video prompts, generated videos, audio plan,
and final assembly;
approve/reject/edit safely; see estimated next-stage credits; and reload without
auto-approval or duplicate operations.

Dependencies: Sections 01–07. The existing visual patterns are already known;
this section reuses them and adds only the durable checkpoint/hash/cost evidence
needed by Feature 141.

## Tests first

Write component and browser tests before UI implementation:

- safe summary/heavy projections contain no internal markers, raw errors,
  provider IDs, storage keys, or signed URLs;
- story, image-prompt, image-result, video-prompt, video-result, audio, and
  final-assembly cards render the correct awaiting/approved/rejected/superseded/stale/pending/
  error states;
- only the relevant action is disabled while its operation is pending;
- approval actions submit revision/hash/state digest/idempotency and render the
  returned operation status rather than assuming success;
- timeout/reload/refetch resumes persisted state without auto-approval or a
  duplicate operation;
- bulk approval is atomic and identifies the stale shot without releasing any
  provider work;
- keyboard/focus/live-region/accessible-name tests cover every action;
- responsive/browser evidence covers 390x844, 768x1024, 1440x900 and extended
  360x800, 1024x768, 1280x800 with no unintended overflow or console errors;
- legacy 3x3/start-stop and current legacy plan-review surfaces retain their
  existing display and copy behavior.

Suggested locations:

- `apps/web/client/src/components/marketplaceCapture/__tests__/StagedCheckpointReviewPanel.test.tsx`;
- `apps/web/client/src/pages/__tests__/MarketplaceAutoReviewWorkflowPage.wiring.test.ts`;
- `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.autoReviewPolling.test.ts`;
- `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.planReviewGate.test.ts`;
- browser evidence under the deep-implement UI evidence path.

## Implementation contract

### Files and ownership

- `apps/web/client/src/components/marketplaceCapture/StagedCheckpointReviewPanel.tsx`
  owns story, prompt, image-result, video-result, audio, and final checkpoint
  presentation and typed actions;
- `apps/web/client/src/components/marketplaceCapture/StagedCheckpointReviewSurface.tsx`
  owns polling, mutation wiring, state-digest/idempotency handling, and refetch;
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` is limited to
  product context, selected scope, job history, and the Job Setup entry point;
- `apps/web/client/src/pages/MarketplaceAutoReviewWorkflowPage.tsx` owns the
  dedicated Job Workbench route and stop/resume/output handoff controls;
- `apps/web/client/src/pages/StoryboardReviewPage.tsx` remains the downstream
  creative review/editor surface and links back to Workbench for checkpoint
  changes;
- existing Video Editor/render handoff surfaces display final assembly summary;
- server safe serializers in
  `apps/web/server/services/marketplaceAutoReviewService.ts` and shared staged
  contracts define the projection boundary.

### Data and action contract

Fetch a typed summary for run lists and heavy checkpoint detail only while the
authorized v2 run is held at a review state, preserving the current page's
polling/cache behavior. Every mutation carries run ID, checkpoint/shot scope,
expected revision, state digest, and idempotency key. Display operation IDs and
poll persisted status after timeout/reconnect.

Each checkpoint card shows:

- checkpoint kind and shot number;
- current state, revision, and a bounded hash indicator;
- exact prompt/transcript/assembly artifact appropriate to the checkpoint;
- reference roles/attachments, model/provider summary, warnings, and estimated
  next-stage credits;
- approve, reject/request correction, edit, accept, regenerate, or refresh
  action according to its state.

Do not expose internal prompt directives, provider IDs, signed URLs, raw provider
HTML, or hidden metadata. The UI may display a safe hash indicator, not a secret
storage key. Never auto-approve after reload, focus, hover, or a successful
previous operation.

Use Thai-first copy that explicitly communicates the spend boundary, including:
`ตรวจเนื้อเรื่อง`, `ตรวจ Prompt ช็อตที่ N`, `ยืนยันสร้างภาพ`, `ตรวจผลภาพ`,
`ยืนยัน Prompt วิดีโอ`, `ตรวจผลวิดีโอ`, `ยืนยันเสียง`, `ตรวจและยืนยันการประกอบ`, and
`ยังไม่ใช้เครดิตขั้นถัดไป`.

## UI/UX Contract

### Target User / JTBD

- Role: Marketplace seller/operator creating an automated product-review video.
- Goal: inspect the story and every expensive downstream artifact before releasing
  the next credit-bearing stage.
- Entry point: Marketplace product-detail Auto Review run card and Storyboard
  Review surface.
- Success outcome: approve one shot safely, understand the next estimated cost,
  reject/regenerate locally, and resume correctly after reload.

### Existing Pattern Reference

- Searched with targeted `rg` because SocratiCode was unavailable: `AutoReviewPlanReviewPanel`,
  `SequentialShotReviewSection`, `SequentialShotEditorCard`, `StoryboardReviewPage`,
  and `StoryboardBatchReviewDialog` under `apps/web/client/src/`.
- Found patterns: current Marketplace plan-review panel, sequential shot review
  cards/editor, Storyboard Review acceptance/regeneration, and existing page
  polling/cache lifecycle.
- Decision: reuse.
- Reason: these surfaces already encode the product's review, shot-local
  acceptance, responsive, and legacy compatibility patterns. Divergence is
  limited to durable checkpoint status, exact prompt, revision/hash, and cost
  evidence absent from the legacy gate.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Product detail | `MarketplaceCaptureProductDetail.tsx` | Product facts, selected scope, job history, and link to Job Setup; no review execution surface. |
| Job Setup | `/marketplace/auto-review/new/:productId` | Select product scope and create a staged Job Workbench run. |
| Job Workbench | `/marketplace/auto-review/:runId`, `StagedCheckpointReviewSurface` | Story, shot-local prompt/result, audio, final checkpoints; pause, approve, reject, edit, retry, cancel. |
| Storyboard Review | `StoryboardReviewPage.tsx` | Downstream creative review; link back to Workbench for durable checkpoint repair. |
| Final handoff | Existing Video Editor/render surfaces | Final assembly review before paid work. |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Checkpoint service | server service | Transitions, guards, idempotency | Durable run/stage/attempt/artifact state. |
| Router procedures | `marketplaceCapture.ts` | Auth/input/operation envelope | Checkpoint service. |
| Workbench panel | `StagedCheckpointReviewPanel.tsx` | Story, image/video prompt/result, audio, final actions | Typed safe projection and mutation status. |
| Workbench surface | `StagedCheckpointReviewSurface.tsx` | Polling/cache, mutation wiring, stale-digest recovery | Staged checkpoint procedures. |
| Product detail | `MarketplaceCaptureProductDetail.tsx` | Product summary and job navigation only | Product/job summary query. |
| Worker handlers | server service | Pre-provider recheck/enqueue | Durable checkpoint/attempt evidence. |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | Skeleton, no provider action enabled | Component/browser test. |
| empty | Safe explanation and refresh/cancel guidance | Component test. |
| awaiting | Exact review artifact, cost, approve/reject/edit | Checkpoint integration/UI test. |
| success/approved | Approved revision/hash and next-stage status | Mutation/reload test. |
| partial success | Approved shots progress; rejected/pending shots stay actionable | Shot-local integration test. |
| error/stale | Safe reason, refetch/correction action, no spend action | Stale/error test. |
| disabled/pending | Only current operation action disabled | Pending/reload test. |
| selected/hover/focus | Visible selection/focus, no approval by hover | Keyboard/browser evidence. |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | One shot/checkpoint per row; bounded prompt text scroll; action remains reachable. | Browser screenshot/manual check. |
| tablet 768x1024 | Two-column prompt/reference layout where possible; no horizontal overflow. | Browser screenshot/manual check. |
| desktop 1440x900 | Side-by-side evidence/cost and dense shot review; sticky action area. | Browser screenshot/manual check. |
| small-mobile 360x800 (extended) | Long Thai copy and prompt controls remain usable. | Screenshot/manual check. |
| laptop 1024x768 (extended) | Panel/table transition remains readable. | Screenshot/manual check. |
| wide-desktop 1280x800 (extended) | Dense review table does not clip cost/state/actions. | Screenshot/manual check. |

### Accessibility Acceptance

- Keyboard path moves story/shot content to approve, reject, edit, accept,
  regenerate, and refresh in logical order.
- Every action has an accessible Thai label containing shot number, checkpoint
  kind, and current state/cost where relevant.
- Focus is visible; modal/drawer focus is trapped and returned to the invoking
  control after close.
- Semantic headings/table/card structure and live announcements cover queued,
  stale, approved, rejected, and safe error transitions; status is not color-only.
- Contrast and readable Thai text remain valid in existing light/dark surfaces;
  reduced motion disables nonessential polling/transition animation.

### Copy Contract

- Tone: Thai-first, direct, reassuring about what credit is still locked.
- Primary language: Thai; English reason-code fallback is allowed for operations
  or missing translations.
- Required labels: the seven labels listed in the data/action contract above.
- Validation/error copy: safe missing/stale/consumed/invalidated reason codes,
  never raw provider HTML/error bodies.
- Loading copy says the system is preparing a reviewable artifact, not that a
  provider task is already approved.

### Browser Evidence Required

Follow `skills/orchestra/references/ui-browser-verification.md`. Record the
canonical and extended viewport evidence, console-error scan, overflow check,
keyboard/focus path, accessible names, and all checkpoint loading/error/disabled
states. If browser tooling is unavailable, record the check as skipped with the
blocker; never mark it as passed.

## Acceptance criteria

- The UI exposes every mandatory checkpoint, including per-shot video-result
  acceptance/rejection, and never claims approval based only
  on local state.
- Users can inspect the exact next paid artifact and estimated cost before action.
- Stale/duplicate/timeout behavior is understandable and recoverable.
- Legacy 3x3/start-stop and legacy plan-review UI remain compatible.
- Required responsive/accessibility/browser evidence is captured or explicitly
  recorded as skipped.

## Handoff

Section 09 consumes UI evidence, operation/credit telemetry, and rollout flags.
No UI action may bypass Section 03's server guard.

## Implementation record

Added `StagedCheckpointReviewPanel` and moved its mutation/polling ownership into
`StagedCheckpointReviewSurface`. Product Detail is now a product/history entry
point, `/marketplace/auto-review/new/:productId` is the setup-only entry, and
`/marketplace/auto-review/:runId` is the dedicated Job Workbench for
story/Prompt/image/video/audio/final checkpoints. Storyboard Review remains the
downstream creative handoff after the job output is ready. The workbench shows
job/product context, current stage, checkpoint progress, next action, safe
output links, exact per-shot prompts, accepted image/video previews,
audio/final assembly summaries, credit estimates, and explicit Thai
approval/rejection/edit/retry actions. All mutations carry the server state
digest and idempotency key; the client never treats local button state as
approval.

Proof: `StagedCheckpointReviewPanel.test.tsx` (6),
`MarketplaceAutoReviewWorkflowPage.wiring.test.ts` (2), Product Detail polling
and plan-review regression tests, and staged server operation/pipeline tests
passed in the focused batch (56 tests). Browser/viewport/focus evidence is not
claimed here because browser tooling was unavailable in this runtime; it remains
a Section 09 rollout blocker.
