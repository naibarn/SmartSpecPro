# Worker App runtime compatibility and update flow

## Goal

ทำให้ผู้ใช้แยกได้ทันทีว่า Worker App เชื่อมต่อสำเร็จหรือไม่ และแยกสถานะ
"เชื่อมต่อแล้ว" ออกจาก "พร้อมรับงาน render" อย่างชัดเจน พร้อมทำให้การยืนยัน
runtime update เป็น workflow ที่จบจริงหรือรายงานความล้มเหลวจริง ไม่จบด้วยการเปิด
terminal แล้วปล่อยให้ผู้ใช้เดาเอง.

## Scope

- Worker App หน้า Connection/hero/readiness
- การแสดง token expiry และ connection health
- Runtime update สำหรับ runtime pack และ Managed WSL
- Worker loop admission และ compatibility messaging
- การตรวจซ้ำหลัง update และการกลับมารับงานโดยไม่ต้อง reconnect ถ้า credentials
  ยัง valid

ไม่รวมการเปลี่ยน schema ฐานข้อมูลหรือการเปลี่ยน producer ของ Remotion job ในงานนี้.

## Design

### 1. Explicit worker states

UI จะคำนวณสถานะจากข้อมูลจริงหลายชุด ไม่ใช้ `connectionState` เพียงตัวเดียว:

1. `Not connected` — ไม่มี saved connection
2. `Approval pending` — รอ browser approval
3. `Connected, checking access` — มี credentials แต่กำลังตรวจ server
4. `Connected, access valid` — token ใช้งานได้และ heartbeat/refresh ทำงาน
5. `Connected, render paused` — access ใช้ได้ แต่ app/runtime/doctor ยังไม่พร้อม
6. `Ready to receive jobs` — access valid, doctor ready, version policy ผ่าน และ loop ทำงาน
7. `Connection expired` / `Connection rejected` — ต้อง reconnect เพราะ refresh/access ใช้ไม่ได้

หน้าแรกจะแสดง state หลัก 1 ค่า พร้อมเหตุผลและ `checkedAt` เสมอ โดยมีปุ่ม action
ตาม state เท่านั้น. ปุ่ม `Reconnect` จะไม่แสดงในสถานะ connected ปกติเป็นข้อความที่
ทำให้เข้าใจว่า reconnect จำเป็น.

### 2. Expiry is always visible

แสดงข้อมูลต่อไปนี้ใน Connection panel เมื่อเปิดได้:

- expiry ที่เร็วที่สุดของ execution/upload token
- เวลาที่ตรวจล่าสุด
- เวลาที่เหลือ และระดับ `normal`, `expiring soon`, `expired`
- ถ้า server ไม่ส่ง expiry claim ให้แสดง `Server did not report an expiry`
  ไม่ซ่อนข้อความ

เมื่อยังไม่เคยตรวจ health ให้แสดง `Not checked yet` แทนการหายไปของข้อความ.

### 3. Compatibility policy

แยก compatibility เป็น capability/version contract:

- Worker App protocol เก่าที่ยังรองรับ protocol และ job capability เดิม รับงานเดิมได้
- Runtime contract ใหม่ไม่บังคับหยุด worker ทั้งหมด แต่ scheduler จะไม่ส่งเฉพาะงาน
  ที่ worker ยืนยันว่าไม่รองรับ
- Worker heartbeat ต้องเผยแพร่ installed runtime, platform contract และ capability
  readiness ที่เป็นจริง
- Server rejection/queue reason ต้องบอกว่าไม่ตรงที่ `app`, `runtime`, `contract`,
  หรือ `doctor`, ไม่ใช้เพียง `waiting for worker`
- App update จะเป็น required เฉพาะเมื่อมี incompatibility ที่พิสูจน์ได้หรือมี
  security/operational policy ที่ระบุชัด; network failure ของ update check จะไม่
  ทำให้ connection ที่ดีถูกแสดงเป็นเสีย

### 4. Runtime update is a complete transaction

เมื่อผู้ใช้ยืนยัน download:

1. เปลี่ยน UI เป็น `Downloading` และ disable action ซ้ำ
2. เรียก installer ที่รอผลจริง ไม่ถือว่าเปิด terminal = download สำเร็จ
3. installer ตรวจ archive size, SHA-256, extracted manifest และ runtime profile hash
4. Managed WSL ต้องส่งผลลัพธ์กลับหลัง script จบ; ถ้าจำเป็นต้องเปิด terminal เพราะ
   sudo/WSL interaction ให้ UI ระบุ `Waiting for terminal setup` และรอ marker/status
   ที่ตรวจสอบได้
5. ตรวจ runtime update ใหม่และ run full doctor อัตโนมัติ
6. ถ้า ready ให้ล้าง warning, persist `renderUpdateBlocked=false`, refresh heartbeat
   และ restart worker loop เดิมโดยไม่บังคับ reconnect
7. ถ้าไม่พร้อม ให้คง warning พร้อม step ที่เหลือและ error จริง; ห้ามแสดง success

### 5. Failure handling

- download/network error: แสดง retry ได้และเก็บ runtime เดิมไว้
- checksum/manifest mismatch: ไม่ activate runtime ใหม่ และแสดง failure
- setup terminal ปิดก่อนจบ: แสดง incomplete พร้อมให้ retry
- doctor warn/error: แสดง check ที่ fail และผลกระทบต่อ job family
- refresh token หมดอายุ/ถูก revoke: เปลี่ยนเป็น connection error และแสดง Reconnect
- version check offline: แสดง `Update check unavailable` แยกจาก `Update required`

## Verification

- UI state tests ครอบคลุม connected/expired/unknown-expiry/paused/ready
- update flow tests ครอบคลุม confirm -> install -> recheck -> ready และ failure
- Rust tests ครอบคลุม runtime install/manifest/doctor และ compatibility payload
- Worker App typecheck, Vite build และ Rust test suite
- `git diff --check`

## Trade-offs

ใช้การตรวจซ้ำและสถานะที่ persist แทนการเดาจากปุ่มหรือข้อความ transient ทำให้ flow
ชัดเจนและ recover ได้ แต่เพิ่ม state ที่ต้องทดสอบ. สำหรับ Managed WSL การให้ app
รอ process/marker มีความชัดเจนกว่าการ spawn terminal แล้ว polling แบบไม่มีผลลัพธ์
แต่ต้องรักษา fallback สำหรับเครื่องที่ต้องตอบ sudo ใน terminal.
