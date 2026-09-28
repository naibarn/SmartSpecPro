# Decision log

## Decision 1 — standard quick plan

ใช้แผนระดับ standard เพราะกระทบ backend router, shared stock lifecycle, client request builders และ tests แต่ยังอยู่ใน bounded Vertical Drama flow ไม่ต้อง promote เป็น full deep-plan

## Decision 2 — backend policy is authoritative

เพิ่ม policy กลางแบบ explicit (`none` / `auto`) และให้ explicit asset id เป็น override ที่ชนะ policy เพื่อป้องกัน client omission และ caller drift

## Decision 3 — contextual defaults

- main portrait default = `none`
- look generation default = `auto`
- variant/twin first render default = `auto` เพื่อ inherited source portrait

การไม่มี field จะไม่ถูกตีความเป็น auto สำหรับ main portrait แบบเงียบ ๆ อีกต่อไป

## Decision 4 — preserve history

ไม่ลบ old primary; ใช้ existing stock demotion/state transition และตรวจให้ replacement มี current primary เพียงรายการเดียว หลัง provider generation สำเร็จเท่านั้น

## Decision 5 — explicit user intent

UI state ที่แสดง current primary เป็น default visual ไม่ถือเป็น explicit selection. เมื่อ user เลือกจาก picker หรือแนบภาพใหม่ ต้องส่ง exact `referenceAssetLinkId`; backend ตรวจ ownership และใช้ asset นั้นไม่ว่า policy จะเป็น `none` หรือ `auto`

## Self-review rounds

### Round 1

- Completeness: ครอบคลุม main, look, variant, history, explicit attachment
- Contradictions: แยก `none` จาก absence และ explicit precedence ชัดเจน
- Security: ownership validation อยู่ backend
- Missing improvement: ต้องตรวจทุก `generateCharacterImage` caller และ sheet compatibility

### Round 2

- [AUTO-FIX] เพิ่ม requirement ให้ sheet path ไม่ถูกเปลี่ยนโดยไม่ตั้งใจ และทดสอบ shared resolver contract

### Round 3

- Completeness: เพิ่ม failure ordering; demote primary หลัง successful generation/link
- Contradictions: explicit id remains usable even when main default is `none`
- Security: reject out-of-scope asset before paid provider call
- Missing improvement: assert persisted task payload, not only UI state

### Round 4

- [AUTO-FIX] ระบุ regression test ว่า look `auto` ต้อง resolve current primary และ main `none` ต้องไม่เรียก primary resolver

### Round 5

- Completeness/security/contradiction review ผ่าน; no additional meaningful auto-fix

### Round 6

- Second clean review: no meaningful [AUTO-FIX]; plan ready for implementation
