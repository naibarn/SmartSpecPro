# Feature 072 Release Note

## English

### Summary

Feature 072 turns a bound Claw worker into a safer platform operator for its owner instead of a simple routing target.

This means a personal worker can now receive delegated platform access for supported jobs, use approved SmartSpecPro gateway routes, publish results back into the product, and spend the owner's credits with budget guardrails.

### What is new

- Personal worker ownership:
  - Each user adds their own worker.
  - The worker only acts for that owner.
  - The worker cannot use another user's data.
  - The worker cannot cross tenants.
- Delegated platform access:
  - Supported worker jobs can create delegated sessions.
  - Supported HTTP routes can be called through the SmartSpecPro gateway when the delegated manifest allows them.
- Budget guardrails:
  - Worker spend caps can be set per hour, 5 hours, day, week, and month.
  - Charges still come from the owner's SmartSpecPro balance.
  - Delegated gateway calls also have per-worker-job concurrency caps.
- Knowledge access:
  - Workers can search the owner's Library.
  - Workers can upload allowed files into the owner's Library.
  - Workers can search the owner's RAG content.
  - Workers can now use `POST /v1/knowledge/rag/ingest` to upload a new file for indexing or re-index an existing owner library item.
- Result callbacks:
  - Workers can publish room updates.
  - Workers can publish workflow updates.
  - Workers can send user notifications when work is done.
- Discovery and truthfulness:
  - Workers should use `/v1/openapi.json` for the static HTTP contract.
  - Workers should use the delegated manifest for per-job capability truth.
  - The delegated manifest now includes concrete route hints so Claw runtimes can see which HTTP actions are ready for that specific job.
  - Delegated LLM calls should use approved model aliases from the manifest instead of raw provider model IDs.

### Supported platform paths in this phase

When granted by the delegated session, workers can use supported routes for:

- LLM/chat and responses
- Skills
- Agency or swarm-style execution
- Image, video, presentation, and job APIs
- Library search
- Library upload
- RAG search

### Safety model

- Bound Worker chooses where work goes, but it does not grant everything by itself.
- Actual permissions come from delegated job grants.
- Spend protection uses both the user's live credit balance and optional worker budget caps.
- Extra gateway-side concurrency caps help stop a faulty worker from opening too many parallel delegated calls.
- Audit events, callback idempotency, and redaction rules apply to the worker path.

### Current limits

- Delegated worker MCP is available only when the delegated manifest reports MCP as ready and the job grants the required MCP namespaces.
- Workers should prefer the HTTP gateway first and use MCP when the delegated manifest says it is ready.
- External services that a worker calls with its own credentials are outside SmartSpecPro credit billing.
- Raw provider model IDs are denied for delegated LLM calls; workers should follow the approved aliases in the delegated manifest.

### Setup checklist

1. Enable tenant flag `openClawExternalRuntime`.
2. Let the user register their own worker.
3. Bind the worker to an External Connector in Teams.
4. Set worker budget caps if needed.
5. Confirm worker health in Admin Monitoring.
6. Confirm expected usage appears in Credits as `Worker Runtime`.

## ภาษาไทย

### สรุป

Feature 072 ทำให้ Bound Worker กลายเป็นผู้ปฏิบัติงานของเจ้าของ worker อย่างปลอดภัยมากขึ้น ไม่ใช่แค่ปลายทางสำหรับส่งงานอย่างเดียว

ความหมายคือ worker ส่วนตัวสามารถรับ delegated platform access สำหรับงานที่รองรับ เรียก SmartSpecPro gateway ในส่วนที่อนุญาต ส่งผลลัพธ์กลับเข้าระบบ และใช้เครดิตของเจ้าของได้ภายใต้ budget guardrail

### สิ่งที่เพิ่มเข้ามา

- โมเดลแบบ personal worker:
  - ผู้ใช้แต่ละคนเพิ่ม worker ของตัวเอง
  - worker ทำงานแทนได้เฉพาะเจ้าของ
  - worker ใช้ข้อมูลของ user คนอื่นไม่ได้
  - worker ข้าม tenant ไม่ได้
- Delegated platform access:
  - worker job ที่รองรับสามารถสร้าง delegated session ได้
  - worker เรียก HTTP route ที่รองรับผ่าน SmartSpecPro gateway ได้เมื่อ manifest ของ job อนุญาต
- Budget guardrails:
  - ตั้งเพดานการใช้เครดิตของ worker ได้รายชั่วโมง, ทุก 5 ชั่วโมง, รายวัน, รายสัปดาห์ และรายเดือน
  - เครดิตยังหักจากยอด SmartSpecPro ของเจ้าของ worker
  - delegated gateway calls มีเพดาน concurrent requests ต่อ worker job เพิ่มอีกชั้น
- Knowledge access:
  - worker ค้นหา Library ของเจ้าของได้
  - worker อัปโหลดไฟล์ที่อนุญาตเข้า Library ของเจ้าของได้
  - worker ค้นหา RAG ของเจ้าของได้
- Result callbacks:
  - worker ส่ง room update ได้
  - worker ส่ง workflow update ได้
  - worker ส่ง notification แจ้งผู้ใช้เมื่อทำงานเสร็จได้
- Discovery และความชัดเจนของ capability:
  - worker ใช้ `/v1/openapi.json` เป็นสัญญา HTTP แบบคงที่
  - worker ใช้ delegated manifest เป็นความจริงของ job นั้น ๆ
  - การเรียก LLM แบบ delegated ควรใช้ model alias ที่ manifest อนุญาต ไม่ควรใช้ raw provider model ID

### เส้นทางแพลตฟอร์มที่รองรับในเฟสนี้

ถ้า delegated session อนุญาต worker จะใช้ route ที่รองรับได้ในส่วนของ:

- LLM/chat และ responses
- Skills
- Agency หรือ swarm-style execution
- API สำหรับ image, video, presentation และ jobs
- Library search
- Library upload
- RAG search

### โมเดลความปลอดภัย

- Bound Worker ใช้เลือกปลายทางของงาน แต่ไม่ได้ให้สิทธิ์ทุกอย่างเอง
- สิทธิ์จริงมาจาก delegated job grants
- การคุมค่าใช้จ่ายใช้ทั้งเครดิตคงเหลือของผู้ใช้และ budget cap ของ worker
- ฝั่ง gateway มี concurrency cap เพิ่มเพื่อกัน worker ที่ผิดพลาดยิงคำขอพร้อมกันมากเกินไป
- เส้นทาง worker ถูกครอบด้วย audit, idempotency ของ callback และกฎ redaction

### ข้อจำกัดปัจจุบัน

- delegated worker MCP ใช้ได้เฉพาะเมื่อ delegated manifest ของ job นั้นระบุว่า MCP พร้อมและ grant namespace ที่ต้องใช้มาให้แล้ว
- worker ควรใช้ HTTP gateway เป็นค่าเริ่มต้น และใช้ MCP เมื่อ manifest บอกว่าพร้อม
- ถ้า worker ไปใช้บริการภายนอกด้วย credential ของตัวเอง ค่าใช้จ่ายส่วนนั้นจะไม่ถูกคิดเป็นเครดิตของ SmartSpecPro
- raw provider model IDs สำหรับ delegated LLM calls ถูกปฏิเสธโดยค่าเริ่มต้น ให้ใช้ alias ที่ระบบอนุญาตแทน

### เช็กลิสต์เปิดใช้งาน

1. เปิด tenant flag `openClawExternalRuntime`
2. ให้ผู้ใช้ลงทะเบียน worker ของตัวเอง
3. ผูก worker เข้ากับ External Connector ในหน้า Teams
4. ตั้ง worker budget caps ถ้าต้องการคุมค่าใช้จ่าย
5. เช็กสุขภาพ worker ใน Admin Monitoring
6. เช็กว่า Credits แสดงรายการเป็น `Worker Runtime` ตามที่คาดไว้
