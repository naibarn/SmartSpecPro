# Vertical Drama Generated Logo Design

## Goal

ให้ผู้ใช้สร้างโลโก้ PNG พื้นหลังโปร่งใสจากหน้า Vertical Drama Settings แล้วนำภาพที่ผู้ใช้ยืนยันไปแทน watermark/logo ที่ระบบใช้อยู่เดิม โดยรองรับทั้งโลโก้ชื่อเรื่อง (`primary`) และโลโก้ชื่อช่อง (`secondary`).

## Approved decisions

- ใช้เฉพาะ image model ที่เปิดใช้งานและประกาศ capability `supportsTransparentBackground` พร้อมรายละเอียด native input/output ที่ตรวจได้
- prompt ตั้งต้นต้องเป็นข้อความตาม product requirement แบบตรงตัว และผู้ใช้แก้ไขได้
- ต้องยืนยันก่อนเริ่ม generate และต้องยืนยันอีกครั้งหลัง preview ก่อนแทนโลโก้
- โลโก้ช่องต้องถามชื่อช่องใน dialog ก่อนสร้าง prompt
- ภาพที่ยืนยันแล้วต้องคงตำแหน่ง, opacity, scale และ margin ของ watermark slot เดิม และเปลี่ยน slot เป็น image + enabled
- ไม่เพิ่มตารางหรือ migration; ใช้ async media task, credit, polling และ managed-media ledger เดิม

## UX flow

1. ในแต่ละ watermark slot เพิ่มปุ่ม “สร้างโลโก้ด้วย AI”
2. เปิด dialog เลือก model เฉพาะ model ที่รองรับ transparent PNG
3. ถ้าเป็น `secondary` ให้กรอกชื่อช่อง; `primary` ใช้ชื่อ series ที่มีอยู่แล้ว
4. แสดง prompt ตั้งต้น:
   - primary: `สร้าง logo แบบพื้นหลังโปร่งใส สำหรับซีรีย์แนวตั้งเรื่อง " + ชื่อเรื่อง`
   - secondary: `สร้าง logo แบบพื้นหลังโปร่งใส สำหรับชื่อช่องเฟสบุค ชื่อ  " + ชื่อช่อง`
5. ผู้ใช้แก้ prompt ได้ แล้วกดปุ่มยืนยัน generate; ระหว่าง submission/poll ปิด controls และกัน double-submit
6. เมื่อ task completed แสดง preview และรายละเอียด model/prompt พร้อมปุ่ม “ใช้ภาพนี้แทนโลโก้” และ “ยกเลิก”
7. เมื่อยืนยันใช้ภาพ ให้ server ตรวจ task ownership/scope/status/durability แล้วบันทึก watermark slot เดิม

สถานะที่ต้องรองรับ: loading model list, no compatible models, invalid input, confirming, submitting, polling, transient polling retry, generation failure, preview, applying, apply failure และ success.

## Architecture and contracts

### Model discovery

เพิ่ม procedure เฉพาะ Vertical Drama สำหรับ logo generation ที่อ่าน enabled image models, merge static/provider config ตาม pattern เดิม และ filter ด้วย `resolveTransparentBackgroundCapability`. Response ต้องคืน `modelId`, display name, provider, credit cost และ capability ที่ใช้ส่ง provider input เพื่อให้ client ไม่ต้องเดา config.

### Generation

เพิ่ม procedure เฉพาะ Vertical Drama สำหรับเริ่มสร้าง logo. Input ประกอบด้วย `seriesId`, `slotId`, `prompt`, `modelId`, `idempotencyKey`. Server ต้อง:

- require authenticated tenant context และ load series ownership
- ตรวจ model เป็น enabled image model และ capability transparent ที่ verified
- validate prompt length ตาม model limit
- ส่ง async media generation เดิมโดยตั้ง native transparent input จาก capability และ `outputFormat` เป็น capability output (ปัจจุบันต้องเป็น PNG)
- แนบ `__vd_series_id` และ `__vd_purpose: "series_logo"` เพื่อให้ Vertical Drama durability path ingest provider URL เป็น managed URL
- preserve credit reservation/refund/rate-limit/audit semantics ของ media generation เดิม

### Apply

เพิ่ม procedure สำหรับ apply generated logo ที่รับ `seriesId`, `slotId`, `taskId`, `idempotencyKey`. Server re-fetch task ผ่าน unified media boundary และไม่เชื่อ URL ที่ client ส่งมา. ต้อง reject ถ้า task ไม่ได้อยู่ใน tenant/user เดียวกัน, `__vd_series_id` ไม่ตรง, purpose ไม่ใช่ `series_logo`, ยังไม่ completed หรือ result ยังไม่ durable. เมื่อผ่านแล้วจึง patch primary หรือ `secondary` ของ `watermark` โดยคงค่าการจัดวางเดิมและ set `type: "image"`, `enabled: true`, `imageUrl` เป็น managed URL.

การ apply ต้อง idempotent: ถ้า task เดิมถูก apply ซ้ำและ slot มี imageUrl เดิม ให้คืนผลสำเร็จโดยไม่สร้าง side effect ใหม่; ถ้า request กำลังอยู่ในสถานะ pending ให้ client disable ปุ่มจน mutation จบ.

## Error and safety behavior

- model ที่ไม่มี capability หรือถูก disable หลังโหลด list ต้องถูก reject ฝั่ง server
- ห้าม fallback ไป model อื่นโดยเงียบๆ
- prompt ที่ user แก้ไขยังต้องผ่าน max prompt length และ media safety policy เดิม
- provider 429/timeout/5xx ระหว่าง polling ถือเป็น transient; แสดงสถานะกำลังลองใหม่และคง task เดิมไว้ ไม่ refund/fail ซ้ำจากการอ่านสถานะ
- provider terminal failure แสดง error และไม่เปลี่ยน watermark
- ถ้า durability ingest ยังไม่พร้อม ห้ามบันทึก provider URL ลง watermark; ให้รอ/retry หรือแสดง error ที่ทำให้ผู้ใช้กด apply ใหม่ได้
- ownership ใช้ series + tenant + user checks เดิม และไม่เปิดเผย task ของผู้อื่น

## Testing and acceptance

- shared/helper tests: capability filter, native transparent params และ prompt builder
- router tests: model filtering, unsupported-model rejection, tenant/series ownership, task scope/status/durability checks, apply patch preservation และ idempotency
- component tests: prompt exact defaults, channel-name dialog, editable prompt, confirmation gates, disabled/double-submit states, preview/apply/cancel/error states
- focused TypeScript check และ tests ของ Settings/verticalDramaSeries/media capability
- browser verification ของ route Settings อย่างน้อย desktop และ narrow/mobile viewport; live provider/credit/browser authentication smoke ให้รายงานแยกถ้า environment ไม่มี credentials

## Operational notes

ไม่ต้อง deploy migration. ต้องตรวจว่า live `media_models` catalog มีอย่างน้อยหนึ่ง enabled row ที่ capability นี้ถูกตั้งไว้; ถ้าไม่มี UI ต้องแสดง empty state พร้อมคำอธิบาย ไม่เปิดให้เลือก model ที่ไม่รองรับ. Provider generation และ credit consumption เป็น external/runtime proof แยกจาก unit/component tests.
