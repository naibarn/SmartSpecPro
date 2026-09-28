# Implementation plan — Feature 168 Web/Server

## Wave 1 — shared contracts and safe seams

เพิ่ม `specialTieInFootageContracts.ts` แบบ additive สำหรับ guide/status, story review, selected-character allowlist, model snapshots, millisecond placements, event projection และ job payloads. เพิ่ม fixtures ที่ parse legacy records ได้และ reject stale/unknown IDs. ขยาย `workerRuntime.ts` catalog/capability ให้รู้จักสาม job ใหม่โดยไม่เปลี่ยน normal episode contracts

## Wave 2 — server lifecycle and persistence

เพิ่ม service/router seams สำหรับ resumable upload intent/finalize, analyze/status, preparation approval, guide read, model catalog, idea runs/history, story save/validation, nine-shot confirmation, AI B-roll generation request, placement CRUD, render submit, cancellation และ event reconciliation. ใช้ existing tenant/series/media authorization. เพิ่ม additive Drizzle migration ตาม schema impact check โดยเก็บ source/analysis/prepared/map/transcript/idea/story/shot/placement/job/event/credit references แบบ bounded และมี retention/cleanup

ทุก billable operation ต้อง preflight/reserve ก่อน dispatch และ finalize/refund ตาม Worker/provider result แบบ idempotent. Upload finalize ต้อง checksum-complete ก่อน enqueue; optimistic revision/idempotency ป้องกันสอง tab หรือ double click

## Wave 3 — Skill adapter

สร้าง input snapshot จากสินค้า/customer journey/managed images/guide/selected character IDs/DNA/relationships/dialogue mode และ LLM model. Resolve names จาก IDs ฝั่ง Server. Validate exactly three human-readable stories, prose/action/dialogue separation, no-dialogue leakage, evidence/unknown/prohibited claims, requested look/scene slots และ new variation seed. Partial guide ต้องมี warning acknowledgment

## Wave 4 — UI

ปรับ `SpecialTieInEpisodeDialog` เป็น Footage/Story/B-roll stages: protected preview/fullscreen, upload progress/resume/cancel, analysis markers, trim review, warning acknowledgment, three searchable scrollable model selectors with recommended defaults, single-character checkbox selection, idea history disclosure, editable continuous prose + structured action/dialogue editor, nine-shot gate, millisecond timeline placement and render status. F5 hydrate jobs/prepared artifacts only; ideasกลับผ่าน explicit history

## Wave 5 — integration and proof

เพิ่ม service/router/component/browser tests, contract fixtures, migration rollback checks, event replay/upload resume/model resolution/credit reconciliation tests. Enable tenant flag only after Worker doctor, migration, authenticated browser flow and live Thai transcription/render pass. Do not implement media CPU work in Server request.
