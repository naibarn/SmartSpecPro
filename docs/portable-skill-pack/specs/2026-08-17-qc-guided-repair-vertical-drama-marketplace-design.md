# QC-guided repair for Vertical Drama and Marketplace Auto Review

## Objective

เติมช่องว่างระหว่าง `repairPlan` ที่แสดงในหน้า QC กับการซ่อมจริง โดยให้ผู้ใช้
กดยืนยันก่อนใช้เครดิตทุกครั้ง และทำให้การซ่อมมีหลักฐานตรวจสอบได้ว่าไม่ได้ทำให้
ข้อมูลแกนกลาง ความต่อเนื่อง หรือสัญญา downstream เสียหาย

ครอบคลุมสอง domain:

- Vertical Drama Draft QC: ซ่อม Story Architecture/Draft ที่คะแนนไม่ผ่าน
- Marketplace Auto Review Creative QC: ซ่อม product-led story plan ก่อนอนุมัติ
  เพื่อสร้างสื่อ

ทั้งสอง domain ใช้ lifecycle เดียวกัน แต่คง rubric, immutable fields และ
post-repair validators ของตนเองไว้ ไม่แชร์ schema เฉพาะ domain แบบบังคับ

## Current gap

### Vertical Drama

มี deterministic `repairPlan` และปุ่ม `ให้ AI ซ่อม` แล้ว แต่ callback ปัจจุบัน
เรียก `startDraftQualityQc(1)` ซึ่งเป็นการเริ่ม QC loop ใหม่ที่มีหนึ่งรอบ
improvement ไม่ใช่ repair command ที่ผูกกับผล QC, candidate version และแผนที่
ผู้ใช้เห็น จึงไม่มี boundary ที่ชัดเจนระหว่าง “ตรวจ” กับ “สั่งซ่อม”

### Marketplace

มี QC loop, outbox job และ candidate application แล้ว แต่ยังไม่มี repair plan
สำหรับผู้ใช้หรือ repair mutation แยกต่างหาก ขณะ process QC สำเร็จจะนำ best
candidate ไปเขียนกลับ run metadata ทันที และยังไม่มี candidate history ที่ UI
เลือกกลับไปใช้ฉบับเดิมได้อย่างชัดเจน

## Alternatives

### A. Wire ปุ่มเดิมให้เรียก QC รอบหนึ่ง

แก้น้อยที่สุดและใช้โค้ดเดิมได้มาก แต่ยังแยก repair กับ QC ไม่ได้, audit lineage
ไม่ชัด, Marketplace ยังเขียนทับแผนเดิม และ rollback/เลือก candidate ทำได้ไม่
ปลอดภัย จึงไม่เลือก

### B. Domain-specific repair adapters บน durable ledger/artifact เดิม — เลือกใช้

เพิ่ม repair operation แยกบน service/router/job ที่มีอยู่ ใช้ Vertical Drama
Draft Ledger และ Marketplace Auto Review Artifact Store เป็นแหล่งเก็บ
candidate แบบ immutable แล้วให้แต่ละ domain ใช้ validator ของตัวเอง

ข้อดีคือเปลี่ยนแปลงแคบ, rollback ได้, ไม่ต้องเพิ่ม service ใหม่ และพิสูจน์
ownership/idempotency ได้ตาม boundary ที่มีอยู่ ข้อแลกเปลี่ยนคือมี adapter สอง
ชุดและต้องทดสอบ contract คู่กัน

### C. สร้าง generic cross-domain QC repair orchestrator

ลดการซ้ำของ orchestration ในอนาคต แต่ตอนนี้จะทำให้ rubric, source snapshot,
validation และ downstream invalidation ผูกกันเกินไป เพิ่มความเสี่ยงที่การแก้
Marketplace จะกระทบ Vertical Drama จึงเก็บไว้เป็นแนวทางระยะถัดไป

## Chosen design

### Shared lifecycle

```text
QC report + repair plan
        |
        v
User confirmation + server revalidation
        |
        v
One bounded Skill repair call
        |
        v
Complete replacement / immutable / domain continuity validation
        |
        +--> fail: keep old candidate active, persist reason only
        |
        v
Persist new candidate version/artifact
        |
        v
One fresh QC evaluation against the repaired candidate
        |
        +--> not better/not pass: keep old candidate active, show comparison
        +--> pass: expose repaired candidate for explicit selection
```

Repair เป็น user-triggered เสมอ, จำกัดหนึ่งครั้งต่อ source fingerprint และไม่
วนซ้ำอัตโนมัติเมื่อคะแนนไม่ดีขึ้น การ “QC ใหม่” เป็น evaluation ของ candidate
หลังซ่อม ไม่ใช่การเชื่อคะแนนจาก Skill หรือ client

### Shared safety rules

- server โหลด source candidate และ report จาก durable state; ไม่เชื่อ
  `repairPlan`, score, paths หรือ draft ที่ส่งจาก client เป็น authority
- ตรวจ owner และ tenant ทุก mutation
- ใช้ request fingerprint ที่ประกอบด้วย run/draft id, source fingerprint,
  report fingerprint และ operation เพื่อกัน double-submit
- จอง/หัก/คืนเครดิตตาม actual calls; UI แสดง max estimate ก่อน confirmation
- repair output ต้องเป็น complete draft replacement และ `changedFields` เป็น
  audit metadata เท่านั้น
- ถ้า Skill ตอบ malformed, เปลี่ยน immutable field, ลดข้อมูล, ทำให้ contract
  ไม่ครบ หรือ post-repair validator ไม่ผ่าน จะไม่ activate candidate ใหม่
- candidate เดิมไม่ถูกลบหรือเขียนทับ และต้องยังใช้ต่อ/เลือกกลับได้
- error ต้องบอกสาเหตุ, ค่าที่คาดหวัง/ค่าที่ได้รับเมื่อมี และขั้นตอนถัดไป

## Vertical Drama design

### Server and job contract

เพิ่ม operation แยกจาก `startDraftQualityQc` เช่น
`repairDraftQualityQc`/`operation: "repair"` บน job infrastructure เดิม โดย
รับ source `runId`, `draftId`, `version` และ `candidateFingerprint` ที่ผู้ใช้
เลือก แต่ server ต้องตรวจทั้งหมดกับ Draft Ledger และ QC history ก่อนเริ่ม

Repair worker จะ:

1. โหลด complete candidate และ report ที่ตรง fingerprint
2. สร้าง bounded repair brief จาก critical fails, weak criteria และ
   recommendations; จำกัด target paths ตาม deterministic plan
3. เรียก Draft QC Skill ใน `revise` mode หนึ่งครั้ง
4. ทำ additive merge ตามกติกาเดิม แล้วตรวจ
   `storyContext`, `storyContract`, `visualNarrativeProfile`, user premise,
   episode count, locale/market, explicit names และ story-control contract
5. ตรวจ `inspectVerticalDramaDraftCompleteness` และ
   `inspectVerticalDramaStoryControlConsistency`
6. บันทึกเป็น Draft Ledger version ใหม่ด้วย stage/metadata ที่ระบุว่าเป็น
   user-confirmed repair และ parent version เดิม
7. เรียก evaluate QC ใหม่กับ version ใหม่นั้น แล้ว persist scorecard,
   fingerprint และ comparison result

version ใหม่จะยังไม่ถูกเลือกเป็น Draft ที่ใช้งานโดยอัตโนมัติ แม้ structural
validation จะผ่าน หากผลใหม่ไม่ดีขึ้นหรือ critical fail เพิ่มขึ้นให้เก็บไว้เพื่อ
audit และคง pointer เดิม หากผลใหม่ผ่านให้ UI แสดง comparison และให้ผู้ใช้กด
เลือก candidate ใหม่ผ่าน mutation ที่ตรวจ version/fingerprint อีกครั้ง

### Vertical Drama UI

- แสดง repair plan, target fields, สิ่งที่จะ preserve, จำนวน calls และเครดิต
- ปุ่ม repair แสดงเฉพาะเมื่อ plan มี action ที่ `autoRunnable` และ source ยัง
  เป็นผล QC ล่าสุดที่ไม่ stale
- confirmation ต้องระบุชัดว่า “สร้าง Draft ฉบับใหม่และ QC ใหม่”
- ระหว่างซ่อมแสดง phase/progress แยกจากปุ่มเริ่ม QC
- หลังซ่อมแสดง old/new score, critical fail delta, changed fields และปุ่ม
  เลือก candidate; ห้าม auto-apply candidate ที่ไม่ผ่าน guard
- การยืนยันใช้ Draft เดิมแบบมีคำเตือนยังคงทำงานตาม advisory QC policy

## Marketplace Auto Review design

### Shared contract

เพิ่ม `repairPlan` แบบ deterministic ให้ Marketplace QC report โดย plan ต้อง
อ้างอิง criterion/critical fail, target paths, preserve paths และเหตุผลที่
แสดงให้ผู้ใช้เข้าใจได้ ไม่ให้ LLM เป็นผู้กำหนด path ที่แก้ได้เอง

เพิ่มข้อมูล additive ใน `MarketplaceDraftQcState` และ history เช่น:

- `repairStatus`: idle/queued/running/succeeded/failed/not_better
- `repairAttempted`
- source และ repaired candidate fingerprint
- candidate artifact references และ comparison summary

คง threshold และ hard-fail semantics เดิมของ Marketplace ไว้ การซ่อมที่ทำให้
product truth, claim evidence, reference manifest หรือ shot contract เปลี่ยน
จะไม่ผ่าน

### Candidate durability

ใช้ `marketplace_auto_review_artifacts` ที่มีอยู่แล้วเก็บ JSON snapshot ของ
candidate, scorecard และ repair metadata โดยไม่เก็บ raw provider payload
เพิ่ม artifact kinds สำหรับ creative-QC candidate/repair candidate และเก็บ
เฉพาะ references ใน run metadata/history เท่าที่ UI ต้องใช้

ระหว่าง initial QC ให้ persist baseline และทุก evaluated candidate ก่อนเลือก
best เพื่อให้ผู้ใช้มี source ที่ rollback/compare ได้ การ apply best เดิมต้อง
เปลี่ยนเป็นการ advance plan revision ที่มี lineage ชัดเจน ไม่ใช่การหายไปของ
Draft เก่า

### Repair worker and approval flow

เพิ่ม mutation และ outbox operation สำหรับ Marketplace repair:

1. ตรวจว่า run owner ถูกต้อง, อยู่ที่ story-plan review, QC สำเร็จแต่ไม่ผ่าน,
   plan ยังไม่ stale และยังไม่เคย repair source fingerprint นี้
2. persist/resolve source artifact
3. เรียก Marketplace QC Skill revise หนึ่งครั้งด้วย plan และ feedback ที่
   bounded
4. ตรวจ complete plan, product truth, product/reference identity,
   referenceManifestHash, shot count/durations, required dialogue/CTA และ
   domain safety checks
5. persist repaired artifact และ evaluate QC ใหม่หนึ่งครั้ง
6. candidate repair จะยังไม่เขียนทับ current plan; เก็บ artifact และผล QC
   เพื่อให้ UI แสดง comparison โดยคง current plan ไว้เสมอ
7. เมื่อ repaired report ผ่าน ผู้ใช้จึงกดเลือก candidate ผ่าน mutation ที่
   ตรวจ artifact/fingerprint อีกครั้ง จากนั้นจึง advance plan revision และ
   invalidate downstream prompt/image/video artifacts ตาม plan revision ใหม่
8. approval gate เดิมจึงทำงานต่อหลัง candidate ใหม่ถูกเลือกและ QC receipt ตรงกัน

การอนุมัติ Marketplace ยังคงต้องผ่าน QC เพราะเป็น production gate ก่อนใช้
media credits; repair ไม่ใช่ bypass และไม่เปลี่ยน hard-fail policy

### Marketplace UI

ขยาย `MarketplaceDraftQualityQcPanel` ให้มี:

- repair plan และ action ที่แนะนำ
- ปุ่ม “ยืนยันให้ AI ซ่อมและตรวจใหม่” พร้อม confirmation
- progress/error ของ repair แยกจาก initial QC
- comparison ของ source/repaired candidate
- สถานะ no-safe-plan/no-improvement พร้อมทางเลือก redraft หรือแก้เอง

ส่ง callback ผ่าน `StagedCheckpointReviewSurface` และ
`AutoReviewPlanReviewPanel` ไปยัง tRPC mutation เดียวกัน โดยไม่ให้ panel
ตัดสิน approval จาก client-derived score

## Skill contract

ปรับ skill mirrors ของทั้งสอง domain ให้มี section `REPAIR MODE` ที่ระบุ:

- return complete draft + `changedFields`
- แก้เฉพาะ target paths ที่ server ส่งให้
- preserve paths และ product/story identity ที่ server ส่งให้
- ห้ามสร้าง claim, character, product feature, episode หรือ shot ที่ไม่มี
  evidence/constraint รองรับ
- ห้ามส่ง scorecard ใหม่ใน revise response

Schema retry อนุโลม metadata `changedFields` ที่หายหรือเกิน bounded limit ได้
เฉพาะเมื่อ draft ครบและ server derive/normalize metadata เอง; ห้าม recover
missing draft หรือ scorecard

## Failure and recovery

- Queue/provider failure: คง source candidate, mark repair failed, ไม่สร้าง
  คะแนนทดแทน และให้ retry แบบ user-triggered
- Stale source: reject ด้วย conflict และให้ refresh/re-run QC ไม่ซ่อม candidate
  ที่เปลี่ยนแล้ว
- Double click/repeated delivery: idempotency returns existing job/state
- Validator failure: store bounded diagnostic/audit metadata; never activate
  repaired content
- New QC lower than old: keep old active and show both results
- Refresh/browser restart: hydrate job and candidate refs from ledger/artifact
  metadata ไม่เริ่ม LLM ใหม่อัตโนมัติ
- Existing legacy records without repair fields: derive plan from current
  report and treat missing history as unavailable, never fabricate candidate

## Testing and acceptance criteria

### Shared/domain tests

- deterministic plan from low criteria and critical fails
- no plan for passed/no-safe-repair report
- immutable paths and bounded target paths
- malformed revise response and omitted `changedFields` recovery
- repair result cannot remove fields or invent protected values
- no-improvement keeps old candidate active
- repeated repair request is idempotent

### Vertical Drama tests

- ledger parent/new version lineage and fingerprint binding
- story-control consistency and completeness rejection
- repaired candidate receives a fresh QC evaluation
- candidate selection/confirmation remains owner-scoped
- advisory low score remains usable without repair
- UI confirmation, progress, comparison and no-plan states

### Marketplace tests

- baseline and evaluated candidate artifacts are durable
- product truth/reference/shot contract mutation is rejected
- repair is only allowed from the correct story-plan QC state
- selecting a passed repaired plan creates a new plan revision and invalidates
  downstream artifacts
- fresh QC is required after repair before approval
- non-better repair does not replace current plan
- UI repair confirmation and approval remains blocked until pass

### Focused verification

Run changed-surface Vitest suites for shared contracts, both QC services,
routers/job state, and both UI panels; run `git diff --check` and focused web
type diagnostics. Separate unrelated dirty-worktree or baseline failures from
the new repair proof. Browser proof should cover both confirmation flows and
the post-repair comparison state when the runtime is available.

## Migration and rollout

Prefer additive JSON state, existing Vertical Drama Draft Ledger, existing
Marketplace Auto Review Artifact Store, and existing outbox/idempotency tables.
No database migration is planned unless implementation proves that artifact
references cannot be durably queried with the current tables. Roll out behind
the existing feature flags where available, preserve legacy QC result parsing,
and fail closed for malformed new repair state.

## Non-goals

- unattended infinite repair loops
- weakening either domain's critical-failure or approval gate
- merging the two scoring rubrics
- provider fallback or fabricated scores
- deleting old Drafts, plan revisions, or artifacts
- changing unrelated media generation or Marketplace capture behavior
