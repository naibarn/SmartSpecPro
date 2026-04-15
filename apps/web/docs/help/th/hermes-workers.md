---
slug: hermes-workers
title: Hermes Workers
description: ลงทะเบียน personal Hermes bridge worker, เข้าใจ rollout แบบแยกเป็นชั้น, และเลือกใช้ Hermes เทียบกับ OpenClaw หรือ Desktop Host แบบไม่สื่อเกินจริง
icon: Bot
section: admin
order: 88
pages: ["/admin/tenants", "/admin/monitoring", "/teams"]
tags: [hermes, workers, external runtime, rollout, teams, mcp, channel companion]
---

# Hermes Workers

ใช้คู่มือนี้เมื่อคุณต้องการนำ personal Hermes agent เข้ามาเชื่อมกับ SmartSpecPro ผ่าน runtime แบบ `hermes_agent_gateway`

Hermes ไม่ได้ถูกวางตำแหน่งให้เป็นตัวแทน runtime อื่นแบบเงียบ ๆ แต่เป็น external runtime ที่ผู้ใช้เป็นเจ้าของเอง โดยใช้ bridge contract ที่เชื่อมเข้ากับ worker control plane, delegated gateway session, และ bound-worker flow ที่มีอยู่แล้วใน SmartSpecPro

## Hermes คืออะไร

Hermes เหมาะกับกรณี:

- คุณมี personal Hermes agent ที่รันอยู่นอก SmartSpecPro อยู่แล้ว
- ต้องการให้ SmartSpecPro มอง agent ตัวนั้นเป็น bring-your-own external runtime
- ต้องการ owner-bound team handoff ที่คนเดียวกันเป็นเจ้าของทั้ง worker และเครดิตของ SmartSpecPro
- ต้องการ delegated HTTP และเมื่อพร้อมจริงค่อยเปิด delegated MCP ผ่าน worker gateway เดิม
- ต้องการ channel companion ที่ให้ Hermes ถือ token และ session ของแพลตฟอร์มจริงเอง ส่วน SmartSpecPro เก็บเฉพาะ metadata

Hermes ไม่ใช่เส้นทางหลักสำหรับ:

- เส้นทาง delegated external worker ที่เสถียรที่สุดในตอนนี้
- งานบนเครื่อง local ที่ระบบจัดการให้
- การ import state จากระบบ upstream เข้ามาเป็น object ใน SmartSpecPro แบบอัตโนมัติ

ถ้าต้องการกรณีเหล่านี้ ให้เทียบกับ [OpenClaw Workers](./openclaw-workers.md) และ [Desktop Host](./desktop-host.md)

## ควรเลือก Hermes, OpenClaw หรือ Desktop Host เมื่อไร

เลือก Hermes เมื่อ:

- คุณมี Hermes agent ภายนอกที่ดูแลเองอยู่แล้ว
- ต้องการให้ SmartSpecPro ใช้มันเป็น external runtime แบบ bring-your-own
- ยอมรับ rollout แบบเป็นชั้น ๆ ที่อาจเปิด registration ก่อน dispatch และเปิด dispatch ก่อน delegated MCP หรือ channel companion

เลือก OpenClaw เมื่อ:

- ต้องการ external delegated worker path ที่เสถียรที่สุดของ SmartSpecPro ในตอนนี้
- ต้องการ external operator posture ที่มีการใช้งานจริงมากกว่าในตอนนี้
- ไม่ได้ต้องการ semantics ของ channel companion แบบ Hermes

เลือก Desktop Host เมื่อ:

- งานต้องอยู่บนเครื่อง local ที่มีการจัดการโดยระบบ
- ต้องใช้ไฟล์ local, local GPU หรือ device governance
- ต้องการ runtime ฝั่งเดสก์ท็อปที่ SmartSpecPro จัดการเอง แทน agent ภายนอกที่ผู้ใช้ดูแลเอง

## ความจริงเรื่อง rollout ของ Hermes

`hermesAgentRuntime` คือ parent tenant gate โดยความหมายของมันคือระบบยอมให้มี Hermes registration ใน control plane ได้เท่านั้น ไม่ได้แปลว่าทุก surface ของ Hermes เปิดใช้งานแล้ว
gate นี้ยังควบคุมด้วยว่า Hermes จะโผล่เป็นตัวเลือกที่ bind ได้ใน Teams หรือไม่ ถ้า gate ปิด ระบบจะ fail-closed ทั้งการลงทะเบียน การแสดงรายการ และการ bind

SmartSpecPro แยก rollout ของ Hermes เป็นชั้นดังนี้:

1. `registration`
   Hermes worker ลงทะเบียนและแสดงใน monitoring ได้
2. `bound_dispatch`
   งาน follow-up แบบ owner-bound จะถูก queue ได้ก็ต่อเมื่อ worker รายงานว่า:
   `apiServerEnabled=true`, `supportsDelegatedHttp=true`, และ `supportsBoundConnector=true`
3. `delegated_mcp`
   delegated MCP จะถือว่าใช้ได้จริงก็ต่อเมื่อ worker ตัวเดียวกันรายงานเพิ่มว่า `supportsDelegatedMcp=true`
4. `channel_companion`
   การแสดง channel companion จะเปิดได้ก็ต่อเมื่อ worker รายงาน `supportsCallbacks=true` และมี `gatewayPlatforms` ที่ sanitize แล้วอย่างน้อย 1 ค่า

จุดสำคัญ:

- เปิด registration ก่อนได้โดยยังไม่เปิด dispatch
- เปิด dispatch ก่อนได้โดยยังไม่เปิด delegated MCP
- เปิด dispatch ก่อนได้โดยยังไม่เปิด channel companion
- ถ้า parent gate ยังปิด หรือ worker ไม่รายงาน capability ครบ ระบบจะ fail-closed

## พฤติกรรมของ Bound Worker

Hermes ใช้โมเดล **External Connector** และ **Bound Worker** เดิมในหน้า **Teams** โดยไม่สร้าง member kind ใหม่

guardrail ปัจจุบันคือ:

- bound worker ต้องอยู่ tenant เดียวกัน
- bound worker ต้องเป็นของ owner คนเดียวกัน
- worker ต้องรายงาน `supportsBoundConnector=true`
- worker ที่ถูก disable จะ bind ไม่ได้
- SmartSpecPro แสดงเฉพาะ channel companion label ที่ sanitize แล้ว เช่น `telegram` หรือ `discord` โดยไม่เปิดเผย secret ของแพลตฟอร์มจาก Hermes

## Delegated gateway และ MCP

delegated session ของ Hermes ยังอยู่ภายใต้ worker gateway contract เดิม

ให้ใช้ delegated manifest เป็นแหล่งความจริงของแต่ละ job:

- HTTP ใช้ได้หรือไม่ขึ้นกับ delegated HTTP support ของ Hermes และความพร้อมของ API server
- MCP ใช้ได้หรือไม่ขึ้นกับทั้ง dispatch readiness และ `supportsDelegatedMcp=true`
- callback target ยังผูกกับ worker callback routes เดิม

อย่าคิดว่า MCP เปิดใช้ได้เพียงเพราะ Hermes ลงทะเบียนสำเร็จ

## ขอบเขตของ callback และ channel companion

channel companion ของ Hermes เป็น metadata-first:

- SmartSpecPro รู้เพียงว่า worker ประกาศ channel family อะไรมาผ่าน `gatewayPlatforms`
- Hermes เป็นผู้ถือ token, session, และ state จริงของช่องทางนั้น
- SmartSpecPro แสดงเฉพาะ label ที่ sanitize แล้วเพื่อใช้เป็นบริบทในมุมมองของทีมและ operator

Hermes ต้องส่ง callback ผ่าน worker runtime routes เดิมเท่านั้น:

- `POST /api/worker-jobs/:jobId/publish-room-update`
- `POST /api/worker-jobs/:jobId/publish-workflow-update`
- `POST /api/worker-jobs/:jobId/publish-user-notification`

route เหล่านี้ยังต้องใช้ `worker_execution` token, scope `workers:report`, idempotency key และการป้องกัน callback link/payload แบบเดิมทั้งหมด

## นโยบาย remote endpoint

ค่าเริ่มต้นของ Hermes API server URL ต้องเป็น loopback เท่านั้น

ถ้าจะใช้ Hermes API endpoint แบบ public หรือ non-loopback อื่น ๆ operator ต้องอนุมัติ exception แบบ audited ก่อนเสมอ โดย exception ต้องมี:

- exception ID ที่ตรวจสอบย้อนหลังได้
- เหตุผลทางธุรกิจว่าทำไมต้องเปิด non-loopback endpoint
- ข้อมูล owner และ tenant ที่ได้รับผลกระทบ
- แผน rollback เพื่อกลับไปใช้ loopback-only mode

ถ้ามีการอนุมัติ exception แล้ว endpoint นั้นยังต้องใช้ `https` เท่านั้น; SmartSpecPro จะปฏิเสธ remote `http` แม้มี exception ID ก็ตาม
SmartSpecPro จะบันทึก exception ID ลงใน worker audit และ control-plane metadata ด้วย เพื่อให้ operator ตรวจสอบย้อนหลังได้ว่าทำไมจึงอนุมัติ exception นี้
SmartSpecPro จะ normalize base URL ก่อนบันทึก ดังนั้นให้กรอก endpoint แบบ canonical ที่ต้องการ audit

ถ้ายังอธิบายและ audit exception นี้ไม่ได้ ก็ไม่ควรใช้ remote Hermes API endpoint

## การย้ายจาก OpenClaw มาสู่ Hermes

ถ้าคุณใช้ Hermes upstream อยู่แล้วและเคยใช้ flow แบบ OpenClaw มาก่อน แนวทาง onboarding ที่ปลอดภัยที่สุดคือ:

1. คง OpenClaw worker เดิมไว้ก่อนระหว่างทดสอบ Hermes bridge
2. ลงทะเบียน Hermes เป็น worker แยก แล้วตรวจ monitoring, delegated manifest และ callback behavior
3. bind Hermes เฉพาะ connector ที่ต้องการย้ายก่อน
4. ยืนยัน owner-bound dispatch, callback publishing และ channel companion label ให้เรียบร้อยก่อนขยายการใช้งาน
5. drain หรือเลิกใช้ worker เดิมหลังจากเส้นทาง Hermes เสถียรแล้วเท่านั้น

ข้อจำกัดของ onboarding lane นี้:

- SmartSpecPro ไม่ได้สัญญาว่าจะ import session, prompt, channel token หรือ state จาก OpenClaw upstream เข้ามาเป็น object ของ Hermes แบบอัตโนมัติ
- การย้ายเป็นกระบวนการเชิงปฏิบัติการและทำด้วยมือ ไม่ใช่ฟีเจอร์แปลงข้อมูลแบบเงียบ ๆ

## เช็กลิสต์สำหรับ operator

ก่อนเปิด Hermes ให้ tenant:

1. เปิด `hermesAgentRuntime`
2. ยืนยันว่า worker รายงาน loopback API server URL ถ้ายังไม่มี audited `https` exception
3. ตัดสินใจก่อนว่าจะเปิดแค่ registration หรือจะเปิด bound dispatch, delegated MCP หรือ channel companion ด้วย
4. ตรวจว่ารายงาน capability ของ worker ตรงกับ rollout stage ที่ต้องการ
5. ตรวจ monitoring, credits, callback audit trail และ metadata ของ remote-endpoint exception ให้ครบ

คู่มือที่เกี่ยวข้อง:

- [OpenClaw Workers](./openclaw-workers.md)
- [Desktop Host](./desktop-host.md)
