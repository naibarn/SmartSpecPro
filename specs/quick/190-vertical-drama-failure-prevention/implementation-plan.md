# Implementation Plan — Vertical Drama Failure Prevention

## Outcome

ทำให้ pipeline มี safety gate ที่แม่นขึ้นและตรวจสอบได้, recovery ที่ไม่สูญเสียงาน/เครดิต, job lifecycle ที่ไม่ค้างเงียบ และ UI/production operation ที่บอกความจริงตลอดวงจร

## Recommended delivery order

### Phase 0 — Baseline and contracts

- สร้าง fixture จาก incident episode 296 แบบ sanitized และ fixture genuine-risk
- กำหนด stable error/state codes: `policy_blocked`, `detector_uncertain`, `provider_rejected`, `schema_failed`, `worker_stalled`, `checkpoint_available`, `no_checkpoint`, `draining`
- กำหนด correlation tuple: `tenantId`, `seriesId`, `episodeId/shotNumber`, `jobId`, `dispatchId`, `runId`, `detectorVersion`
- ยืนยัน no-migration/no-provider/no-credit constraints ใน test harness

### Phase 1 — Safety gate hardening (P0)

Owner paths:

- `apps/web/server/services/verticalDramaStorySafety.ts`
- `apps/web/server/services/__tests__/verticalDramaStorySafety.test.ts`
- safety callsites listed in `research-notes.md`
- `specs/quick/179-storyboard-policy-recovery/` contracts where candidate evidence is projected

Tasks:

1. แยก authored story fields, generated prompt fields, metadata และ policy instructions เป็น typed segments
2. รวม marker registry และ boundary/context matcher; ห้าม callsite ใดใช้ raw `includes` กับ high-risk Thai marker เอง
3. เพิ่ม finding evidence: `source`, `fieldPath`, `shotNumber`, `matchedRule`, bounded excerpt/hash, confidence และ detector version
4. กำหนด precedence: authored intent > generated expansion > metadata; ambiguity ให้ `detector_uncertain` และหยุด media generationเพื่อ review
5. เพิ่ม normalization ที่ปลอดภัยต่อ Unicode/ช่องว่าง/วรรณยุกต์ โดยไม่ลบหลักฐานจน bypass ได้
6. เพิ่ม contract test ว่าการ repair ไม่สามารถทำให้ finding หายเพียงเพราะเปลี่ยน field ที่ไม่ใช่ authored source

Exit gate: incident fixture ไม่ block, genuine-risk fixture block, ทุก callsite ใช้ analyzer contract เดียวกัน, evidence ตรวจย้อนกลับได้

### Phase 2 — Candidate-aware recovery and billing safety (P0/P1)

Owner paths:

- `apps/web/server/services/verticalDramaStoryboardGeneration.ts`
- `apps/web/server/services/verticalDramaStorySafety.ts`
- `apps/web/server/services/verticalDramaStoryJobs.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- related tests under `apps/web/server/services/__tests__` and router tests

Tasks:

1. ตรวจ bounded repair budget, schema validation และ no-progress detection ให้เป็น invariant เดียว
2. เก็บ candidate ก่อน repair, ทุก attempt ที่แก้ไข, final rejected candidate และ exact findings; cap payload/PII
3. แยก policy rejection จาก provider/schema/infrastructure failure; ห้ามใช้ข้อความ generic เดียวกัน
4. ก่อน media generation ต้องมี `safe_candidate_accepted` หรือ explicit user review; high-risk/uncertain candidate ห้ามผ่าน handoff
5. ผูก credit reservation/commit กับ accepted artifact และ idempotency key; failed/rejected candidate ต้องไม่ commit เครดิต
6. ให้ repair action รับเฉพาะ owner-scoped job/artifact และป้องกัน double-click/double-submit

Exit gate: rejected candidate เปิดดูได้, repair หมด budget แล้วหยุดอย่างปลอดภัย, accepted candidate เท่านั้นที่ส่ง media, credit ledger test ไม่ double charge

### Phase 3 — Checkpoint, stall, and restart resilience (P1)

Owner paths:

- `apps/web/server/services/verticalDramaStoryJobs.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRuntime.ts`
- `apps/web/server/services/verticalDramaStoryGenerationRepository.ts`
- `apps/web/server/services/workerStallWatchdogService.ts`
- `apps/web/server/jobs/workerStallWatchdogJob.ts`
- `apps/web/server/_core/index.ts`

Tasks:

1. นิยาม heartbeat/progress age แยกจาก Redis TTL; checkpoint write ต้องมี `updatedAt`, sequence/version และ last delivery
2. เพิ่ม startup sweep และ periodic reconciliation ที่เทียบ BullMQ delivery กับ Redis domain record และ durable assurance run
3. เมื่อ delivery failed/stalled ให้เลือก state ตามหลักฐาน: same-jobId resume, recoverable checkpoint หรือ terminal operator review; ห้ามสร้าง job ใหม่เงียบ ๆ
4. ใช้ fence token/idempotency เพื่อให้ stale worker เขียน result, checkpoint หรือ credit commit ไม่ได้
5. ตรวจ active pointer/recoverable pointer race, TTL expiry และ no-checkpoint case; alert เมื่อ running ไม่มี heartbeatเกิน threshold
6. เพิ่ม drain mode ให้หยุดรับ submission ใหม่และรอจุด checkpoint ก่อน queue close; startup ต้อง reconcile ก่อน `/readyz` กลับ 200

Exit gate: kill/restart simulation resume จาก checkpoint, stale delivery ไม่ clobber state, no duplicate episode/credit, mismatch มี alert และ operator action

### Phase 4 — UI, observability, and production rollout (P1/P2)

Owner paths:

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts`
- `apps/web/client/src/pages/__tests__/VerticalDramaSeriesDetailPage.deepStoryDrafts.test.tsx`
- `apps/web/server/_core/index.ts`, metrics/telemetry services, deployment docs

Tasks:

1. แสดง canonical state และ reason ที่แยกกัน: running, recoverable, policy blocked, uncertain, no checkpoint, draining, operator review, succeeded
2. ใน policy block แสดง shot/field/rule ที่พบแบบ bounded และปุ่ม review/edit; ไม่แสดงว่าเป็น provider failure
3. ใน stall/recovery แสดง completed/remaining, checkpoint time, attempt และ action เดียว; disable duplicate action
4. เพิ่ม structured metrics/logs: false-positive regression count, safety findings by code/source, repair attempts, stalled age, recovery result, duplicate submit, credit mismatch
5. ทำ dashboard/alert อย่างน้อยสำหรับ running-without-heartbeat, failed-delivery-with-active-record, queue init failure, recovery limit และ readiness/draining mismatch
6. rollout แบบ feature flag/canary: observe detector shadow mode เฉพาะ false-positive telemetryได้ แต่ production block policy ยัง fail-closed; deploy แล้วต้อง restart/re-verify ตาม runbook

Exit gate: browser evidence ครบทุก state, alert ทดลองยิงได้, canary ไม่มี credit/data regression, rollback path ทดสอบแล้ว

## Explicit non-goals during implementation

- ห้ามแก้ unrelated dirty files
- ห้ามใช้ `pnpm check` สีเขียวทั้ง repository เป็นเงื่อนไขเดียว เพราะ baseline มี errors; ต้องเก็บ focused proof และรายงาน baseline แยก
- ห้ามประกาศ production complete จนกว่าจะมี deploy identity, restart, browser/queue proof และ provider/credit safety proof ตาม checklist

## Rollback

- detector: rollback rule-pack/version ผ่าน feature flag แต่ยังคง fail-closed เมื่อ evidence เป็น high-confidence
- recovery: ปิด CTA ใหม่ได้ แต่คงอ่าน checkpoint/artifact เดิมและให้ operator ดำเนินการ
- deployment: remove instance จาก readiness, drain, rollback bundle, startup reconcile; ห้ามลบ Redis record หรือ artifact เพื่อแก้ปัญหา
