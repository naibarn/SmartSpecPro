# Section 06 — Results, artifacts and observability

## Objective

Project canonical Job outcomes into safe, schema-driven outputs and durable
trace/log/activity views.

## Dependencies and ownership

- Depends on Sections 01 and 03; integrates lifecycle state from Section 05.
- Owns workflow result/artifact/event projection and authorized queries.
- Reuses `workerArtifactService.ts`, worker event/attempt records and existing
  storage/library access patterns.

## Planned changes

1. Normalize output schema and store a version-bound output manifest mapping
   field to result/artifact reference, node, producing attempt, type, checksum
   and safe-serving policy.
2. Validate/publish artifacts through `workerArtifactService.ts`; preserve
   tenant/job storage prefix, checksum, content-type and size controls.
3. Add artifact/preview queries with tenant/run/version authorization and safe
   pending/partial/ready/expired/failed/recovery-required states.
4. Project `worker_job_events`, attempts and canonical status into activity,
   trace, logs, cost and error views. Preserve sequence/idempotency and redact
   payloads.
5. Distinguish admitted, dispatched, started, waiting, effect-verified,
   completed, failed, cancelled and reconciliation-required.
6. Add polling/realtime invalidation without making the browser the source of
   truth.

## Result and projection contract

- `getResultManifest` returns only version-bound schema fields and safe
  artifact/result references for an authorized run.
- `getArtifact`/`previewArtifact` uses the existing authorized storage/proxy
  path and returns pending, unavailable, expired or ready states; raw provider
  URLs and unrestricted storage keys are never returned.
- The event projector stores a durable cursor and quarantines unknown event
  types for operator review. It supports bounded replay/rebuild from canonical
  Job events without inventing a second execution history.

## TDD-first verification

- Output schema and partial/expired/failure result states.
- Artifact prefix/checksum/type/size/duplicate publication validation.
- Authorized preview and safe unavailable fallback.
- Duplicate/out-of-order/stale/unknown event projection.
- Trace/log redaction and terminal-state mapping.

## Acceptance

The Debug Drawer and Run result UI show only durable canonical evidence. Raw
provider URLs, unverified effects and fabricated cost/artifact receipts never
appear as completed results.

## UI/UX Contract

### Target User / JTBD

Authors and operators need to inspect outputs, previews, traces and errors
without confusing pending, partial or unverified effects with completed work.

### Surface Inventory

- Existing Run result/output panel and artifact preview surface.
- Existing Debug Drawer, Worker Jobs timeline and activity/log views.
- Existing Library link for successfully published artifacts.

### Component Map

- Reuse current result cards, media preview, status badges, timeline and
  drawer patterns.
- Add schema-driven output rows, artifact availability states, trace filters
  and redacted event details; raw provider URLs remain server-side only.

### State Matrix

| State | Required UI | User action |
|---|---|---|
| pending/partial | Progress and available outputs | Refresh or inspect trace |
| ready | Output schema, preview and artifact metadata | Preview/open Library |
| expired/unavailable | Safe explanation and recovery action | Retry authorized read |
| failed | Error category and attempt link | Inspect/retry if allowed |
| reconciliation-required | Explicit unresolved effect warning | Open operator evidence |

### Responsive Matrix

At 390x844, 768x1024, 1280x800 and 1440x900, output metadata may stack and
trace details may collapse, but the current status, primary preview/output and
recovery explanation must remain visible and keyboard reachable.

### Accessibility Acceptance

Provide text alternatives for previews, accessible expandable trace rows,
announced polling updates, stable focus when new events arrive, and readable
non-color status labels for every artifact/output state.

### Copy Contract

Use “ผลลัพธ์บางส่วน”, “กำลังตรวจสอบผลลัพธ์”, “ยังไม่มีไฟล์ที่ยืนยันแล้ว”,
“เปิดตัวอย่าง” and “ต้องตรวจสอบการชำระ/ผลลัพธ์เพิ่มเติม”; never present an
unverified artifact as ready.

### Browser Evidence Required

Capture complete, partial, pending, expired, failed and reconciliation-required
result flows from Dashboard → run detail at the four responsive sizes, proving
that trace/log/event content is redacted and output links are authorized.
