# Marketplace Staged Auto Review — user-triggered Remotion final render

Status: backend + UI shipped 2026-07-30; awaiting a real user-triggered render

## Extra defects found while implementing

- `advanceStagedMarketplaceAutoReviewRun` re-consumed an ALREADY-CONSUMED
  `final_assembly` checkpoint on every 60s tick once the render stopped being
  automatic, throwing `checkpoint_consumed`, which
  `recordStagedProviderFailureAndRefund` mis-attributed to `image_generation`
  (the message carries no stage keyword) and parked the run in a bogus
  `correction_required`. Fixed by returning `finalAssemblyApproved: true`
  without re-consuming when `consumedAt` is set.
- `upsertRunStage` rejects a `blocked_needs_user` write that carries no
  `stageCompletionEvidence` ("Cannot mark user_blocked without missing refs
  and policy evidence"), and the call site swallowed the ZodError with
  `.catch(() => undefined)` — the hold silently never persisted.

## Problem

Run `mar_341efe636f0e6d11fc938a37dd4b19a1` finished all 9 shot videos and its
`final_assembly` checkpoint auto-approved, yet:

1. **The final render never reached the worker queue.** Submission threw
   `PostgresError 22001: value too long for type character varying(32)` — the
   credit reservation wrote a 58-char `traceId`
   (`staged-final-render:<runId>:r<rev>`) into `credit_transactions.traceId`,
   which is `varchar(32)`. The caller caught it, logged a warning, and fell
   back to the legacy renderer, so from the UI the run just stopped.
2. **The UI has no render section at all.** `StagedCheckpointReviewPanel`'s
   "การประกอบขั้นสุดท้าย" block exposes only shot order + include-audio. There
   is no subtitle preset control, no text/image overlay control, no render
   submit button, and no render status.
3. **Render is automatic.** `advanceMarketplaceAutoReviewStagedArchitecture`
   submits the render on the sweep tick as soon as `final_assembly` is
   approved. The user wants to configure settings and press render himself.

## Requirements (user, verbatim intent)

- ต้องมี UI ให้ user ปรับตั้ง setting และ **สั่งให้ render เอง ไม่ใช่ทำ auto**
- "สั่ง render" = submit งานไปที่ **render-jobs** เพื่อรอ worker ดึงไป render ด้วย
  Remotion — ห้าม render บน `smartspec-web`
- ต้องรองรับ subtitle และข้อความ/ภาพ overlay บนวิดีโอ

## Affected files

| File | Change |
|---|---|
| `server/services/creditService.ts` | `clampCreditTraceId` at both `credit_transactions` insert sites (DONE) |
| `server/services/marketplaceAutoReviewStagedRemotionRender.ts` | text + image overlay layers in `buildStagedRemotionTemplate` |
| `server/services/marketplaceAutoReviewStagedCheckpointRouterService.ts` | `editStagedAutoReviewFinalAssembly` accepts overlay settings; new `submitStagedAutoReviewFinalRender`; projection exposes settings + render status |
| `server/services/marketplaceAutoReviewService.ts` | stop auto-submitting; keep reconcile only |
| `server/routers/marketplaceCapture.ts` | new mutation + widened edit input |
| `client/src/components/marketplaceCapture/StagedCheckpointReviewPanel.tsx` | render settings + submit button + status |
| `client/src/components/marketplaceCapture/StagedCheckpointReviewSurface.tsx` | wire the new mutation, error copy |

## Steps

- [x] S1 — clamp `traceId` to 32 chars at the credit-transaction boundary (+ test)
- [x] S2 — overlay settings in the `finalAssembly` model + `editStagedAutoReviewFinalAssembly`
- [x] S3 — text/image overlay layers in `buildStagedRemotionTemplate`
- [x] S4 — `submitStagedAutoReviewFinalRender` mutation (fails loudly; no silent legacy fallback)
- [x] S5 — remove auto-submit from the advance path (reconcile stays)
- [x] S6 — projection: `finalAssembly` settings + `render` status block
- [x] S7 — UI section: subtitle preset, overlay text, overlay image, submit, status
- [~] S8 — tests + deploy + live verification against a real run

## Risks

- **Layer budget.** `RemotionTemplateConfigSchema` caps layers; the existing
  code already reserves one for audio. Overlay layers must be counted in the
  same budget or a 9-clip run will start failing schema validation.
- **Credit double-spend.** Manual submit must stay idempotent on
  `(runId, planRevision)` so a double click cannot reserve twice.
- **Existing runs.** Runs already past `final_assembly` with no `renderJobId`
  must still be renderable from the new button (no re-approval required).
