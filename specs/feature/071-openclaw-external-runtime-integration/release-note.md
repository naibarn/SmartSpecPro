# Feature 071 Release Note

## OpenClaw External Runtime Integration

Release date: 2026-04-06  
Status: Ready for internal rollout  
Default rollout mode: Disabled by default per tenant

---

## ภาษาไทย

### สรุปสั้น ๆ

SmartSpecPro รองรับการเชื่อมต่อ **OpenClaw worker ภายนอก** แล้วในฐานะ external runtime สำหรับงาน agent ที่อยู่นอก desktop worker เดิม โดยแอดมินสามารถเปิดใช้เป็นราย tenant, มองเห็น worker จากหน้า Monitoring, ผูก worker เข้ากับทีม, ตรวจเครดิตที่เกิดจาก worker และทำ cleanup ข้อมูล worker เก่าได้

### ฟีเจอร์ใหม่ที่เพิ่มเข้ามา

- รองรับ external worker runtime แบบ `openclaw_gateway`
- มี worker control plane สำหรับ register, heartbeat, claim job, diagnostics และ artifact flow
- มีแผง **Claw Workers** ในหน้า **Admin Monitoring**
- มีคำสั่งจัดการ worker:
  - `Inspect`
  - `Drain`
  - `Disable`
  - `Resume`
  - `Revoke`
- มีปุ่ม **Redact Legacy Data** สำหรับ cleanup ข้อมูล worker เก่าที่ถูกเก็บก่อนกฎ redaction ปัจจุบัน
- ในหน้า **Teams** สามารถผูก **External Connector** เข้ากับ **Bound Worker** ได้
- ในหน้า **Credits** แยก transaction จาก worker เป็น `Worker Runtime` หรือ `รันผ่าน Worker`
- มี help docs ใหม่ทั้งไทยและอังกฤษสำหรับการตั้งค่าและใช้งานจริง

### เหมาะกับงานแบบไหน

เหมาะกับ:

- งานผู้ช่วยที่รันจากระบบภายนอก
- งานที่ใช้ browser หรือ tool เยอะ
- งาน agent ที่ใช้เวลานาน

ยังไม่ใช่เส้นทางหลักสำหรับ:

- local Windows file jobs
- desktop GPU/media render
- งานที่ต้องวิ่งผ่าน SmartSpec Desktop + ZeroClaw โดยตรง

### ใครต้องทำอะไรบ้าง

#### Tenant Admin

ต้องทำ:

1. เปิด feature flag `openClawExternalRuntime` ใน **Admin Tenants**
2. ตรวจว่า worker ลงทะเบียนสำเร็จแล้ว
3. เปิดหน้า **Admin Monitoring** แล้วเช็กว่า worker ออนไลน์

#### Team Owner / Operator

ต้องทำ:

1. ไปที่หน้า **Teams**
2. เพิ่มหรือแก้สมาชิกแบบ **External Connector**
3. ตั้งค่า:
   - `External Reference` ให้เป็นรหัสอ้างอิงที่ทีมเข้าใจตรงกัน
   - `Bound Worker` ให้ชี้ไปยัง worker ที่ต้องรับงาน
4. ทดลองรันงานและตรวจว่าเครดิตขึ้นถูกต้อง

#### Platform Operator

ควรเช็ก:

- ตัวแปร `OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED` ต้องไม่เป็น `false`
- ถ้า environment นี้เคยมีข้อมูล worker จาก build เก่า ให้กด **Redact Legacy Data** หนึ่งครั้ง

### ขั้นตอนเปิดใช้งานที่แนะนำ

1. เปิด `openClawExternalRuntime`
2. ให้ worker register เข้าระบบ
3. ตรวจ worker จากหน้า **Admin Monitoring**
4. ผูก **Bound Worker** ในหน้า **Teams**
5. ทดสอบ run จริง
6. ตรวจเครดิตในหน้า **Credits**
7. ถ้ามีข้อมูลเก่า ให้กด **Redact Legacy Data**

### สิ่งที่ทีมจะเห็นใน UI

- **Admin Tenants**: มี flag `OpenClaw External Workers`
- **Admin Monitoring**: มีการ์ด `Claw Workers` พร้อมปุ่มควบคุมและปุ่ม Help
- **Teams**: สมาชิกแบบ External Connector สามารถเลือก `Bound Worker`
- **Credits**: รายการใช้งานผ่าน worker แสดงแยกชัดเจน

### Guardrails และความปลอดภัย

ฟีเจอร์นี้ถูกวาง guardrails ไว้แล้วในรอบ implement นี้:

- เปิดใช้แบบ tenant-by-tenant
- มี worker-bound auth และ token scoping
- มี redaction สำหรับ diagnostics, payloads และ metadata
- มี controls สำหรับ drain, disable และ revoke
- มี kill switch ระดับระบบผ่าน `OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED`
- cleanup ข้อมูลเก่าเป็น tenant-scoped เพื่อลดความเสี่ยงกระทบข้าม tenant

### ข้อจำกัดที่ควรรู้

- ปิดไว้ก่อนเป็นค่าเริ่มต้น ต้องเปิด flag เอง
- ถ้า `Bound Worker` ยังไม่ถูกตั้ง งานอาจ pause หรือไม่ถูกส่งไปยัง worker ที่ต้องการ
- OpenClaw path นี้ไม่ได้ออกแบบมาแทน desktop media worker
- ถ้าปิด dispatch ระดับระบบไว้ งานใหม่จะไม่ถูกส่ง แม้ worker จะออนไลน์
- `Bound Worker` เป็นการกำหนดเส้นทางงาน ไม่ใช่การให้สิทธิ์ API/MCP อัตโนมัติ
- media generation ผ่าน MCP ยังไม่ครบ end-to-end; ถ้าต้องการ generate ภาพหรือวิดีโอตอนนี้ ให้ใช้ HTTP media API เป็นหลัก

### เอกสารอ้างอิงสำหรับทีม

- Spec: [spec.md](/home/dev/projects/SmartSpecPro/specs/feature/071-openclaw-external-runtime-integration/spec.md)
- Release note นี้: [release-note.md](/home/dev/projects/SmartSpecPro/specs/feature/071-openclaw-external-runtime-integration/release-note.md)
- Expansion roadmap: [worker-platform-expansion-roadmap.md](/home/dev/projects/SmartSpecPro/specs/feature/071-openclaw-external-runtime-integration/worker-platform-expansion-roadmap.md)
- Help EN: [openclaw-workers.md](/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/openclaw-workers.md)
- Help TH: [openclaw-workers.md](/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/openclaw-workers.md)

### ข้อความสั้นสำหรับส่งในทีม

ปล่อยฟีเจอร์ OpenClaw External Runtime แล้วสำหรับ internal rollout โดยเปิดใช้แบบราย tenant ผ่าน `openClawExternalRuntime` ฟีเจอร์นี้เพิ่ม worker monitoring/control, team binding ด้วย Bound Worker, credit visibility และ cleanup ข้อมูล worker เก่า ถ้าทีมไหนจะเริ่มใช้ ให้เปิด flag, ตรวจ worker ใน Admin Monitoring, ผูก External Connector กับ Bound Worker ใน Teams และทดสอบเครดิต/dispatch ก่อนใช้งานจริง

---

## English

### Short summary

SmartSpecPro now supports **external OpenClaw workers** as a separate runtime class for supported agent tasks. Admins can enable the feature per tenant, monitor workers from Admin Monitoring, bind workers to team connectors, review worker-related credits, and clean up older worker records when needed.

### What shipped

- Support for the `openclaw_gateway` external runtime
- Worker control plane for registration, heartbeat, job claim, diagnostics, and artifact flow
- A new **Claw Workers** panel in **Admin Monitoring**
- Worker actions:
  - `Inspect`
  - `Drain`
  - `Disable`
  - `Resume`
  - `Revoke`
- A **Redact Legacy Data** action for older worker diagnostics and artifact metadata
- Team binding through **External Connector** plus **Bound Worker**
- Credit history entries for worker execution as `Worker Runtime`
- New practical help docs in both English and Thai

### Best-fit use cases

Best for:

- remote assistant tasks
- browser-heavy or tool-heavy tasks
- longer-running external agent work

Not the primary path for:

- local Windows file access
- desktop GPU or media rendering
- SmartSpec Desktop + ZeroClaw machine-local workloads

### Who needs to act

#### Tenant Admin

1. Enable the `openClawExternalRuntime` feature flag in **Admin Tenants**
2. Confirm at least one worker has registered
3. Check **Admin Monitoring** to verify the worker is online

#### Team Owner / Operator

1. Open **Teams**
2. Add or edit an **External Connector**
3. Set:
   - `External Reference` to the connector's stable ID or name
   - `Bound Worker` to the worker that should receive the work
4. Run a test flow and confirm the credits look correct

#### Platform Operator

Check that:

- `OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED` is not set to `false`
- **Redact Legacy Data** is run once if the environment previously stored older worker records

### Recommended rollout sequence

1. Enable `openClawExternalRuntime`
2. Register the worker
3. Verify the worker in **Admin Monitoring**
4. Bind the worker in **Teams**
5. Run a real test flow
6. Check **Credits**
7. Run **Redact Legacy Data** once if older records exist

### What teams will see in the UI

- **Admin Tenants**: `OpenClaw External Workers` feature flag
- **Admin Monitoring**: `Claw Workers` card with controls and Help
- **Teams**: External Connector members can select a `Bound Worker`
- **Credits**: worker execution shows as a distinct source

### Safety and rollout guardrails

This feature now includes:

- tenant-by-tenant rollout gating
- worker-bound auth and scoped tokens
- payload, diagnostics, and metadata redaction
- drain, disable, and revoke controls
- a system-wide kill switch through `OPENCLAW_EXTERNAL_RUNTIME_DISPATCH_ENABLED`
- tenant-scoped cleanup for legacy worker data

### Known limits

- Disabled by default until a tenant enables it
- Runs may pause or fail to route correctly if `Bound Worker` is left unresolved
- This path does not replace the desktop media worker path
- If the global dispatch switch is off, new work will not be sent even if workers are online
- `Bound Worker` is a routing decision, not an automatic API or MCP entitlement
- MCP media tools are not yet fully wired for end-to-end generation; use the HTTP media API path for image/video generation today

### Reference docs

- Spec: [spec.md](/home/dev/projects/SmartSpecPro/specs/feature/071-openclaw-external-runtime-integration/spec.md)
- This release note: [release-note.md](/home/dev/projects/SmartSpecPro/specs/feature/071-openclaw-external-runtime-integration/release-note.md)
- Expansion roadmap: [worker-platform-expansion-roadmap.md](/home/dev/projects/SmartSpecPro/specs/feature/071-openclaw-external-runtime-integration/worker-platform-expansion-roadmap.md)
- Help EN: [openclaw-workers.md](/home/dev/projects/SmartSpecPro/apps/web/docs/help/en/openclaw-workers.md)
- Help TH: [openclaw-workers.md](/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/openclaw-workers.md)

### Ready-to-send team message

OpenClaw External Runtime is now ready for internal rollout behind the `openClawExternalRuntime` tenant flag. This release adds worker monitoring and controls, team binding through Bound Worker, worker credit visibility, and legacy worker-data cleanup. To begin using it, enable the tenant flag, confirm the worker is online in Admin Monitoring, bind the External Connector to a Bound Worker in Teams, and run a test flow before broader use.
