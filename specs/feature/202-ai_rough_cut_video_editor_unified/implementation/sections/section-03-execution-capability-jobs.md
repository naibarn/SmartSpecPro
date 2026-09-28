# Section 03 — Execution admission, capability, and job visibility

## Goal

Project the canonical worker/control-plane lifecycle in the editor and
`/worker-jobs`, distinguishing waiting for an executor from unsupported
capability and from degraded evidence.

## Ownership paths

- Add: `apps/web/client/src/components/videoeditor/ui/executionStatusUi.ts`
- Add: `apps/web/client/src/components/videoeditor/EditorJobStatusPanel.tsx`
- Modify: `VideoEditorPhase3.tsx`, `RenderJobsPage.tsx`
- Inspect/modify only when required by existing contract: worker job status
  projection types/router response
- Tests: execution mapper, job page, Phase3 handoff, and mobile card tests

## Design

Map server status, `statusReason`, capability result, runtime/worker identity,
pinned revision/snapshot, progress events, QC state, and output commit state
into a display model. Unknown future values must remain visible as safe fallback
labels rather than silently becoming completed.

At submit, keep the user in the editor or show an editor-aware status panel
before allowing navigation to the detailed queue page. The panel shows job ID,
pinned revision, runtime/agent, reason-first status, progress, cancel/retry when
allowed, review output, and return-to-editor action.

Extend `RenderJobsPage` filters, badges, cards, and details for admitted,
waiting-agent, capability-blocked, claimed, running, retrying, degraded,
rendering, uploading, QC, completed, failed, canceled, expired, and stale.
Use the server's action permissions; do not force a worker or infer readiness.

Output links remain gated by verified artifact/Library commit. A result without
required commit is partial/incomplete, not success. Any existing direct link to
retired `/workpacks` must be removed or replaced only with an allowed source
route; do not expand the retired system.

## TDD checklist

- All known states/reasons map to correct copy/badge/icon/actions.
- `waiting-agent` and `capability-blocked` are distinct in editor and job page.
- Capability-blocked/degraded cannot render approved/completed UI.
- Revision/snapshot/runtime identity stays visible after later project edits.
- Cancel/retry pending/race/error behavior is safe and idempotent.
- Mobile card keeps reason and primary action visible.
- Verified output and QC commit gates control download/open actions.

## UI/UX Contract

### Target User / JTBD

- Role: creator who submits heavy editor work.
- Goal: know where work is, why it waits/blocks, and what to do next.
- Entry point: Submit to Worker in `/video-editor` or `/worker-jobs`.
- Success: no generic “processing” ambiguity and no false completion.

### Existing Pattern Reference

- Searched: `RenderJobsPage.tsx`, worker runtime status projections, and
  existing status/reason UI.
- Found: current list/detail polling, events, verified outputs, cancel action.
- Decision: reuse and extend; do not create a second job viewer.

### Surface Inventory

| Surface | File | Change |
|---|---|---|
| Worker panel/banner | Phase3 | Status/reason/revision/action projection |
| Job list filters/cards | RenderJobsPage | New lifecycle labels and mobile hierarchy |
| Job detail | RenderJobsPage | Capability/runtime/QC/output gating |
| Status mapper | New UI module | Shared display contract |

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Execution status mapper | `ui/executionStatusUi.ts` | status/reason/action projection | job/capability/QC data |
| EditorJobStatusPanel | `EditorJobStatusPanel.tsx` | in-editor lifecycle/actions | mapper + job query |

## Implementation result

Implemented reason-first lifecycle projection, in-editor polling/cancel/deep
link panel, expanded Worker Jobs filters/status badges/cards/detail context,
and verified-output gating. Waiting for a Worker, missing capability, retry,
degraded/QC/stale, and terminal states remain distinct. Submission stays in the
editor; queue navigation is explicit. Output links require terminal status,
artifact refs, accepted verification state, and no QC/stale/blocking reason.

Focused proof: `executionStatusUi.test.ts`, Worker/editor handoff tests, the
full focused regression matrix, and targeted Render Jobs esbuild passed.
| Worker handoff shell | `VideoEditorPhase3.tsx` | submit/navigation composition | submit mutation + panel |
| Job list/detail | `RenderJobsPage.tsx` | polling/filter/detail/output | workerJobs procedures |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| admitted/queued | accepted request + pinned revision | mapper test |
| waiting-agent | reason + timeout/retry guidance | mapper/browser |
| capability-blocked | blocking reason + route alternative | mapper/browser |
| running/retrying | phase/progress + cancel | component test |
| degraded | limitation + review-only semantics | component test |
| QC | severity/progress and output gate | integration test |
| completed | verified artifact + next action | integration test |
| failed/canceled/stale | reason + safe recovery | integration/browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | reason-first job cards and reachable cancel/retry/review | Playwright |
| tablet 768x1024 | list/detail stack without hidden status | Playwright |
| desktop 1440x900 | list/detail and filters remain readable | Playwright |
| small-mobile 360x800 | status reason wraps safely | Playwright |
| laptop 1024x768 | detail scrolls independently | Playwright |
| wide-desktop 1280x800 | job table/detail do not overlap | Playwright |

### Accessibility Acceptance

- Status is conveyed by text/icon and semantic badge, not color alone.
- Progress/status changes use labelled live regions without polling spam.
- Cancel/retry/review actions expose disabled/pending reason.
- Job rows/cards are keyboard-selectable with selected state announced.

### Copy Contract

- Use explicit Thai labels for “รอ execution agent”, “ความสามารถไม่พร้อม”,
  “ผลลัพธ์บางส่วน”, “กำลังตรวจ QC”, and “พร้อมเปิดผลลัพธ์”.
- Never say “สำเร็จ” before artifact/QC/commit gates are satisfied.
- Keep runtime, worker, job, revision, and capability identifiers inspectable.

### Browser Evidence Required

Capture every lifecycle fixture in editor and job detail at mobile/tablet/
desktop, including console, focus, status reason, and verified output gating.

## Exit criteria

The worker flow is truthful and actionable from submit through terminal output;
unsupported capabilities and unavailable agents cannot be mistaken for a
completed or Windows-parity run.
