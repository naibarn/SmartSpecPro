# Skill Revenue Routing, Integer Allocation, Reporting, and Admin Reliability

สถานะ: Approved for implementation by user on 2026-08-24
ประเภท: Feature specification + bug-fix specification
ผู้ขอไม่ต้องการ mockup; เอกสารนี้จึงกำหนด contract, flow, state, และ acceptance criteria โดยไม่สร้างภาพ mockup

## 1. สรุปผลลัพธ์ที่ต้องได้

ระบบต้องทำสิ่งต่อไปนี้ให้ครบใน flow เดียวกัน:

1. ทุก skill ที่ register อยู่ในฐานข้อมูลต้องมีราคาต่อการ run เป็นเครดิตจำนวนเต็ม โดยค่าเริ่มต้นคือ tenant 2 เครดิต และ skill owner 0 เครดิต และแก้ไขราย skill ได้จากหน้า Admin Skills
2. เมื่อ skill run สำเร็จและไม่ถูก refund อัตโนมัติ ระบบหักเครดิตจากผู้ใช้หนึ่งรายการทันที แล้วเพิ่มเครดิตเข้ากระเป๋าปกติของผู้รับรายได้ทันที โดยรวมกับรายการ run เดียวกันในประวัติเครดิตของผู้ใช้ ไม่แสดงเป็นค่าหักแยก
3. เครดิตรายได้ยังเป็นเครดิตปกติของ user และโอนให้ user อื่นได้ทันที ไม่ถูกย้ายไปยอดถอนหรือถูกตัดออกอัตโนมัติเป็นรายเดือน การถอนเงินในอนาคตจะเป็น action แยกที่ reserve/debit เมื่อผู้ใช้กดเบิกเท่านั้น
4. สำหรับการ run ใน tenant อื่นที่ไม่ใช่ main tenant `smartaihub.app` ให้ platform ได้ 50% และผู้รับรายได้ของ tenant/skill ได้ 50% โดยคำนวณเป็นจำนวนเต็มด้วย `platform = ceil(total / 2)` และ pool ของผู้รับ = `total - platform`
5. รายได้ของ system skill ต้องเข้าผู้รับที่กำหนดใน system setting หากยังไม่ assign ให้ fallback ไปที่ `admin@smartspec.pro`; หากทั้งสองทางใช้ไม่ได้ ให้หยุดก่อน charge และแจ้งเหตุผลชัดเจน
6. สร้าง transaction/allocation ledger ที่ตรวจสอบย้อนกลับได้ถึง run, skill, tenant, ผู้ใช้ผู้ run, ผู้รับ, จำนวนเครดิต, policy snapshot, และ refund/reversal
7. มีหน้า Skill Revenue Report แยกจากหน้า Credits สำหรับสรุปตามช่วงเวลาและดูรายการ transaction โดย admin เห็นทั้งหมด ส่วน user ทั่วไปเห็นเฉพาะ allocation ของตัวเอง และ server ต้องบังคับ scope เอง
8. แก้ bug หน้า Admin Skills ที่ในภาพขึ้น `skills.listFromDb` HTTP 500 และ spinner ค้าง โดยไม่ให้ forced folder sync ทุกครั้งที่เปิดรายการ และต้องแสดงสถานะ schema/migration ที่แก้ได้เมื่อระบบยังไม่พร้อม

เอกสารนี้ supersede ข้อเสนอเดิมที่ให้กันรายได้ไว้เป็น pending จนถึงรอบเดือน เพราะมติล่าสุดกำหนดให้เครดิตเข้ากระเป๋าปกติทันทีและโอนได้ทันที

## 2. หลักฐานปัญหาปัจจุบันและขอบเขตการแก้ bug

### 2.1 หลักฐาน

- ภาพหน้าจอ authenticated Admin Skills แสดงหน้า loading ค้าง และ DevTools แสดง `GET /trpc/skills.listFromDb?...` HTTP 500 สองครั้ง
- การตรวจ route แบบไม่ authenticated พบ `/trpc/skills.listFromDb` ตอบ HTTP 401 `Please login` แปลว่า route มีอยู่จริง แต่ยังพิสูจน์ authenticated production 500 ซ้ำไม่ได้
- `/api/trpc/skills.listFromDb` ตอบ 404 เพราะไม่ใช่ prefix ที่ใช้งานจริง
- code ปัจจุบันของ `skills.listFromDb` เรียก `autoSyncSkillsFromFolder({ force: true })` ก่อน query ทุกครั้ง และ query ใช้ schema ที่มีคอลัมน์ fixed-credit ใหม่
- migration `0247_skill_fixed_credit_revenue.sql` และ `0248_skill_revenue_integrity_and_internal_registry.sql` อยู่ใน worktree แต่ยังไม่มีหลักฐานว่า database ที่กำลังใช้งานได้ apply แล้ว เพราะ environment นี้ไม่มี `DATABASE_URL`

### 2.2 ข้อสรุปเชิง implementation

สาเหตุที่ต้องป้องกันคือ schema drift หรือ folder-sync error ถูกปล่อยเป็น 500 ระหว่าง list query และทำให้ UI ไม่มี error state ที่ใช้งานได้ สาเหตุที่ต้องแก้เชิงโครงสร้างมีสองส่วน:

1. `listFromDb` ต้องใช้ normal cached sync หรือ explicit sync action ไม่ใช่ force sync ทุก read request
2. billing schema readiness ต้องตรวจแบบชัดเจนก่อนใช้ feature; ถ้ายังไม่พร้อม ให้คืน typed error ที่ UI แสดงเป็น migration pending/ระบบยังไม่พร้อม ห้าม fallback เงียบ ๆ จนผู้ใช้เข้าใจว่าราคาและ billing ทำงานแล้ว

การตรวจ authenticated browser, production logs, และการ apply migration จริงเป็น deployment evidence แยกต่างหาก ไม่ถือว่าเสร็จจาก local spec หรือ local tests

## 3. คำจำกัดความและ source of truth

### 3.1 Tenant

- `main tenant` ต้อง resolve จาก configured immutable `mainTenantId` ที่ตรงกับ tenant ของ `smartaihub.app` ไม่ใช้ domain string ที่ส่งมาจาก client เป็นตัวตัดสิน
- tenant อื่นทั้งหมดเป็น `non-main tenant`
- ทุก skill run ต้องมี `tenantId` ที่ resolve จาก authenticated execution context และต้อง fail closed หากหายหรือไม่ตรงกับ skill visibility

### 3.2 ประเภทเจ้าของ skill

เพิ่มหรือทำให้ชัดเจนด้วย field แบบ explicit เช่น `skills.ownerType` enum `system | user`:

- `system`: skill ที่ platform register/ดูแลเอง ไม่มี user creator ที่ใช้รับ skill-owner share
- `user`: skill ที่มี `skills.createdBy` เป็นเจ้าของ skill

ห้ามใช้ heuristic ที่คลุมเครือจากชื่อหรือ folder ใน runtime ใหม่ การ backfill ต้องใช้กฎ deterministic จาก internal registry/import source และเก็บผลการ backfill ที่ audit ได้ หาก resolve ไม่ได้ให้หยุด run ที่ต้องคิดรายได้ ไม่เดาเจ้าของ

### 3.3 ผู้รับรายได้

- `platform recipient`: ผู้รับเครดิตส่วน platform 50% ของ non-main tenant; ค่าเริ่มต้นให้ใช้ผู้รับ system คนเดียวกัน เพื่อไม่ให้ส่วนแบ่งตกหล่น และเปิดทางให้ตั้งค่าแยกในอนาคต
- `system recipient`: admin user ที่รับรายได้ของ system skill และรับ pool ที่เหลือของ system skill ใน non-main tenant
- `tenant owner`: `tenants.ownerId` ของ tenant ที่เป็นที่เกิด run
- `skill owner`: `skills.createdBy` ของ user-owned skill

ระบบต้อง snapshot `userId`, email ณ เวลาตั้งค่า/settlement, role ที่ใช้ตัดสิน, tenantId, skillId, และ policy version ใน allocation เพื่อให้ audit ย้อนหลังได้แม้ user ถูก disable หรือเปลี่ยน role

## 4. Pricing และกฎแบ่งเครดิต

### 4.1 ราคาต่อ run

ให้ใช้ fixed integer fields ที่มีอยู่แล้ว:

- `tenantCreditCost`: จำนวนเครดิตรวมสำหรับ tenant share ก่อนหัก platform policy
- `skillOwnerCreditCost`: จำนวนเครดิตรวมสำหรับ skill owner share ก่อนหัก platform policy
- `grossCredits = tenantCreditCost + skillOwnerCreditCost`

ทั้งสองค่าต้องเป็น integer ที่ไม่ติดลบ ค่า default ของ skill ใหม่และ skill ที่ sync จาก folder คือ `2` และ `0` ตามลำดับ การแก้ไขใช้ admin authorization และบันทึก audit

### 4.2 Main tenant

เมื่อ run ใน main tenant:

- ไม่มี platform commission เพิ่ม
- system skill: `system recipient = grossCredits`
- user-owned skill: tenant owner ได้ `tenantCreditCost`, skill owner ได้ `skillOwnerCreditCost`
- ถ้าผู้รับสองบทบาทเป็น user คนเดียวกัน ให้รวมเครดิตเป็น transaction เดียว แต่ allocation role ต้องยังแยกใน ledger

### 4.3 Non-main tenant: platform 50/50 แบบจำนวนเต็ม

เมื่อ run ใน non-main tenant:

```text
platformCredits = ceil(grossCredits / 2) = floor((grossCredits + 1) / 2)
distributionPool = grossCredits - platformCredits
```

`platformCredits` โอนให้ platform recipient และ `distributionPool` จัดสรรให้ผู้รับรายได้ของ skill/tenant ตามประเภท skill:

- system skill: system recipient ได้ `distributionPool` ทั้งหมด; ไม่สร้าง tenant-owner หรือ skill-owner allocation
- user-owned skill: แบ่ง `distributionPool` ตามน้ำหนักเดิมของ `tenantCreditCost` และ `skillOwnerCreditCost`
  - ถ้าทั้งสองน้ำหนักเป็นศูนย์ ให้ run ไม่ผ่าน validation ก่อน charge เพราะไม่มีผู้รับที่กำหนด
  - ถ้ามีเพียงน้ำหนักฝั่งเดียวมากกว่าศูนย์ ฝั่งนั้นได้ pool ทั้งหมด
  - ถ้ามีทั้งสองฝั่ง ให้คำนวณสัดส่วนด้วย integer arithmetic แล้วให้เศษที่เหลือแก่ tenant owner เป็นกฎ deterministic
  - ไม่ใช้ floating point และไม่เก็บทศนิยม
  - ถ้าฝั่งที่มี allocation มากกว่าศูนย์ไม่มี owner ที่ resolve ได้ ให้ fail ก่อน charge; ห้ามโยนเครดิตส่วนนั้นไปให้ผู้รับอื่นโดยอัตโนมัติ

กฎสัดส่วนที่วางแผนให้ใช้:

```text
tenantPool = floor(distributionPool * tenantCreditCost / grossCredits)
ownerPool = distributionPool - tenantPool
```

หาก `grossCredits` เป็นศูนย์ จะไม่ charge และไม่สร้าง revenue allocation; run จะทำได้เฉพาะถ้าระบบมี explicit free-run policy ที่อยู่นอก scope นี้

ตัวอย่าง:

| tenant | skill type | gross | platform | recipient pool | allocation |
|---|---|---:|---:|---:|---|
| main | system | 2 | 0 | 2 | system recipient 2 |
| non-main | system | 2 | 1 | 1 | platform 1, system recipient 1 |
| non-main | system | 3 | 2 | 1 | platform 2, system recipient 1 |
| main | user, 2/0 | 2 | 0 | 2 | tenant owner 2 |
| non-main | user, 2/0 | 2 | 1 | 1 | platform 1, tenant owner 1 |
| non-main | user, 1/1 | 2 | 1 | 1 | platform 1, tenant owner 1, skill owner 0 |
| non-main | user, 2/2 | 4 | 2 | 2 | platform 2, tenant owner 1, skill owner 1 |

การที่เครดิต 1 pool แบ่งออกมาเป็น 1/0 เป็นพฤติกรรมที่ตั้งใจและต้องแสดงใน preview/report; ห้ามทำให้เป็น 0.5/0.5

### 4.4 Policy snapshot

แต่ละ settlement ต้องเก็บ:

- gross, platform, pool, tenant allocation, skill-owner allocation
- `platformSharePercent=50` และ policy version
- main-tenant exemption flag
- skill owner type และ recipient IDs
- pricing snapshot และ effective timestamp

การแก้ setting ในอนาคตมีผลกับ run ใหม่เท่านั้น ไม่เปลี่ยนประวัติเดิม

### 4.5 Historical tenant-cost initialization

สำหรับการตั้งค่า tenant cost จากข้อมูลเดิม ให้ใช้เฉพาะ `credit_transactions` ที่มีเงื่อนไขครบ:

- `sourceType = 'skill'`
- `type = 'usage'`
- `skillSlug IS NOT NULL`
- `amount < 0`

คำนวณต่อ `skillSlug` ด้วยค่าเฉลี่ยของ `ABS(amount)` จากทุก debit history ที่เข้าเงื่อนไข แล้วตั้งค่า tenant cost เป็นจำนวนคู่ที่ปัดขึ้น:

```text
tenantCost = ceil((averageDebit * 20%) / 2) * 2
```

สูตรนี้ทำให้ 20% ของค่าเฉลี่ยถูกปัดขึ้นเป็นเลขที่หาร 2 ลงตัวเสมอ เช่นค่าเฉลี่ย 300 จะได้ 60 เครดิต ไม่ใช่ 20 เครดิต; ตัวอย่าง 300 → 20 จึงไม่สอดคล้องกับอัตรา 20% และต้องยึดสูตรที่ประกาศไว้เป็นหลัก

การ initialize ต้อง:

- ใช้ค่าเฉลี่ยจาก debit ที่ระบุ skill ชัดเจนเท่านั้น ไม่รวม refund, creator revenue, transfer, หรือรายการที่ไม่มี skill slug
- resolve legacy slug ด้วย alias registry ที่มีอยู่ก่อน; ถ้าไม่มี canonical skill row/mapping ให้รายงานเป็น unresolved และห้ามเขียนลง skill อื่นโดยเดา
- update เฉพาะ `skills.tenantCreditCost` และ audit/source snapshot; ไม่แก้ `skillOwnerCreditCost`, ยอดเครดิตย้อนหลัง, settlement เดิม หรือ transaction เดิม
- ให้ skill ที่ไม่มี history คง default เดิม 2 เครดิต
- แสดง preview จำนวนรายการ, ค่าเฉลี่ย, สูตร, old/new cost, และ unresolved slugs ก่อน commit

## 5. การตั้งค่า system recipient และ platform recipient

ใช้ `system_settings` category `skill_revenue` โดยกำหนด key ที่มี type/validation ชัดเจน:

- `mainTenantId`
- `systemRecipientUserId`
- `platformRecipientUserId` (optional; ถ้าไม่ตั้ง ใช้ `systemRecipientUserId`)
- `platformSharePercent` default `50`, allowed integer `0..100` แต่ policy รุ่นแรกบังคับ 50 สำหรับ non-main tenant
- `systemRecipientFallbackEmail` default `admin@smartspec.pro`
- `skillRevenuePolicyVersion`

### 5.1 การเลือกผู้รับ

หน้า Admin ต้อง list ผู้ใช้ที่เข้าเกณฑ์ทั้งหมด:

- `role === "admin"` เท่านั้น
- `isDisabled = false`
- แสดง user id, email, name, สถานะ, และ selected badge

การ save ต้องทำ server-side validation ว่า user อยู่ใน admin role และ active ณ เวลาบันทึก บันทึก audit actor, old value, new value, timestamp และ reason ถ้ามี

### 5.2 Fallback และ fail closed

ลำดับการ resolve system/platform recipient:

1. explicit configured user ID ที่ยังเป็น active exact admin
2. user ที่ email ตรง `admin@smartspec.pro` และยังเป็น active exact admin
3. ถ้าไม่พบ ให้ throw typed `SKILL_REVENUE_RECIPIENT_UNAVAILABLE`

หากเป็น run ที่มีค่าบริการมากกว่า 0 และ recipient resolve ไม่ได้:

- ห้าม dispatch provider
- ห้ามหักเครดิต
- ห้ามสร้าง settlement สำเร็จแบบไม่มีผู้รับ
- คืน error ให้ caller แสดงได้
- บันทึก audit/operational log แบบไม่เปิดเผยข้อมูลเกินจำเป็น

## 6. Ledger, settlement และ wallet behavior

### 6.1 Source of truth

`credit_transactions` และยอด `users.credits` ยังคงเป็น wallet source of truth ส่วน revenue tables เป็น allocation/audit projection ที่ต้องอ้าง transaction IDs กลับไปหา wallet ledger

### 6.2 Settlement table

ขยาย `skill_revenue_settlements` เดิมให้รองรับอย่างน้อย:

- `runId` unique
- `skillId`, immutable skill slug snapshot
- `tenantId`, tenant display snapshot
- `userId` ของ runner
- `ownerType`
- `grossCredits`, `platformCredits`, `distributionPool`
- `tenantCredits`, `skillOwnerCredits` สำหรับ compatibility/report
- `isMainTenant`, `platformSharePercent`, `policyVersion`
- `userChargeTransactionId`
- `status`: `settled | reversed | partially_reversed | failed`
- `failureCode`, `reversedAt`, `createdAt`, `updatedAt`

ห้ามให้ settlement ที่ status `settled` มี user charge transaction หาย หรือยอด split รวมไม่เท่ากับ gross

### 6.3 Allocation table

เพิ่ม `skill_revenue_allocations` เป็นหนึ่ง row ต่อ beneficiary role ต่อ settlement:

- `id`, `settlementId`, unique pair `(settlementId, beneficiaryType, beneficiaryUserId)`
- `beneficiaryUserId`
- `beneficiaryType`: `platform | system_recipient | tenant_owner | skill_owner`
- `amount` integer non-negative
- `creditTransactionId` nullable เฉพาะก่อน settlement atomic commit
- `status`: `earned | reversed | debt_pending`
- `runId`, `skillId`, `tenantId`, runner user ID
- recipient snapshot, pricing/policy snapshot, `createdAt`, `reversedAt`

Index อย่างน้อยที่ `(createdAt)`, `(beneficiaryUserId, createdAt)`, `(tenantId, createdAt)`, `(skillId, createdAt)`, `(runId)` และ foreign keys ที่ลบแล้วไม่ cascade หาย audit

### 6.4 Success flow

เมื่อ provider operation สำเร็จ:

1. ตรวจว่า operation นี้ไม่ถูก auto-refund หรือ refund ไปแล้ว
2. lock/check run idempotency ด้วย `runId`
3. resolve skill, tenant, owner, pricing, system settings และ policy ก่อน charge
4. คำนวณ integer allocation และ validate sum
5. ใน DB transaction เดียวกัน lock user wallet, ตรวจยอด, สร้าง user debit หนึ่งรายการ, สร้าง beneficiary credit transaction ต่อ user ที่รวมยอดแล้ว, insert settlement และ allocation rows
6. update `users.credits` ให้สอดคล้องกับ wallet transaction convention เดิม
7. commit แล้วจึงเผยแพร่ success result

หากขั้นตอนใดล้มเหลว transaction ต้อง rollback ทั้งหมด และห้าม provider run ใหม่เพราะ retry ที่ run เดิมต้องใช้ idempotency เดิม

เครดิตของผู้รับจะเข้ากระเป๋าปกติทันที และ transfer service ต้องถือว่าเป็นเครดิตที่โอนได้เหมือนเครดิตประเภทอื่น โดยไม่แยกยอดเป็น withdrawable-only

### 6.5 User credit history

ฝั่ง runner ต้องเห็นรายการเดียวที่เป็น `skill run` และจำนวนที่ถูกหักรวมจริง พร้อมชื่อ skill, run ID/trace ID, tenant, status และรายละเอียด allocation ใน metadata/detail drawer การเพิ่มเครดิตของผู้รับเป็นรายการ income ของผู้รับเอง ไม่ถูกนำมาแสดงเป็นรายการหักแยกของ runner

ห้ามสร้าง debit หลายรายการแยก tenant/platform/owner ให้ runner เพราะจะทำให้ผู้ใช้เข้าใจผิดว่า run เดียวถูกหักหลายครั้ง

## 7. Refund, reversal, transfer และ debt

### 7.1 ก่อนเพิ่ม revenue

billing service ต้องตรวจสถานะ auto-refund ของ operation จาก authoritative run/credit records ก่อนสร้าง settlement หากพบว่า run ถูก refund แล้ว ให้ไม่สร้าง revenue และไม่ charge ซ้ำ

### 7.2 Refund หลัง settlement

refund ต้อง idempotent และทำใน transaction:

1. lock settlement ด้วย `runId`
2. ถ้า `reversed` แล้ว return no-op พร้อม audit
3. reverse runner debit ตาม convention refund เดิม ไม่สร้าง debit ใหม่
4. reverse beneficiary allocations ตามจำนวนเดิม
5. ถ้าผู้รับยังมีเครดิตพอ ให้หักคืนจาก wallet ของผู้รับและสร้าง reversal transaction ที่อ้าง allocation เดิม
6. ถ้าผู้รับโอนหรือใช้เครดิตไปแล้วจนไม่พอ ห้ามแก้หรือลบประวัติการโอนของเขา ให้สร้าง `credit_debt` หรือ liability ผูกกับ original beneficiary/allocation และบันทึกจำนวนที่ขาด
7. แสดง debt ในหน้ารายได้ของผู้รับ และ block withdrawal อย่างน้อยจน debt เป็นศูนย์; การ block transfer เพิ่มเติมต้องใช้ policy เดียวกันทั้งระบบ ไม่ใช้เฉพาะ UI
8. ปิด debt เมื่อมีเครดิตเข้าใหม่ตาม repayment policy และบันทึก linkage

เพิ่มตาราง `credit_debts` หาก schema ปัจจุบันยังไม่มีที่รองรับอย่างชัดเจน:

- debtor user, original settlement/allocation, principal amount, paid amount, remaining amount
- status `open | partially_paid | settled | waived`
- created/repaid timestamps, reason, actor/audit

การ refund ต้องรักษา invariant ว่า net wallet + open debt + reversed state สะท้อนยอดที่ถูกต้อง และการ refund ซ้ำต้องไม่ทำให้ยอดเปลี่ยนซ้ำ

### 7.3 Future withdrawal

อย่าหักรายได้ออกจาก user อัตโนมัติเมื่อจบรอบเดือน การถอนในอนาคตต้อง:

- สร้าง withdrawal request เมื่อ user กดเท่านั้น
- lock/reserve เครดิตจำนวนที่ขอ
- ไม่อนุญาตถ้ามี open debt หรือยอด available ไม่พอ
- แยก withdrawal/settlement state จาก revenue earned
- มี audit และ idempotency

รายละเอียด payment provider, KYC, และ cash settlement ไม่อยู่ใน scope feature นี้ แต่ schema ต้องไม่ทำให้ revenue credit ถูกบังคับไปอยู่ระบบถอนเงินตั้งแต่แรก

## 8. Service และ API contract

สร้าง service กลางแทนการกระจาย logic ใน executor หลายจุด:

- `resolveSkillRevenueContext({ runId, skillId, tenantId, runnerId })`
- `calculateSkillRevenueAllocations(context)`
- `settleSkillRevenueAfterSuccess(context)`
- `reverseSkillRevenue({ runId, reason, actor })`
- `getSkillRevenueConfig()` / `updateSkillRevenueConfig()`
- `assertSkillBillingSchemaReady()`

ทุก execution path ที่เป็น skill ต้องเรียก service เดียว ได้แก่ native skill, MCP skill, public skill route, media adapter, presentation/vertical-drama integrations และ job retry path ต้องไม่เพิ่ม charge/revenue เองอีก

เพิ่ม router namespace `skillRevenue` อย่างน้อย:

- `getConfig` — admin only; คืน setting, resolved recipients, main tenant, policy version, readiness
- `listEligibleSystemAdmins` — admin only; exact active admins
- `updateConfig` — admin only; validates recipient and writes audit
- `getSummary` — protected; admin sees global, user sees own only
- `listAllocations` — protected; admin filters global, user scope forced to `ctx.user.id`
- `getAllocationDetail` — protected; same scope enforcement
- `getSkillBreakdown` — protected; same scope enforcement

ทุก query ที่ user เรียกต้อง ignore/override client-supplied `beneficiaryUserId` เมื่อไม่ใช่ admin ห้ามอาศัยการซ่อน filter ใน UI

## 9. Skill Revenue Report UI

### 9.1 Route และกลุ่มผู้ใช้

สร้างหน้า `/skill-revenue` ใน authenticated app:

- admin เห็น dashboard รวมทุก tenant, ทุก skill, ทุก beneficiary
- user ทั่วไปเห็นเฉพาะ allocation ที่ `beneficiaryUserId = currentUser.id`
- runner ที่ไม่ได้เป็น beneficiary ไม่เห็นรายได้ของผู้อื่น และไม่เห็น platform/tenant/skill owner rows ของ run ที่ตนเองไม่ได้รับ

ไม่เพิ่ม route public และไม่ทำ mockup

### 9.2 Filter และ summary

ค่าเริ่มต้นคือเดือนปัจจุบันตาม timezone ที่ระบบกำหนด และเลือกได้:

- date from / date to แบบ inclusive ชัดเจน
- skill
- tenant (admin only)
- beneficiary type
- status `earned | reversed | debt_pending`
- pagination และ sort ตาม createdAt

summary ต้องแสดงอย่างน้อย:

- จำนวน skill runs
- gross credits ที่ user จ่าย
- platform credits
- system recipient credits
- tenant owner credits
- skill owner credits
- reversed credits และ open debt

ตัวเลข summary ต้อง query จาก settlement/allocation ledger ไม่รวมยอดด้วยการนับ `credit_transactions` แบบเดาสุ่มที่อาจรวม transfer หรือ refund ซ้ำ

### 9.3 Breakdown และ transaction detail

มีตาราง/ส่วนสรุปตาม:

- skill: จำนวน run, gross, platform, recipient allocations
- tenant: จำนวน run, gross, platform, tenant pool
- beneficiary: user, role, earned, reversed, open debt

รายละเอียด transaction ต้องมี:

- timestamp, runId/traceId
- skill name/slug
- runner user (mask ตาม privacy convention)
- tenant
- gross, platform, distribution pool
- beneficiary role/user และจำนวนเครดิต
- policy/pricing snapshot
- status/refund/debt link

ให้ reuse interaction pattern จาก `UsageAnalytics` เช่น `DateRangeSelector`, summary cards, breakdown table และ detail dialog แต่ใช้ data source ใหม่ และต้องมี loading, empty, error, stale-schema, permission-denied, และ pagination states

### 9.4 Responsive/accessibility contract

ต้องตรวจอย่างน้อยที่ viewport 390x844, 768x1024, 1280x800 และ 1440x900:

- ตารางกว้างต้องมี mobile card/row detail ที่ยังอ่านจำนวนเครดิตและ skill ได้ครบ
- ไม่ตัดชื่อ skill, recipient, หรือ status จน audit ไม่ได้; ให้ wrap หรือเปิด detail
- filter ใช้ keyboard ได้, มี accessible label, focus state และ live region สำหรับ save/error
- จำนวนเครดิตเป็น integer พร้อม locale formatting แต่ไม่เติมทศนิยม
- Admin Skills pricing/config panel และ report ใช้คำและสี status ชุดเดียวกัน

## 10. Admin Skills UI และ bug state

### 10.1 Pricing/routing panel

ในหน้า Admin Skills เดิม ให้เพิ่ม inline edit ที่แต่ละ skill และส่วน global system revenue settings:

- tenant cost
- skill owner cost
- gross preview
- skill owner type/system label
- main/non-main preview ของ platform split
- resolved recipient สำหรับ system/platform
- link ไป Skill Revenue Report

แก้ไขสำเร็จแล้ว invalidate skill list และ pricing preview; ไม่ต้อง reload ทั้งแอป

### 10.2 Global system recipient panel

วางในหน้าเดียวกันหรือ tab ที่เข้าถึงจากหน้า Admin Skills ได้ทันที:

- list exact active admins
- select system recipient
- select optional platform recipient
- แสดง fallback `admin@smartspec.pro`
- แสดง policy 50/50 และสูตรปัดเศษ
- save audit/error state

ถ้าไม่มี active admin ที่ตรงเงื่อนไข ให้ disable save/run ที่ต้องใช้ผู้รับ และแจ้งวิธีแก้ ไม่แสดง success ปลอม

### 10.3 แก้ `listFromDb` 500/spinner

implementation ต้อง:

1. เปลี่ยน read path จาก `autoSyncSkillsFromFolder({ force: true })` เป็น normal sync/cache ที่ไม่เขียนทุก request
2. แยก explicit admin action สำหรับ “Sync skill registry now” พร้อม loading/error/success state
3. เรียก `assertSkillBillingSchemaReady()` ก่อน query ที่ใช้ fixed-credit/revenue columns
4. map database/unique constraint/folder sync error เป็น typed tRPC error พร้อม `code`, `retryable`, `migrationRequired`, และ trace ID ที่ไม่เปิดเผย secret
5. Admin UI ต้องแสดง error panel พร้อม retry/sync/migration instruction แทน spinner ค้าง หาก query ล้มเหลว
6. ถ้า schema migration ยังไม่ apply ห้ามแสดงราคาจาก default ใน UI เป็นว่าบันทึกจริงแล้ว; แสดง `Schema update required`
7. migration readiness check ต้องไม่ทำให้ทุก skill list query ยิง schema introspection หนัก ๆ; ใช้ cache/in-process readiness TTL และ invalidate หลัง migration/admin sync

## 11. Database migration และ rollout

คง migration 0247/0248 ที่มีอยู่ และใช้ migration `0249_skill_tenant_cost_historical_average.sql` สำหรับการ initialize tenant cost จาก debit history โดย migration ต้อง:

- ใช้เฉพาะ `credit_transactions` ที่เป็น explicit skill usage debit
- รวม legacy alias ที่มี canonical mapping แล้ว
- คง unresolved slug ไว้เป็น data-quality report ไม่เดาสุ่มผูกกับ skill อื่น
- ไม่แก้ transaction/settlement ย้อนหลังและไม่แก้ skill owner cost

หากมีการขยาย schema เพิ่มเติมใน implementation phase ให้เพิ่ม migration ถัดไปตามเลขจริงของ repository เพื่อ:

- เพิ่ม explicit `ownerType`/system marker
- ขยาย settlement columns/status/policy snapshots
- สร้าง `skill_revenue_allocations`
- สร้าง `credit_debts`
- เพิ่ม system settings seed และ unique constraints
- เพิ่ม indexes/foreign keys แบบไม่ cascade ลบ audit
- เพิ่ม check constraints ให้ amount เป็น integer non-negative และยอดรวมถูกต้อง

ก่อน rollout:

1. ตรวจ migration journal และ database target ให้ตรง environment
2. backup และ dry-run/transactional migration ตาม runbook ของ repo
3. ตรวจ count/constraint/index ก่อนและหลัง
4. seed fallback recipient setting แต่ไม่ assign user ID ที่ไม่มีจริง
5. ทำ readiness check ใน app
6. เปิด billing หลัง migration พร้อมเท่านั้น

ห้ามแก้ข้อมูล production หรือ claim ว่า migration apply แล้วจาก local worktree เพียงอย่างเดียว

## 12. Security, correctness และ failure policy

- ทุก settlement ต้องมี authenticated runner, tenant, skill, and resolved beneficiary
- missing identity/tenant/owner/system recipient ให้ fail closed
- exact role boundary ใช้ `role === "admin"`/`adminProcedure`; ห้ามขยายเป็น role ใกล้เคียงโดยอัตโนมัติ
- user report query ต้อง enforce scope server-side
- setting update ต้อง audit และต้องไม่รับ recipient user ID ที่ไม่ได้เป็น active admin
- lock wallet/settlement ในลำดับคงที่เพื่อลด deadlock
- idempotency key ต้องครอบคลุม success retry, provider retry, job retry, and refund retry
- provider dispatch ต้องไม่เกิดถ้า pre-charge revenue context ไม่พร้อม
- transaction rollback ต้องไม่ทิ้ง beneficiary credit โดยไม่มี runner debit หรือกลับกัน
- amount ทุกชั้นเป็น integer; schema, zod, SQL check, และ service validation ต้องสอดคล้องกัน
- ไม่ log access token, prompt secret, หรือข้อมูล payment
- transfer ไม่ลบ provenance ของ earned allocation; report ต้องยัง trace กลับไปที่ original run

## 13. Test plan และ acceptance criteria

### 13.1 Unit tests

- default 2/0 และ validation integer/non-negative
- main tenant vs non-main tenant
- system vs user-owned skill
- gross 0, 1, 2, 3, 4, odd/even splits
- 50/50: `ceil(total/2)` และ sum invariant
- proportional pool 2/2, 1/1, 2/0, zero weights
- same beneficiary roles merge wallet transaction แต่ไม่ merge allocation role
- explicit recipient, fallback email, disabled/missing recipient, no admin
- policy snapshot immutability

### 13.2 Service/integration tests

- one success creates exactly one runner debit, expected beneficiary credits, one settlement, allocations, and matching references
- retry same run is no-op
- concurrent same run cannot double settle
- provider success followed by auto-refund creates no revenue
- refund once reverses all; refund twice is no-op
- recipient with transferred/spent credits produces debt, preserves transfer history, blocks withdrawal
- failed transaction rolls back all wallets/rows
- every skill execution entry point uses central settlement service and does not charge twice
- missing tenant/owner/recipient fails before provider dispatch and before charge

### 13.3 Router/security tests

- unauthenticated request rejected
- exact admin can read/update config and global report
- non-admin can read only own allocations
- non-admin cannot widen scope with `beneficiaryUserId`, tenant, or user filter
- disabled admin cannot be assigned
- report filters/pagination/sorting do not leak another tenant/user

### 13.4 UI tests

- Admin Skills shows pricing and system recipient controls
- save success/error and invalid integer states
- listFromDb typed 500/migration-required state renders actionable panel, not infinite spinner
- report loading/empty/error/permission states
- integer formatting and odd split preview
- responsive table/card behavior and keyboard labels

### 13.5 Five-round verification loop

ต้องบันทึกผลแยกอย่างน้อย 5 รอบก่อนปิดงาน:

1. registry/schema: ทุก skill มี owner type และ pricing; migration/readiness ผ่าน
2. routing/config: system recipient, fallback, platform 50/50, main-tenant exemption ถูกต้อง
3. success/idempotency: charge และ revenue credit atomic, integer, ไม่ซ้ำ
4. refund/transfer/debt: auto-refund guard, reversal, transfer provenance, debt/withdrawal guard
5. UI/report/security: Admin Skills, credits history, report scope, error state, responsive/accessibility

แต่ละรอบต้องมี command/test evidence; ถ้าเป็น production/browser evidence ต้องระบุชัดว่าได้ทำจริงหรือยังไม่ได้ทำ

### 13.6 Definition of done

ถือว่าเสร็จเมื่อ:

- code paths ทั้งหมดเรียก central settlement service เดียว
- fixed-credit default/edit/admin UI ใช้งานได้
- system/platform recipient config และ fallback ใช้งานได้
- integer allocation ผ่าน invariant และไม่มีทศนิยม
- wallet credit เข้าและโอนได้ทันที
- refund และ debt ปิดช่องยอดติดลบ/ยอดหายตาม policy
- report และ credit history แสดงผลตามสิทธิ์
- Admin Skills ไม่ spinner ค้างจาก error และมี typed readiness error
- migrations, focused tests, `git diff --check`, และการตรวจที่เกี่ยวข้องผ่าน
- production migration/browser/deployment evidence ถูกแยกเป็น completed หรือ pending อย่างตรงไปตรงมา

## 14. Implementation order

1. schema/migration/readiness และ explicit skill owner type
2. central integer allocation/settlement/refund/debt service พร้อม tests
3. integrate ทุก skill execution path และลบ duplicate charge logic
4. system/platform settings และ admin router
5. Admin Skills pricing/routing/error-state UI
6. report router/page และ user/admin scope tests
7. five-round verification, migration rehearsal, focused build/tests, และ deployment handoff

## 15. Known constraints and out-of-scope items

- ยังไม่มีการยืนยัน production database migration หรือ authenticated browser replay ใน environment นี้ (`DATABASE_URL`/production session ไม่พร้อม)
- ไม่รวมการ deploy, payment provider, KYC, cash withdrawal implementation, หรือการเปลี่ยน RBAC นอก exact admin boundary
- ไม่รวมการเปลี่ยนราคา skill เดิมย้อนหลัง; migration ต้อง preserve ค่าเดิมและเติม default เฉพาะ row ที่ไม่มีค่าอย่างปลอดภัย
- ถ้า codebase มี transfer/debt convention เดิมที่ดีกว่า ให้ reuse เป็น source of truth แต่ต้องรักษา invariants และ acceptance criteria ของเอกสารนี้

## 16. Mapping กับฐานโค้ดปัจจุบัน

จุดต่อ implementation ที่ค้นพบแล้วและต้องใช้เป็น boundary เดียวกัน:

- schema และ migration fixed-credit ปัจจุบันอยู่ใน `apps/web/drizzle/schema.ts`, `0247_skill_fixed_credit_revenue.sql`, และ `0248_skill_revenue_integrity_and_internal_registry.sql`
- central billing ที่มีอยู่แล้วคือ `apps/web/server/services/skillRevenueBilling.ts`; ให้ขยาย service นี้หรือแยก module ที่มี public contract ชัดเจน โดยไม่สร้าง charging path คู่ขนาน
- execution integrations ที่ต้อง audit ต่อคือ `skillExecutor`, MCP registry/public skill routes, media/presentation/vertical-drama adapters และ billing jobs
- `apps/web/server/routers/skills.ts` มี `listFromDb` และ admin pricing mutations; แก้ forced sync/readiness/error mapping ใน boundary นี้
- `apps/web/client/src/pages/AdminSkills.tsx` เป็น surface หลักของ pricing, recipient config และ migration error state
- `apps/web/client/src/pages/UsageAnalytics.tsx` เป็น interaction/reference pattern สำหรับ date filters, summary cards, breakdown table และ detail dialog; report ใหม่ต้องใช้ data contract ใหม่ของ `skillRevenue`
- existing `usage` router เป็น reference ด้าน exact-admin user listing และ scope pattern แต่ห้ามใช้ provider usage rows แทน revenue allocations

mapping นี้เป็น discovery guidance ไม่ใช่การอนุญาตให้แก้ unrelated dirty worktree files; ก่อน refactor shared exports ให้ทำ impact check และแก้เฉพาะ paths ที่อยู่ใน implementation order

## 17. Internal review record

ตรวจทบทวน spec 5 รอบหลังเขียนเสร็จ:

1. Completeness: ครบ pricing, system recipient, main/non-main routing, wallet, transfer, refund, debt, report, UI, migration, tests และ rollout evidence
2. Consistency: ยืนยันว่า platform ใช้ `ceil(total/2)`, pool ใช้ส่วนที่เหลือ, ทุกจำนวนเป็น integer และเครดิตรายได้เข้ากระเป๋าทันที ไม่ขัดกับข้อเสนอ pending เดิม
3. Clarity: ระบุ owner type แบบ explicit, fallback email, fail-closed conditions, exact admin boundary, server-side report scope และ route `/skill-revenue`
4. Correctness/security: เพิ่ม idempotency, row locking, atomic rollback, auto-refund guard, debt เมื่อยอดผู้รับไม่พอ และห้ามย้ายเครดิตออกจาก wallet อัตโนมัติ
5. Operability/UI: ระบุ readiness cache, typed error แทน spinner, explicit sync action, responsive/accessibility states, five-round evidence และแยก production proof ที่ยัง pending

ผล review: พร้อมเข้าสู่ implementation planning โดยไม่มี TODO/TBD หรือ policy ที่ต้องถามผู้ใช้อีกใน scope นี้

## 18. Operational backfill result (2026-08-24)

รันกับ local database ที่อยู่ใน `.env` โดยเปลี่ยน host จาก Docker service name เป็น `127.0.0.1` เฉพาะสำหรับการตรวจ/อัปเดตครั้งนี้:

- history ที่เข้าเงื่อนไข: 2,288 debit rows จาก 40 raw skill slugs
- canonical skill rows ที่ resolve ได้: 38 rows
- legacy alias ที่รวมเข้า canonical แล้ว: `elevenlabs-beauty-dialogue` → `elevenlabs-product-voiceover-dialogue`
- unresolved history slug: `create-image-prompt` จำนวน 3 rows; ไม่มี canonical row ใน current `skills` registry จึงยังไม่เดา mapping
- rows ที่อัปเดต: 38
- tenant cost ใหม่ทั้งหมดเป็นเลขคู่; owner cost ไม่ถูกแก้
- ผลรวม tenant cost ของ rows ที่อัปเดต: 300
- migration dry-run ผ่านแบบ rollback และแสดง unresolved slug ตามที่คาด

ตัวอย่างค่าที่ได้: `hyperframes-render-prompt` 54, `media-production-plan-verifier` 48, `media-production-storyboard-planner` 44, `product-reference-storyboard-prompt-optimizer` 26, `product-reference-storyboard` 6 โดยค่าทั้งหมดมาจากสูตร 20% ของค่าเฉลี่ยและปัดขึ้นเป็นเลขคู่ ไม่ใช่การแก้ยอดเครดิตย้อนหลัง

สถานะนี้ยืนยันเฉพาะ local database; production ต้อง apply migration 0249 และตรวจ unresolved slug ใน database เป้าหมายก่อนเปิดใช้จริง
