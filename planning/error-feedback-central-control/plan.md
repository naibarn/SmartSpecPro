# Central Error Control + Error-to-Admin Feedback Pipeline

Date: 2026-07-09
Status: In progress

## Problem Statement

Error toasts appear ad-hoc at the bottom-right (sonner default). ~1,419 scattered
`toast.error(err.message)` call sites show raw technical messages. There is no
central place that:

1. Classifies errors as **system errors** (5xx, network, server bugs) vs
   **user-caused errors** (validation, 4xx) — users see raw internals for both.
2. Shows a user-friendly message for system errors.
3. Lets the user report a system error to admin with enough diagnostic data
   (traceId, tRPC path, http status, stack, URL, user agent, recent errors)
   that an admin can paste the bundle into an AI tool and analyze root cause.
4. Supports pasting multiple clipboard screenshots into the feedback dialog.
5. Lets admin view attached images fullscreen (lightbox).

## Current State (verified 2026-07-09)

- Toaster (sonner) mounted `apps/web/client/src/App.tsx:699`, no position prop → bottom-right.
- Global query/mutation error hooks already exist: cache subscriptions in
  `apps/web/client/src/main.tsx:455-469` (only console.error + auth redirect today).
- tRPC fetch wrapper `main.tsx:477-522` — does NOT read `X-Request-ID` response header.
- Server: `correlationIdMiddleware` sets `X-Request-ID` on every response
  (`server/middleware/correlationId.ts`), `traceContext.ts` has AsyncLocalStorage
  `getTraceId()`. tRPC init `server/_core/trpc.ts:7-9` has NO errorFormatter →
  client error payload lacks traceId.
- Feedback system EXISTS: `server/routers/feedback.ts` (submit accepts
  `contextJson` at :55 — unused by client), multer upload `/api/feedback/upload`
  (5MB/file, 5 files, jpg/jpeg/png/webp/pdf/md), tables `feedbackTickets` etc.
  (schema.ts:14471+), admin UI `pages/AdminFeedbackHub.tsx`, user widget
  `components/guardian/FeedbackButton.tsx` (mounted App.tsx:705), admin in-app
  notification fan-out via `feedbackProcessor.ts:126-167`.
- Clipboard-paste image pattern to copy: `components/editor/pasteHandlers.ts:19-90`.
- Lightbox pattern to copy: `pages/Gallery.tsx:631-764` (Radix Dialog).

## Design

### A. Server — traceId in tRPC error payload (small)
- Add `errorFormatter` in `server/_core/trpc.ts`: inject `traceId` (from
  `getTraceId()` fallback to ctx request id if available) into `shape.data`.
- No schema/migration needed.

### B. Client — central error controller (new)
- New file `client/src/lib/systemErrorMonitor.ts`:
  - `classifyTrpcError(error)` → `"system" | "user" | "auth"`.
    system = httpStatus >= 500, code INTERNAL_SERVER_ERROR/TIMEOUT, fetch/network
    failure, HTML-instead-of-JSON diagnostics. auth = UNAUTHORIZED (existing
    redirect handles it; monitor ignores). everything else = user.
  - Ring buffer (last 20) of `{ ts, path, code, httpStatus, message, traceId, url }`.
  - `buildDiagnosticsBundle(primaryError?)` → JSON-serializable object with app
    context (url, userAgent, viewport, language, appVersion/build if available,
    recent errors buffer) for `contextJson`.
  - Emits window CustomEvent `smartspec:report-error` with the bundle to open
    the feedback dialog pre-filled.
- `main.tsx`:
  - fetch wrapper: capture `X-Request-ID` per response and pass to monitor
    (map keyed so the failing call's traceId lands in the buffer; formatter
    from (A) is primary source, header is fallback).
  - Extend the existing query/mutation cache subscriptions: after auth-redirect
    check, call `systemErrorMonitor.handleError(error, path)`.
- On **system** error: show ONE friendly Thai toast (stable toast id
  `system-error` to prevent stacking), text like "ระบบขัดข้องชั่วคราว" +
  action button "แจ้งปัญหาให้ผู้ดูแล" → dispatches `smartspec:report-error`.
  Dedupe window ~10s per path. User-caused errors: no central toast
  (call sites already handle them).

### C. FeedbackButton — paste images + diagnostics
- Listen for `smartspec:report-error`: open dialog, preselect ticketType
  "bug", prefill title/description (friendly summary, Thai), stash diagnostics.
- On submit: send `contextJson` = diagnostics bundle (always include base app
  context even for manual feedback; include error details when opened from an
  error toast).
- Add `onPaste` on the dialog content: iterate `clipboardData.items`,
  `kind === "file" && type.startsWith("image/")` → make `File` with generated
  name `pasted-<n>.png` → existing `addFiles()`. Multiple pastes accumulate up
  to the existing 5-file limit; over-limit shows a friendly toast.
- Show a small note that diagnostic data will be attached (transparency).

### D. AdminFeedbackHub — lightbox + AI-ready bundle
- Replace `<a target="_blank">` image attachments with thumbnails opening a
  Radix Dialog lightbox (object-contain, ~95vw/92vh, prev/next when multiple
  images) — pattern from Gallery.tsx.
- Render `contextJson` in the detail pane: key facts (traceId, path, status,
  url, userAgent, time) + collapsible raw JSON.
- "Copy for AI" button: copies a markdown bundle (ticket title/description +
  full diagnostics JSON + attachment names) to clipboard for pasting into an
  AI analysis tool.

## Affected Files

- apps/web/server/_core/trpc.ts (errorFormatter)
- apps/web/client/src/lib/systemErrorMonitor.ts (new)
- apps/web/client/src/main.tsx (header capture + subscription hook)
- apps/web/client/src/components/guardian/FeedbackButton.tsx (paste, contextJson, prefill)
- apps/web/client/src/pages/AdminFeedbackHub.tsx (lightbox, diagnostics, copy-for-AI)

## Risk Assessment

- No DB migration (contextJson column exists) → low DB risk.
- errorFormatter: additive to shape.data; must NOT leak stack/env in prod —
  only traceId. Low risk.
- Central toast could duplicate local mutation onError toasts → mitigated by
  stable toast id + only system errors + dedupe window.
- FeedbackButton is large; edits must be surgical (paste handler + prefill +
  contextJson only).
- Diagnostics must NEVER include secrets/tokens — bundle only whitelisted
  fields (no headers, no localStorage dumps).

## Verification

1. `cd apps/web && pnpm check` (typecheck).
2. Existing tests: `pnpm test` targeted suites (feedback-related if any).
3. Manual: throw a test 500 → friendly toast appears with report action →
   dialog prefilled → paste 2 screenshots → submit → AdminFeedbackHub shows
   ticket with diagnostics + lightbox + copy-for-AI works.
4. Deploy: `npm run build:deploy` + restart web service (server/_core/trpc.ts changed).

## Progress

- [x] Exploration (2 agents) — findings recorded above
- [x] A. Server errorFormatter (trpc.ts — traceId only, getTraceId() → ctx.req.requestId → null)
- [x] B. Central error controller (lib/systemErrorMonitor.ts + main.tsx hooks)
- [x] C. FeedbackButton paste + contextJson + prefill via smartspec:report-error event
- [x] D. AdminFeedbackHub lightbox + diagnostics panel + "คัดลอกสำหรับ AI"
- [x] Typecheck (pnpm check exit 0) + tests (FeedbackButton 4/4, feedbackProcessor 7/7)
- [ ] Build + deploy + restart — PENDING USER APPROVAL (deploy denied by permission
      classifier; needs `npm run build:deploy` + `sudo systemctl restart
      smartspec-web.service` since server/_core/trpc.ts changed)

## Phase 2 — Server-side auto-report (จุดที่หลุด) (2026-07-09)

### Gap analysis (verified)
Async job failures NEVER reach the client-side monitor: they come back as
normal responses with `status:"failed"`, not thrown tRPC errors. Server-side
failure paths only create short bell notifications (error truncated to 200
chars), no feedback ticket, no diagnostics:
- Node: `routers/mediaJobs.ts:105 notifyJobFailure` (called :1724 on dispatch
  fail; job-status error paths), `services/verticalDramaStoryJobs.ts:491
  notifyStoryJobTerminal` (failure branch)
- Node tRPC: `_core/index.ts:1410 onError` only logs — internal errors from
  ANY procedure (user or admin) are not reported anywhere.
- Python: `app/tasks/media_tasks.py:1529` → `notify_task_failed` +
  `notify_admin_task_alert` (notification only).

### Design
New `server/services/systemAutoReportService.ts` — `reportSystemFailure()`:
- Creates feedback ticket automatically: ticketType "bug", title
  `[Auto][<fp8>] <title>`, submittedBy = affected user, contextJson =
  `{ kind: "system_auto_report", source, fingerprint, occurrences, traceId,
    jobId?, path?, errorMessage, stack?, firstSeenAt, lastSeenAt, extra }`.
- Dedup: fingerprint = sha256(source|normalized error msg) → if an auto
  ticket with same `[Auto][<fp8>]` title prefix exists within 24h and not
  closed → increment contextJson.occurrences + lastSeenAt instead of new
  ticket. Flood guard: max 20 new auto tickets/hour globally.
- Reuses feedbackProcessor/createNotification admin fan-out.
Hooks:
1. tRPC onError (index.ts) — INTERNAL_SERVER_ERROR/TIMEOUT only (covers all
   134 routers, user AND admin actions), with path + traceId + stack.
2. notifyJobFailure (mediaJobs.ts) — jobId + error.
3. notifyStoryJobTerminal failure branch (verticalDramaStoryJobs.ts).
4. New internal endpoint `POST /api/internal/feedback/auto-report` (bearer,
   mirrors admin-broadcast at index.ts:952) called from Python task-failure
   path with full task detail.
AdminFeedbackHub: recognize `system_auto_report` bundles (key facts +
occurrences + Auto badge).

### Phase 2 progress
- [x] systemAutoReportService + Node hooks (tRPC onError, mediaJobs,
      verticalDramaStoryJobs) + internal endpoint /api/internal/feedback/auto-report
      (bearer: SMARTSPEC_WEB_GATEWAY_TOKEN, same as admin-broadcast)
- [x] Python → internal endpoint: app/services/system_auto_report.py, called from
      _send_failure_notifications (covers all 6 permanent-failure points) and
      _recover_stuck_tasks_async (finally-block, only on new FAILED transition)
- [x] AdminFeedbackHub: Auto badge + ×N occurrences in list, flat-shape key facts,
      Stack trace collapsible; Copy-for-AI works unchanged
- [x] Typecheck exit 0; tests: feedbackProcessor 7/7, verticalDramaStoryJobs 23/23,
      FeedbackButton 4/4, python media task suites 43/43
- KNOWN ISSUE (follow-up task spawned): verticalDramaStoryJobs has a pre-existing
  ad-hoc ticket filer (submitFailedStoryJobFeedback, from a concurrent session) →
  story-job failures file 2 tickets on first occurrence; consolidate into
  reportSystemFailure + update its tests.
- Deploy pending user approval: npm run build:deploy + restart smartspec-web
  (Node server files changed) + restart smartspec-backend/Celery workers
  (python-backend changed).
