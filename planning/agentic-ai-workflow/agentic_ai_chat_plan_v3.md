# แผนการระบบ Agentic AI บนหน้า Chat (Office Workflow) — เวอร์ชั่นละเอียด

> เอกสารนี้ออกแบบสำหรับ "ผู้ใช้สั่งงานจากหน้า Chat ที่มีอยู่แล้ว" แล้วระบบ (Agent) ทำเชิงหลายขั้นตอน พร้อม **ขุดอนุมัติ (Approve gates)** และส่งมอบผลลัพธ์สุดท้ายให้ผู้ใช้
> ตัวอย่างงาน: สร้างเครื่องเรื่อง 40–60 วินาที → ผู้ใช้อนุมัติ → สร้างภาพทีละภาพ → ผู้ใช้อนุมัติ → สร้างวิดีโอทีละภาพ → ผู้ใช้อนุมัติ → รวมข้อตัดเป็นวิดีโอสุดท้าย → ส่งมอบ

---

## 1) สรุปแนวคิด (Concept Summary)

### 1.1 Agentic AI สำหรับงาน Office คืออะไร
ระบบไม่ใช่ "ตอบคำถาม" ใช่แต่ **ผู้ช่วยทำงานให้เสร็จถึงผลิตภัณฑ์** (deliverable) โดยมีลักษณะหลัก:
- รับ "เป้าหมาย/บรีฟ" จากผู้ใช้จากเดียว
- เดนตามขั้นตอน (plan → act → observe → revise)
- เรียกใช้ **tools** (เช่น API สร้างภาพ/วิดีโอ/รวมวิดีโอ, ข้นอร्थสาร, สร้างเจล)
- มี **ขุดอนุมัติ** เพื่อให้ผู้ใช้ตรวจและควบคุมทิศทาง
- เก็บ **state** และ asset ทั้งหมด เพื่อย้อนกลับ/เจาะงานะตู (เช่น rerender เพาะแผ่อ)
- ส่งมอบผลงานสุดท้ายในรูปเจล/ลิงค์ดาวน์โหลด พร้อมสรุปและเวอร์ชั่น

### 1.2 เหตุผลที่ "LangGraph" เหมาะกับเคสนี้
จากลักษณะที่เป็น workflow หลายขั้น มีเงื่อนไข/วงลูป/หยุดรออนุมัติ และต้องเก็บ state รายข้อ → เหมาะกับ **LangGraph** (stateful graph/workflow)
โดยใช้ **LangChain** เป็น building blocks ได้แอป่ละเหตุให้ (prompt/model/tools parsers)

---

## 2) เป้าหมายของระบบ (Goals)

### 2.1 เป้าหมายหลัก
1. ผู้ใช้พิมพ์สั่งงานจากหน้า Chat ได้เหมือนเดิม
2. ระบบสร้าง **โครง/โครงการ** (outline/shot list/storyboard) และขออนุมัติ
3. เมื่ออนุมัติ → ระบบทำงานข้ออัตโนมัติในแต่ละขั้นตอนจนเสร็จ
4. ผู้ใช้สามารถ **ข้อแก้** หรือ **อนุมัติ** ในรายขั้น/รายข้อ
5. ส่งมอบ final deliverable: วิดีโอสุดท้าย + เจลประกอบ (script/shot list/prompt)

### 2.2 ขอบเขต (Scope) สำหรับเวอร์ชั่นแรก (MVP)
- รองรับ 1 ประเภทงานตัวอย่าง: "โฆษณาวิดีโอจากบรีฟข้อความ"
- มี 3–4 approval gates:
  - Approve Script/Shot list
  - Approve Storyboard/Prompts
  - Approve Images
  - Approve Shot Videos + Final Stitch
- มี rerender เพาะแผ่อ (ภาพ/วิดีโอ) พร้อมใช้ซีด
- มีระบบบันทึก (job) และ resume ได้หลังปิดหน้าหรือหลุด

### 2.3 ขอบเขตเพิ่มเติม (Extended Scope)

#### 2.3.1 Virtual Flow Builder
ระบบต้องรองรับการสร้าง **virtual flow** ที่ผู้ใช้สามารถ:
- ต่อโหนดการทำงาน (work nodes) ต่าง ๆ เข้าด้วยกัน
- กำหนดลำดับและเงื่อนไขการทำงานระหว่างโหนด
- บันทึก flow เป็น template ที่สามารถนำกลับมาใช้ใหม่ได้
- ทำงานอัตโนมัติตาม flow ที่กำหนด โดยมี approval gates ตามที่ตั้งค่า
- แชร์และใช้ flow ร่วมกันในทีม

**ตัวอย่าง use cases:**
- Flow: "สร้างเนื้อหาสื่อสังคม" → วิเคราะห์ trend → สร้าง caption → สร้างภาพ → โพสต์ตามกำหนดการ
- Flow: "รายงานประจำสัปดาห์" → ดึงข้อมูล → วิเคราะห์ → สร้างกราฟ → สร้างสไลด์ → ส่งอีเมล
- Flow: "Campaign Planning" → วิจัยตลาด → สร้างแผน → สร้าง creative assets → จัดทำงบประมาณ

**Key features:**
- Visual flow editor (drag-and-drop nodes)
- Node types: Input, Processing, Approval Gate, Branching, Output
- Data passing between nodes
- Conditional logic (if-then-else)
- Loop support (iterate over items)
- Error handling และ retry logic
- Schedule triggers (เวลา/เหตุการณ์)

#### 2.3.2 AI Secretary Solution
ระบบต้องสามารถทำหน้าที่เป็น **AI Secretary** ที่:
- จัดการปฏิทิน (Calendar Management):
  - จองห้องประชุม
  - นัดหมายอัตโนมัติตามความพร้อม
  - ส่งเตือนและ reminder
  - จัดการ conflict และเสนอเวลาทางเลือก

- จัดการอีเมลและการสื่อสาร:
  - กรองและจัดลำดับความสำคัญของอีเมล
  - ร่างและตอบอีเมลอัตโนมัติ (พร้อมขออนุมัติ)
  - สรุปกระทู้อีเมลยาว ๆ
  - ติดตามงานที่รออีเมลตอบกลับ

- จัดการเอกสารและข้อมูล:
  - จัดเก็บและหาเอกสารได้อย่างฉลาด
  - สรุปเอกสารยาว ๆ
  - แปลและแก้ไขภาษา
  - สร้างรายงานและนำเสนอ

- ช่วยเหลือในการตัดสินใจ:
  - รวบรวมข้อมูลเพื่อการประชุม
  - วิเคราะห์และแนะนำทางเลือก
  - ติดตามความคืบหน้าของโครงการ
  - เตือนกำหนดส่งและ milestones

- การทำงานเชิงรุก (Proactive Assistant):
  - แนะนำสิ่งที่ควรทำตามบริบท
  - เตรียมข้อมูลล่วงหน้าก่อนประชุม
  - ติดตามงานค้างและแจ้งเตือน
  - เรียนรู้ preference และ working style

**Integration requirements:**
- Calendar APIs (Google Calendar, Outlook)
- Email systems (Gmail, Outlook)
- File storage (Google Drive, OneDrive, S3)
- Communication platforms (Slack, Teams)
- Project management tools (existing task system)

---

## 3) สมมติฐานและข้อกำหนด (Assumptions & Requirements)

### 3.1 สมมติฐาน
- มี API พร้อมใช้:
  - `generate_image(prompt, ...)`
  - `generate_video(image_id, prompt, ...)`
  - `stitch_videos(video_ids, ...)`
- มีหน้า Chat อยู่แล้ว (UI/Backend เดิม) สามารถข้อเพิ่ม message types และปุ่ม approve ได้
- ยอมให้มี service ใหม่สำหรับ orchestrator (agent runner)

### 3.2 ข้อกำหนดสำคัญ
- **Human-in-the-loop**: ทุก action ที่เข้าเรคริต/ข้อย้านสูง หรือส่งมอบผลริต ต้องมี approve
- **Auditability**: เก็บ log tool calls, parameters, results, timestamps
- **Idempotency**: ยกเลิก/รีร้านไม่ทำงานซ้ำเกินกริต (ใช้ job_id + step_id)
- **Safety**: กัน prompt injection / ข้อมูลไม่เหมาะสม / เคลมเกษณาเกิดกริต
- **Cost control**: กำจัดจำนวน rerender และทุนความละเอียด/ความยาว

---

## 4) สถาปัตยกรรมระบบ (Architecture)

### 4.1 ภาพรวม (High-level)
1. **Chat UI (Frontend)**
   - แสดงข้อความ + "การเดาณา" (Job Card) แสดงสถานะ, ขั้นตอน, ปุ่ม Approve/Edit
   - แสดง preview (ภาพ/วิดีโอ) ใน grid/playlist
2. **Chat Backend (Existing)**
   - รับข้อความผู้ใช้ ส่งไป Agent Orchestrator
   - ส่งข้อความ/สถานะกลับมาที่ UI ผ่าน websocket/streaming
3. **Agent Orchestrator Service (New)**
   - รัน LangGraph workflow
   - จัดการ state, approval, retries, tool calls
4. **Tools Layer (Existing APIs + wrappers)**
   - generate image/video/stitch + validation tools
5. **Storage**
   - DB สำหรับ job/state/approval
   - Object storage สำหรับเจล media
   - (Optional) Vector DB สำหรับ RAG

### 4.2 องค์ประกอบหลัก (Components)
- **Job Manager**: สร้าง job_id, เก็บสถานะทั้งหมด, resume
- **State Store**: เก็บ state JSON ของงาน
- **Tool Registry**: รวม tools เป็น allowlist + schema
- **Approval Gate**: ปล่อยหยุดรออนุมัติ + resume
- **Renderer Workers**: ทำงานหนัก (generate image/video) เป็น async queue
- **Delivery Module**: รวมผลลัพธ์ ส่งลิงค์/เจลให้ผู้ใช้

---

## 5) แม่แบบข้อมูล (Data Model)

### 5.1 Job
- `job_id` (string): รหัสงาน
- `user_id` (string)
- `type` (enum): เช่น `ad_video_from_brief`
- `status` (enum): `draft|waiting_approval|running|failed|delivered|cancelled`
- `current_step` (string)
- `created_at`, `updated_at`

### 5.2 State (JSON) — เพาะทำให้ schema กลาง
ตัวอย่าง:

```json
{
  "job_id": "ADV-20260201-0007",
  "brief": {
    "brand": "AA Brand",
    "product": "น้ำยาล้างจากพืช่นใหม่",
    "concept": "หมากันเมาจุยยกับเรื่องข้อตี",
    "duration_sec": [40, 60],
    "language": "th",
    "constraints": {
      "tone": "สนุก อบอุ่น",
      "do_not_say": ["รักษาโร", "ตีที่สุดในโลก"]
    }
  },
  "script": {
    "logline": "",
    "beats": [],
    "shots": [
      {
        "shot_id": "S1",
        "sec": 6,
        "location": "ครัวบ้าน",
        "characters": ["dog", "cat"],
        "action": "",
        "dialogue": ["..."],
        "on_screen_text": "AA Brand ...",
        "cta": ""
      }
    ]
  },
  "prompts": {
    "image": { "S1": "..." },
    "video": { "S1": "..." }
  },
  "assets": {
    "images": { "S1": {"image_id":"img_123","url":"...","seed":123} },
    "videos": { "S1": {"video_id":"vid_456","url":"...","duration":6} },
    "final_video": {"video_id":"final_001","url":"..."}
  },
  "approvals": {
    "script": {"status":"pending|approved|changes_requested", "notes":"", "at": null},
    "storyboard": {"status":"pending|approved|changes_requested", "notes":"", "at": null},
    "images": {"status":"pending|approved|changes_requested", "notes":"", "at": null},
    "videos": {"status":"pending|approved|changes_requested", "notes":"", "at": null}
  },
  "budget": {
    "max_rerender_per_shot": 3,
    "spent": {"image": 0, "video": 0}
  },
  "errors": []
}
```

### 5.3 Approval Event
เมื่อผู้ใช้กด Approve/Request edits ให้ส่ง event ให้ backend:

```json
{
  "job_id": "ADV-20260201-0007",
  "gate": "script|storyboard|images|videos",
  "action": "approve|request_changes",
  "notes": "เปลี่ยนปูดข้อ S3 ให้สั้นลง",
  "shot_overrides": {
    "S3": {"notes": "เปลี่ยนมุมกล้องเป็น close-up"}
  }
}
```

---

## 6) นิยาม Tools (Tool Contracts) และแนวทาง้อ API

### 6.1 Tool Registry (allowlist)
ต้องมี registry กลางระบุ:
- tool name
- description
- input schema
- output schema
- permission level (safe/needs_approval/restricted)
- rate limit & cost hint

### 6.2 ตัวอย่าง Tool Contracts
**generate_image**
- input:
  - `prompt` (string)
  - `style` (string, optional)
  - `aspect_ratio` (string)
  - `seed` (int, optional)
- output:
  - `image_id` (string)
  - `url` (string)
  - `metadata` (json)

**generate_video**
- input:
  - `image_id` (string)
  - `motion_prompt` (string)
  - `duration_sec` (int)
- output:
  - `video_id` (string)
  - `url` (string)

**stitch_videos**
- input:
  - `video_ids` (array)
  - `order` (array)
  - `transitions` (json)
  - `music` (optional)
- output:
  - `final_video_id`
  - `url`

**validate_policy_and_brand** (เพาะทำเพิ่ม)
- input: `script/prompts` (json)
- output: `ok` (bool), `issues` (array)

> หมายเหตุ: Tool wrappers ควรทำให้ **idempotent** ด้วย `job_id + step_id + shot_id`

---

## 7) ออกแบบ Workflow ด้วย LangGraph (Core)

### 7.1 Nodes ที่เพาะทำ (MVP)
1. `parse_brief`
   - สกัด brand/product/duration/ข้อกำจัด
2. `plan_script`
   - สร้าง logline + shot list (รวมเวลา) + ยกหู + CTA
3. `gate_script_approval` (interrupt)
   - สร้าง "Job Card: Script" ให้ UI แสดง + รอ approve
4. `make_storyboard_prompts`
   - สร้าง image/video prompts ข้อ shot + mood/camera notes
5. `gate_storyboard_approval` (interrupt)
6. `render_images`
   - สร้างภาพทุก shot (ทำเป็น parallel worker)
7. `gate_images_approval` (interrupt)
8. `render_videos`
   - สร้างวิดีโอทุก shot
9. `gate_videos_approval` (interrupt)
10. `stitch_final`
   - รวมข้อ, เส้ transitions
11. `deliver`
   - ส่งมอบลิงค์ final + เจลประกอบ (script, prompts)

### 7.2 เงื่อนไขงานกลับ (Loops)
- หาก `request_changes` ที่ gate:
  - script gate → กลับ `plan_script`
  - storyboard gate → กลับ `make_storyboard_prompts`
  - images gate → rerender เพาะแผ่ shot ที่ถู flag
  - videos gate → rerender เพาะแผ่ shot ที่ถู flag หรือปรับ stitch params

### 7.3 Parallelization
- `render_images` และ `render_videos` ควรส่งงานไปใน queue:
  - job_id, shot_id, prompt, params
- Orchestrator ติดตามผล และเขียนกลับ state เมื่อได้ละ shot เสร็จ

### 7.4 Checkpoint/Resume
- ทุก node ต้องอ่าน state จาก DB และเขียนกลับ DB
- เมื่อ interrupt: สถานะ job = `waiting_approval`
- เมื่อได้รับ approval event: resume graph จาก node ถั้วไป

---

## 8) UI/UX บนหน้า Chat (User-facing Design)

### 8.1 Message Types ที่ควรเพิ่ม
- **Job Card**: สรุปงาน + progress bar + current gate + actions
- **Preview Gallery**:
  - Images grid (ข้อ shot)
  - Videos playlist (ข้อ shot)
- **Approve Panel**:
  - Approve / Request changes
  - ข้อ notes (ทั้วไป + รายข้อ)
  - ปุ่ม rerender รายข้อ (หลังข้าน gate ที่เกี่ยวข้อ)

### 8.2 ประสบการณ์ผู้ใช้ (Flow)
1. ผู้ใช้ส่งบรีฟใจเจ็บ
2. ระบบตอบกลับด้วย "Script/Shot list Card" + ปุ่ม Approve
3. ผู้ใช้กด Approve หรือ Request changes พร้อมเข็ต
4. ระบบเดนต่อถึง gate ถั้วไป และแสดง preview ตามขั้น
5. เมื่อเสร็จ ส่ง "Final Delivery Card" พร้อมลิงค์ดาวน์โหลด

### 8.3 การใช้ใจนรายข้อ (สำคัญมากสำหรับงาน office)
- ทุก gate ทั้งไปใน storyboard ได้ให้ผู้ใช้ใช้/flag ได้ในรายข้อ:
  - เปลี่ยนยกหู/ข้อความยกยอ
  - เปลี่ยนส้นละ ภาพ/มุมกล้อง
  - เปลี่ยน motion/ความเร่ววิดีโอ

---

## 9) Backend / Orchestrator Implementation Plan

### 9.1 แยกบริการ (เพาะทำ)
- **chat-service** (ยอบเดิม): รับข้อความ, auth, streaming ไว UI
- **agent-orchestrator** (ใหม่): รัน graph, จัดการ approvals, state
- **worker-render** (ใหม่หรือรวม): ทำ generate image/video/stitch เป็น queue

### 9.2 Queue และ Workers
- ใช้ queue (เช่น Redis queue, RabbitMQ, SQS ฯลฯ)
- จากเพาะทำ 3 ประเภท:
  - `image_render_task`
  - `video_render_task`
  - `stitch_task`

### 9.3 Error Handling & Retry
- retry เลยจำนวนพริ้น (เช่น 2–3)
- หาก tool ล้มเหลว:
  - ยกธึง error ใน state.errors
  - แจ้งผู้ใช้ใน job card ว่าขั้นไหนล้มเหลว พร้อม "Retry" (ถ้าเหมาะ)

### 9.4 Cost/Budget Control
- ยกจำนวนพริ้นที่ generate/shot
- กำจัด rerender/shot
- เก็บเงื่อนผู้ใช้เมื่อไปลด budget

---

## 10) ความปลอดภัยและทุนภาพ (Safety, Governance, Quality)

### 10.1 Guardrails ที่ต้องมี
- **Approval gates** ยกยันพริตใน backend (อย่าเชื่อ UI อย่างเดียว)
- **Tool allowlist** และแย permission
- **Input sanitization**: แย "ข้อความจากผู้ใช้" ยก "คำสั่งระบบ"
- **Prompt injection defense**:
  - ข้อมูลจากเองสาร/ผู้ใช้ใช้ใน "data" ไม่เป็น "instructions"
  - ห้ามให้ data เป็นใน system prompt/ข้ยายาย
- **Brand compliance**:
  - node `validate_policy_and_brand` ข้อนอนุมัติ/ข้อน render
  - ตรวจคำข้อนห้าม, เคลมเกิดกริต, ข้อความดิดหมายเกษณา (ตามกฎติกาองค์กร)

### 10.2 Audit & Observability
- เก็บ:
  - tool calls (ชื่อ, input hash, output id)
  - latency, retries, error codes
  - เวลาที่ผู้ใช้ approve และ notes
- dashboard:
  - success rate ข้อ step
  - cost per job
  - time-to-delivery

### 10.3 Versioning
- version ยอบ:
  - prompt templates
  - model version
  - tool version
- ทุก job ต้องระบุเพื่อ reproducibility

---

## 11) การยกสอบ (Testing Plan)

### 11.1 Unit Tests
- parser brief
- shot timing sum (ต้องอยู่ 40–60 sec)
- schema validation ของ state
- idempotency key logic

### 11.2 Integration Tests
- tool wrapper กับ sandbox/mock
- approval flow: interrupt → approve → resume
- rerender เพาะแผ่ shot

### 11.3 E2E Tests (UI + Backend)
- ผู้ใช้สร้าง job จาก chat
- approve ทุก gate ยกส่งมอบ
- request changes 1 ครั้ง แล้วผ่านยกยอง

### 11.4 Quality Evaluation (Optional เพาะทำ)
- rubric ให้คะแนน script (ความกัด, CTA, brand mention)
- ตรวจ ภาษาเดีย: ความลื่นเหล, ความยาวยกหูข้อ shot

---

## 12) Roadmap และ Milestones (เพาะทำ 4 เฟส)

### เฟส 0: เตรียมระบบพื้นฐาน (1–2 สัปดาห์)
- สร้าง job/state store
- สร้าง tool wrappers + registry + idempotency
- สร้างเฟร LangGraph เป็น minimal (parse → plan → gate)

### เฟส 1: MVP (2–4 สัปดาห์)
- Gate: script/storyboard/images/videos
- Render images/videos/stitch ผ่าน queue
- UI job card + approve + preview grid
- ส่งมอบ final link + export md (script/prompts)

### เฟส 2: เพิ่มความสามารถงานกริต (3–6 สัปดาห์)
- rerender รายข้อ + seed control + style presets
- brand/policy validation
- cost budget + rate limit
- observability dashboard เพื่อนติเตข้อ

### เฟส 3: ขยายประเภทงาน office (ข้อเนื่อง)
- template งานอื่น: สๆลพด, อี้เมลไปเมน, ไปสเตอร์, บรีฟงาน
- RAG จากคู่มือเบรนด์/แนวทางเกษณา/FAQ
- multi-agent roles (planner/reviewer/brand-guardian)

---

## 13) Backlog ที่พอร่ (Future Enhancements)
- รองรับเสียงจากย้า/ยกเข้าปีลอัตโนมัติ
- ตัวเลือกส้นละวิดีโอ (cinematic, cartoon, minimal)
- A/B variants: สร้าง 2–3 เวอร์ชั่นให้เลือก
- Collaboration: ให้หลายยนงานทีม approve
- Auto QA: ตรวจ logo placement, อ้า OCR ยอบข้อความยก ภาพ

---

## 14) เง็ดลิสต์สังเตราะ (Definition of Done) สำหรับงานประเภท "โฆษณาวิดีโอ"
- [ ] เงิน script + shot list 40–60 วินาที
- [ ] เงิน prompts ข้อ shot (image + motion)
- [ ] เงินภาพยกยทุก shot และผ่านการอนุมัติ
- [ ] เงินวิดีโอยกยทุก shot และผ่านการอนุมัติ
- [ ] เงินวิดีโอสุดท้าย stitched + ส่งมอบลิงค์
- [ ] เงิน state/log ยกย เพื่อ audit/resume
- [ ] มีปุ่ม rerender รายข้อ และกำจัด budget

---

## 15) ตัวอย่างการยอบกลับยอบระบบ (UX Copy) — เพื่อเอาใช้ใน Chat

### 15.1 หลักรับบรีฟ
- "ยมสร้างเครื่องเรื่องและเง็ดข้อใน 8 ข้อยรวม ~52 วินาทีแล้วยครับ ตรวจดูละข้อ Approve เพื่อเงินสร้าง Storyboard/Prompts"

### 15.2 หลักสร้างภาพ
- "ภาพตัวอย่างยอบเงิมละข้อยร้อมแล้วยครับ ทุนสามารถยก Approve ยั้งหมด หรือยอแก้เพาะงานะข้อยใน"

### 15.3 ส่งมอบ
- "ส่งมอบวิดีโอ Final แล้วยครับ"
  - Final: (ลิงค์)
  - Script + Prompts: (เจล/ลิงค์)"

---

## 16) สรุดการยกสิดงานเพิน (Key Design Decisions)
- ใช้ **LangGraph** เป็นตัวยกควบคุม workflow + approvals + loops
- ใช้ queue/workers สำหรับงาน render หนัก
- ใช้ state เป็น JSON schema เดียว เพื่อรองรับ rerender รายข้อ
- ทำ tool registry + allowlist + idempotency เป็นมาตริฐาน
- ออกแบบ UI ใช้ใน "ยั้งยยัน" พร้อม preview + approve

---

### ภาคผนวก A: เฟร Graph เป็นย่อ (Pseudo)
- START → parse_brief → plan_script → [GATE script]
  - approve → make_storyboard_prompts → [GATE storyboard]
    - approve → render_images → [GATE images]
      - approve → render_videos → [GATE videos]
        - approve → stitch_final → deliver → END
  - request_changes → plan_script (with notes)
  - storyboard changes → make_storyboard_prompts
  - image changes → render_images (only selected shots)
  - video changes → render_videos (only selected shots) / stitch_final

---

หากต้องการ ยมสามารถเพิ่ม "ตัวอย่าง schema validation" และ "ตัวอย่าง event payload จาก UI เป็นยยุนยั้น" ให้ยกรับระบบยอบทุนใชเดียวยนี
---

# ภาคผนวก B: ตัวอย่าง Schema Validation (เพิ่มจากกริต)

ส่วนนี้เพิ่มตัวอย่าง "ตรวจความถูกข้อยอบ state/payload" สำหรับระบบ workflow ที่มี approval + shot-level assets โดยให้ยั้น **JSON Schema** และ **อนติงานรระ** ที่ควรทำใน backend

> แนวทางเพาะทำ:
> - ใช้ JSON Schema ตรวจเฟรสร้าง/ยนติข้อมูล/required fields
> - ใช้ business rules ตรวจเงื่อนไขเพื่าม้ิลก่ (เช่น รวมเวลา 40–60 วินาที, ห้ามข้าม gate)

---

## B1) JSON Schema ตัวอย่าง: `JobState` (ยกัดย่อเป็นยรอบยลุม)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://your-domain/schemas/job_state.json",
  "title": "JobState",
  "type": "object",
  "additionalProperties": false,
  "required": ["job_id", "brief", "script", "prompts", "assets", "approvals", "budget", "errors"],
  "properties": {
    "job_id": { "type": "string", "minLength": 6, "maxLength": 64 },

    "brief": {
      "type": "object",
      "additionalProperties": false,
      "required": ["brand", "product", "concept", "duration_sec", "language"],
      "properties": {
        "brand": { "type": "string", "minLength": 1, "maxLength": 80 },
        "product": { "type": "string", "minLength": 1, "maxLength": 120 },
        "concept": { "type": "string", "minLength": 1, "maxLength": 500 },
        "duration_sec": {
          "type": "array",
          "minItems": 2,
          "maxItems": 2,
          "items": { "type": "integer", "minimum": 1, "maximum": 600 }
        },
        "language": { "type": "string", "enum": ["th", "en"] },
        "constraints": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "tone": { "type": "string", "maxLength": 80 },
            "do_not_say": {
              "type": "array",
              "maxItems": 50,
              "items": { "type": "string", "maxLength": 80 }
            }
          }
        }
      }
    },

    "script": {
      "type": "object",
      "additionalProperties": false,
      "required": ["logline", "beats", "shots"],
      "properties": {
        "logline": { "type": "string", "minLength": 1, "maxLength": 300 },
        "beats": {
          "type": "array",
          "minItems": 1,
          "maxItems": 20,
          "items": { "type": "string", "maxLength": 240 }
        },
        "shots": {
          "type": "array",
          "minItems": 4,
          "maxItems": 20,
          "items": {
            "type": "object",
            "additionalProperties": false,
            "required": ["shot_id", "sec", "location", "characters", "action", "dialogue", "on_screen_text"],
            "properties": {
              "shot_id": { "type": "string", "pattern": "^S[0-9]{1,2}$" },
              "sec": { "type": "integer", "minimum": 1, "maximum": 30 },
              "location": { "type": "string", "minLength": 1, "maxLength": 120 },
              "characters": {
                "type": "array",
                "minItems": 1,
                "maxItems": 6,
                "items": { "type": "string", "maxLength": 40 }
              },
              "action": { "type": "string", "maxLength": 400 },
              "dialogue": {
                "type": "array",
                "minItems": 0,
                "maxItems": 12,
                "items": { "type": "string", "maxLength": 160 }
              },
              "on_screen_text": { "type": "string", "maxLength": 120 },
              "cta": { "type": "string", "maxLength": 120 }
            }
          }
        }
      }
    },

    "prompts": {
      "type": "object",
      "additionalProperties": false,
      "required": ["image", "video"],
      "properties": {
        "image": {
          "type": "object",
          "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 2000 }
        },
        "video": {
          "type": "object",
          "additionalProperties": { "type": "string", "minLength": 1, "maxLength": 2000 }
        }
      }
    },

    "assets": {
      "type": "object",
      "additionalProperties": false,
      "required": ["images", "videos"],
      "properties": {
        "images": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": true,
            "required": ["image_id", "url"],
            "properties": {
              "image_id": { "type": "string", "minLength": 3, "maxLength": 128 },
              "url": { "type": "string", "format": "uri" },
              "seed": { "type": "integer" }
            }
          }
        },
        "videos": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": true,
            "required": ["video_id", "url"],
            "properties": {
              "video_id": { "type": "string", "minLength": 3, "maxLength": 128 },
              "url": { "type": "string", "format": "uri" },
              "duration": { "type": "integer", "minimum": 1, "maximum": 60 }
            }
          }
        },
        "final_video": {
          "type": ["object", "null"],
          "additionalProperties": true,
          "required": ["video_id", "url"],
          "properties": {
            "video_id": { "type": "string", "minLength": 3, "maxLength": 128 },
            "url": { "type": "string", "format": "uri" }
          }
        }
      }
    },

    "approvals": {
      "type": "object",
      "additionalProperties": false,
      "required": ["script", "storyboard", "images", "videos"],
      "properties": {
        "script": { "$ref": "#/$defs/approvalGate" },
        "storyboard": { "$ref": "#/$defs/approvalGate" },
        "images": { "$ref": "#/$defs/approvalGate" },
        "videos": { "$ref": "#/$defs/approvalGate" }
      }
    },

    "budget": {
      "type": "object",
      "additionalProperties": false,
      "required": ["max_rerender_per_shot", "spent"],
      "properties": {
        "max_rerender_per_shot": { "type": "integer", "minimum": 0, "maximum": 20 },
        "spent": {
          "type": "object",
          "additionalProperties": false,
          "required": ["image", "video"],
          "properties": {
            "image": { "type": "integer", "minimum": 0 },
            "video": { "type": "integer", "minimum": 0 }
          }
        }
      }
    },

    "errors": {
      "type": "array",
      "maxItems": 200,
      "items": { "$ref": "#/$defs/errorItem" }
    },

    "rerender_count": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "image": { "type": "object", "additionalProperties": { "type": "integer", "minimum": 0 } },
        "video": { "type": "object", "additionalProperties": { "type": "integer", "minimum": 0 } }
      }
    }
  },

  "$defs": {
    "approvalGate": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status", "notes", "at"],
      "properties": {
        "status": { "type": "string", "enum": ["pending", "approved", "changes_requested"] },
        "notes": { "type": "string", "maxLength": 2000 },
        "at": { "type": ["string", "null"], "format": "date-time" }
      }
    },
    "errorItem": {
      "type": "object",
      "additionalProperties": true,
      "required": ["code", "message", "step", "at"],
      "properties": {
        "code": { "type": "string", "maxLength": 64 },
        "message": { "type": "string", "maxLength": 4000 },
        "step": { "type": "string", "maxLength": 64 },
        "shot_id": { "type": ["string", "null"], "pattern": "^S[0-9]{1,2}$" },
        "at": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

---

## B2) Business Rules (อนใสริมที่ควรตรวจใน backend)

### B2.1 Duration ต้องอยู่ในช่วงที่กำหนด
- ให้กำนวน `total_sec = sum(shot.sec)`
- ต้องอยู่ในช่วง `brief.duration_sec[0]..brief.duration_sec[1]`
- ถ้าไม่เข้า: `code=DURATION_OUT_OF_RANGE`

### B2.2 Shot coverage ต้องยกย (prompts/assets)
- shot_ids ทั้งหมดมาจาก `script.shots[*].shot_id`
- ทุก shot ต้องมี:
  - `prompts.image[shot_id]`
  - `prompts.video[shot_id]`
- เมื่อผ่าน gate images: ต้องมี `assets.images[shot_id]` ยกยทุก shot
- เมื่อผ่าน gate videos: ต้องมี `assets.videos[shot_id]` ยกยทุก shot

### B2.3 ห้ามข้าม gate
- `approvals.storyboard.status` ต้องเป็น `approved` ถึงจั้น render_images
- `approvals.images.status` ต้องเป็น `approved` ถึงจั้น render_videos
- `approvals.videos.status` ต้องเป็น `approved` ถึงจั้น stitch_final

### B2.4 Rerender limit / Budget
- ตรวจ `rerender_count[asset_type][shot_id] < budget.max_rerender_per_shot`
- ถ้าเกิด: `code=RERENDER_LIMIT_EXCEEDED`

### B2.5 Policy/Brand validation (เพาะทำ)
- ตรวจว่า script มี brand mention อย่างต่อย 1 ครั้ง
- ตรวจคำข้อนห้ามจาก `brief.constraints.do_not_say`
- ถ้าเจอ: `code=POLICY_VIOLATION` และต้องใจเนื่อน approve

---

## B3) ตัวอย่างผลลัพธ์ validation (ส่งกลับ UI)

```json
{
  "job_id": "ADV-20260201-0007",
  "ok": false,
  "errors": [
    {
      "code": "DURATION_OUT_OF_RANGE",
      "message": "ความยาวรวม 64 วินาที เกินช่วง 40–60 วินาที",
      "step": "plan_script",
      "shot_id": null,
      "at": "2026-02-01T10:12:30Z"
    },
    {
      "code": "MISSING_PROMPT",
      "message": "ยังไม่มี image prompt สำหรับ S5",
      "step": "make_storyboard_prompts",
      "shot_id": "S5",
      "at": "2026-02-01T10:12:30Z"
    }
  ]
}
```

---

# ภาคผนวก C: ตัวอย่าง Event Payload จาก UI (ยกยทุนทั้ง)

ส่วนนี้เงิน "สัญญา event" ที่ UI ส่งให้ backend/orchestrator เพื่อควบคุม workflow: สร้างงาน → อนุมัติ/ข้อแก้ → rerender → retry → stitch → export → cancel

> แนวทางเพาะทำ: ทุก event ต้องมี `event_type` และ (ถ้ามี job แล้ว) `job_id` เสมอ

---

## C1) สร้างงานจากข้อความใน Chat

### C1.1 สร้างงานจากข้อความ (raw chat)
```json
{
  "event_type": "job.create_from_chat",
  "job_type": "ad_video_from_brief",
  "chat": {
    "thread_id": "th_9c2f",
    "message_id": "msg_1001",
    "text": "สร้างภาพยงข้โฆษณา... น้ำยาล้างจาก AA Brand ความยาว 40-60 วินาที ..."
  },
  "client_context": { "ui_version": "1.3.0", "locale": "th-TH", "tz": "Asia/Bangkok" }
}
```

### C1.2 สร้างงานจากฟอร์ม (structured brief)
```json
{
  "event_type": "job.create",
  "job_type": "ad_video_from_brief",
  "brief": {
    "brand": "AA Brand",
    "product": "น้ำยาล้างจากพืช่นใหม่",
    "concept": "หมากันเมาจุยยกับเรื่องข้อตี",
    "duration_sec": [40, 60],
    "language": "th",
    "constraints": { "tone": "สนุก อบอุ่น", "do_not_say": ["ตีที่สุดในโลก", "รักษาโร"] }
  },
  "client_context": { "ui_version": "1.3.0", "locale": "th-TH", "tz": "Asia/Bangkok" }
}
```

---

## C2) Gate: Script → Approve / Request changes

### C2.1 Approve script
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "script",
  "action": "approve",
  "notes": ""
}
```

### C2.2 Request changes (รวม)
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "script",
  "action": "request_changes",
  "notes": "เพิ่ม punchline ให้กลดีขึ้น และ CTA ให้ยนงานข้าย"
}
```

### C2.3 Request changes (รายข้อ)
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "script",
  "action": "request_changes",
  "notes": "เจนในแผนะงานข้อ",
  "shot_overrides": {
    "S3": { "notes": "ย่อนยกหูเหลือ 1 ประโย" },
    "S7": { "notes": "เพิ่ม brand mention AA Brand" }
  }
}
```

---

## C3) Gate: Storyboard/Prompts → Approve / Request changes

### C3.1 Approve storyboard/prompts
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "storyboard",
  "action": "approve",
  "notes": ""
}
```

### C3.2 Request changes prompts รายข้อ (แจว patch)
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "storyboard",
  "action": "request_changes",
  "notes": "ปรับ mood งานข้อ",
  "shot_overrides": {
    "S2": {
      "image_prompt_patch": "เปลี่ยนเป็นส้นละสนใส ภาพเจล 3D ทุ่มพวล",
      "video_prompt_patch": "เพิ่มการเดนกล้องข้าไป จากข้ายเจนวา"
    }
  }
}
```

---

## C4) Gate: Images → Rerender / Approve / Request changes

### C4.1 Rerender ภาพข้อนเดียว
```json
{
  "event_type": "job.rerender",
  "job_id": "ADV-20260201-0007",
  "asset_type": "image",
  "shot_id": "S4",
  "notes": "ให้หมาที่ยมาขึ้น และให้ยกวง AA Brand ยนดีขึ้น",
  "params": { "seed": 918273, "aspect_ratio": "16:9" }
}
```

### C4.2 Approve images ทั้งหมด
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "images",
  "action": "approve",
  "notes": ""
}
```

### C4.3 Request changes images รายข้อ
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "images",
  "action": "request_changes",
  "notes": "เจนภาพงานข้อ",
  "shot_overrides": {
    "S1": { "notes": "เปลี่ยนครัวให้ modern ขึ้น" },
    "S6": { "notes": "เพิ่มยอบทุ่ม้ เหใสื่อธึงลัดล้านสริน" }
  }
}
```

---

## C5) Gate: Videos → Rerender / Approve / Request changes

### C5.1 Rerender วิดีโอข้อนเดียว
```json
{
  "event_type": "job.rerender",
  "job_id": "ADV-20260201-0007",
  "asset_type": "video",
  "shot_id": "S4",
  "notes": "ลดความเร่วปูม และให้เมาวุยยังหน้า 1 ครั้ง",
  "params": { "duration_sec": 6 }
}
```

### C5.2 Approve videos ทั้งหมด
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "videos",
  "action": "approve",
  "notes": ""
}
```

### C5.3 Request changes videos รายข้อ
```json
{
  "event_type": "job.approval",
  "job_id": "ADV-20260201-0007",
  "gate": "videos",
  "action": "request_changes",
  "notes": "ข้อนข้ายอยากให้ยกยมขึ้น",
  "shot_overrides": {
    "S8": { "notes": "เพิ่มันหวะหยุดตื้ง 0.5 วินาทีข้อนดึ่ง CTA" }
  }
}
```

---

## C6) Finalize / Stitch (รวมข้อนเป็นวิดีโอสุดท้าย)

```json
{
  "event_type": "job.finalize",
  "job_id": "ADV-20260201-0007",
  "action": "stitch",
  "params": {
    "transition": { "type": "crossfade", "duration_ms": 250 },
    "music": { "track_id": "bgm_soft_01", "mix_level": 0.2 }
  }
}
```

---

## C7) Retry (ยริที tool ล้มเหลว)

### C7.1 Retry เพาะงานงานที่ล้มเหลวใน step
```json
{
  "event_type": "job.retry",
  "job_id": "ADV-20260201-0007",
  "step": "render_videos",
  "scope": "failed_only",
  "notes": "ลดใหม่อีกครั้ง"
}
```

### C7.2 Retry เพาะงานะข้อ
```json
{
  "event_type": "job.retry",
  "job_id": "ADV-20260201-0007",
  "step": "render_images",
  "scope": "shot",
  "shot_id": "S6",
  "notes": "retry S6"
}
```

---

## C8) Cancel job

```json
{
  "event_type": "job.cancel",
  "job_id": "ADV-20260201-0007",
  "reason": "ไม่ต้องการทำข้อไปแล้ว"
}
```

---

## C9) Export/Download artifacts (สคริปต์/ยรอมยต้/เจลรวม)

### C9.1 Export เป็น zip
```json
{
  "event_type": "job.export",
  "job_id": "ADV-20260201-0007",
  "format": "zip",
  "include": ["script", "shot_list", "prompts", "images", "shot_videos"]
}
```

### C9.2 Export เป็น markdown
```json
{
  "event_type": "job.export",
  "job_id": "ADV-20260201-0007",
  "format": "md",
  "include": ["script", "shot_list", "prompts"]
}
```

---

## C10) Streaming status updates (backend → UI) [ตัวอย่าง]

```json
{
  "message_type": "job.status",
  "job_id": "ADV-20260201-0007",
  "status": "running",
  "step": "render_images",
  "progress": { "done": 3, "total": 8 },
  "last_update_at": "2026-02-01T10:25:40Z"
}
```

```json
{
  "message_type": "job.asset_ready",
  "job_id": "ADV-20260201-0007",
  "asset_type": "image",
  "shot_id": "S3",
  "image": { "image_id": "img_778", "url": "https://..." }
}
```

---

## C11) Summary: UI actions → event_type
- ส่งบรีฟ → `job.create_from_chat` / `job.create`
- Approve/Request changes → `job.approval`
- Rerender → `job.rerender`
- Retry → `job.retry`
- Final stitch params → `job.finalize`
- Export → `job.export`
- Cancel → `job.cancel`

---
---

# 17) Solution เป็น "Skill Marketplace" ที่ยืนหยุ่นต้องการเพิ่ม Skill ไม่ทำนัน (Chat + Media Studio)

> เป้าหมาย: ระบบสามารถเพิ่ม skill ใหม่ได้เรื่อย ๆ (admin วางเจลใน folder แล้ว import อัตโนมัติ)
> UI/UX ทั้งหน้า Chat และ Media Studio ต้อ "เปลี่ยนตาม skill" ได้โดยไม่ต้องได้เปลี่ยนหน้ายอนทุน่ครั้ง
> และต้องเป็น **Agentic AI**: วางใจนอนัตโนมัติ → ทำงานหลายขั้น → มี approve gates → ส่งมอบ artifact ยริต

เงิงนวิธีหลักยอบ solution นี้คือทำให้ skill เป็น "เจนใจน" ที่ประกอบด้วย:
1) **Skill Manifest** (metadata + UI schema + workflow schema + policy/cost)
2) **Agent Plan Template** (วิธีทำงาน/ทั้งหมด/เงื่อนไขงานกลับ)
3) **Tool bindings** (เรียก API/เจรื่องมือที่มี)
4) **Artifact contracts** (ประเภทเจลที่จะส่งมอบ + preview)

เมื่อระบบเหล skill ใหม่ → ทั้ง Chat และ Media Studio สามารถ render UI, workflow, approvals, และ artifact viewer ได้ใน dynamic

---

## 17.1 ภาพรวมสถาปัตยกรรมใน Marketplace

### 17.1.1 สิ่งที่เพิ่มจากสถาปัตยกรรมเดิม
- **Skill Loader + Registry**: scan เจลงานอร์ skill → validate → register → hot-reload (ถ้าต้องการ)
- **Skill Manifest Schema**: ข้อยกลางยางที่ทุก skill ต้องมี
- **Universal Orchestrator** (LangGraph): รัน workflow ตาม manifest (ไม่ hardcode per skill)
- **Universal UI Renderer**:
  - Chat: Job Card + Step bubbles + Artifact gallery จาก schema
  - Media Studio: Dynamic form + stepper + preview panes จาก schema
- **Artifact Service**: เก็บ/เวอร์ชั่น/ยรีวิว/ส้อออกเจล (pptx/pdf/xlsx/png/mp4/json/md)

### 17.1.2 สิ่งที่ "ต้องไม่ทำ" เพื่อให้ยืนหยุ่น
- ไม่ hardcode UI เพาะงานะงาน (เช่น video เข้าทั้ง)
- ไม่ hardcode steps ใน workflow ต้องนประเภทงาน
- ไม่ถู skill เข้าทั้งหน้าเดียว (Chat/Studio) เซบงานะยกั้ว → ให้เป็น "view modes" ตาม manifest

---

## 17.2 Skill Manifest: ส้นยกลางที่ยัน UI + Workflow + Approvals

### 17.2.1 แนวคิดยอบ Manifest
Manifest คือเจล (เพาะทำ YAML หรือ JSON) ที่อบประบนว่า:
- skill นี้ชื่ออะไร ทำอะไร
- ต้องการ input อะไร (dynamic form)
- มี workflow steps อะไรข้าง
- มี approval gates ยริยไหน
- จะสร้าง artifacts อะไรข้างและ preview แจนไหน
- มี cost hints / guardrails / limitations อย่างไร

> ถ้า admin วาง skill ใหม่ลง folder แล้ว import อัตโนมัติ: ระบบควร validate manifest ข้อน activate

---

### 17.2.2 เจรสร้าง Manifest (ตัวอย่าง YAML)

```yaml
id: "slides_from_analysis_v1"
version: "1.0.0"
name: "Analyze data and create slides"
category: ["analysis", "slides"]
description: "ยึงข้อมูลจากเจล/เหล่งข้อมูล → วิไจราะห์ → สร้างสๆลพด์สรุดสำหรับผู้บริหาร"
entrypoints:
  chat_enabled: true
  studio_enabled: true
capabilities:
  supports_files: true
  supports_connectors: true
  supports_citations: true
  long_running: true
ui:
  # UI schema สำหรับ render form ใน Media Studio และ Chat side panel (Inputs tab)
  inputs:
    - key: "data_source"
      label: "เหล่งข้อมูล"
      type: "file_or_connector"
      required: true
      accept: ["xlsx","csv","pdf"]
    - key: "goal"
      label: "เป้าหมาย"
      type: "select"
      required: true
      options: ["executive_summary","sales_insights","ops_dashboard"]
    - key: "time_window"
      label: "ช่วงเวลา"
      type: "date_range"
      required: false
    - key: "slide_count"
      label: "จำนวนสๆลพด์"
      type: "number"
      required: true
      min: 5
      max: 30
      default: 12
  preview:
    primary_artifact: "deck_pptx"
workflow:
  steps:
    - id: "ingest"
      label: "Ingest & Parse"
      kind: "toolchain"
      tools: ["extract_tables","read_spreadsheets","parse_pdf"]
      outputs: ["dataset_profile"]
    - id: "analyze"
      label: "Analyze"
      kind: "llm+tools"
      tools: ["compute_metrics","make_charts"]
      outputs: ["findings","charts"]
      gate:
        type: "approval"
        gate_id: "approve_findings"
        label: "Approve findings"
        cost_sensitive: false
    - id: "draft_slides"
      label: "Create slide plan"
      kind: "llm"
      outputs: ["slide_outline"]
      gate:
        type: "approval"
        gate_id: "approve_outline"
        label: "Approve slide outline"
        cost_sensitive: false
    - id: "render_deck"
      label: "Generate deck"
      kind: "tool"
      tools: ["generate_slides_pptx"]
      outputs: ["deck_pptx","deck_pdf"]
      gate:
        type: "approval"
        gate_id: "approve_deck"
        label: "Approve deck"
        cost_sensitive: true
    - id: "deliver"
      label: "Deliver"
      kind: "deliver"
artifacts:
  - id: "deck_pptx"
    type: "pptx"
    title: "Executive Deck"
    preview: "slide_thumbnails"
  - id: "charts"
    type: "image_gallery"
    title: "Charts"
    preview: "grid"
  - id: "report_md"
    type: "markdown"
    title: "Analysis Notes"
policy:
  approvals_required: ["approve_findings","approve_outline","approve_deck"]
  max_rerender: 3
  pii_handling: "mask"
cost:
  estimate:
    ingest: 0
    analyze: 10
    render_deck: 30
```

---

## 17.3 Universal Workflow Engine: รับตาม Manifest (ไม่ถูยันประเภทงาน)

### 17.3.1 หลักการรัน
- Orchestrator เหล manifest → สร้าง LangGraph เป็น dynamic:
  - node ข้อ step ตาม `workflow.steps`
  - ถ้า step มี gate → interrupt รอ approval event
  - รองรับ loop เมื่อ request_changes
- ใช้ state ใช้ใน `JobState` เงิดเพิ่ม namespace ข้อ skill:
  - `state.skill_id`
  - `state.step_results[step_id]`
  - `state.artifacts[artifact_id]`

### 17.3.2 State Pattern ที่รองรับ skill หลายหลาย
เพาะทำเพิ่มดิลก์เนลาง:

```json
{
  "job_id": "JOB-001",
  "skill_id": "slides_from_analysis_v1",
  "inputs": { "data_source": "...", "slide_count": 12 },
  "plan": { "steps": ["ingest","analyze","draft_slides","render_deck","deliver"] },
  "step_results": {
    "ingest": { "dataset_profile": { "rows": 1000, "cols": 24 } },
    "analyze": { "findings": ["..."], "charts": ["art:charts"] }
  },
  "artifacts": {
    "deck_pptx": { "artifact_id": "art_123", "url": "..." }
  },
  "approvals": {
    "approve_findings": { "status": "pending", "notes": "", "at": null }
  }
}
```

---

## 17.4 Universal UI/UX: Chat และ Media Studio "เปลี่ยนตาม Skill"

### 17.4.1 ทำความรู้จนันทั้น
- **Skill** = เม็นงาน (มี form + workflow + artifacts)
- **Job** = instance ของการทำงาน (มี state, approvals, progress)
- **Artifact** = ผลลัพธ์ยริต (file/preview/version)

---

## 17.5 UX สำหรับหน้า Chat (รองรับงานไม่จำนันประเภท)

### 17.5.1 เป้าหมาย UX ของ Chat
- สั่งงานได้เป็นนภาษาธรรมชาติ
- เลือก/เปลี่ยน skill ได้
- ระบบเดนงานอันตโนมัติ (plan) และทำข้อนเสร็จ พร้อมยออนุมัติในยระยะ
- แสดงผลลัพธ์ได้เป็น artifacts ที่เหิดภู/ดาวน์โหลดได้

### 17.5.2 UI Components เป็น Universal (เข้าทันทุน skill)
1) **Skill Chip / Skill Selector**
   - แสดง skill ยันทุนทั้น + ปุ่มเลือน skill ใหม่
   - tooltip: inputs/outputs/gates จาก manifest
2) **Universal Job Card (Pinned)**
   - แสดง stepper จาก `workflow.steps`
   - แสดง gate ยันทุนทั้น + ปุ่ม Approve/Request changes
   - แสดง progress และ cost hint (ถ้ามี)
3) **Step Result Bubble (Dynamic)**
   - Render จาก `step.outputs` + `artifacts.preview`
4) **Artifact Gallery Bubble**
   - แสดง artifacts ตาม manifest (pptx/pdf/image/video/chart/gallery)
5) **Right Side Panel (Job Details)**
   - Inputs (render จาก `ui.inputs`)
   - Steps & Logs
   - Artifacts & Versions
   - Costs

### 17.5.3 Render Rules ใน Chat (ทำให้ไม่ต้องเพิ่ม UI ข้อ skill)
ให้ mapping ประเภท output → component:

- `text_summary` → markdown bubble
- `table` → table viewer
- `chart` → chart viewer
- `image_gallery` → grid gallery
- `pptx` → thumbnail viewer + download
- `video` → player + timeline
- `json` → collapsible viewer

> เมื่อเพิ่ม skill ใหม่ ใช้ระบุ output/artifacts types ให้ถูก ระบบ render ได้เอง

### 17.5.4 Skill Chaining ใน Chat
หลังงาน job ให้ปุ่ม "Convert to…" โดยข้อ skill ที่รับ input ประเภทเดียวกัน:
- "Turn findings into Slides"
- "Turn report into Infographic"
- "Turn slide outline into Video storyboard"

---

## 17.6 UX สำหรับ Media Studio (สร้างสื่อ: Video/Slides/Infographic)

ทุนยอนว่า Media Studio "ยึง input เป็น dynamic ตาม skill" อยู่แล้ว → ให้เพิดเพาะงานสิ่งที่ทำให้เข้าใน Agentic workflow:

### 17.6.1 เฟร UI ที่ควรเพิ่ม (ทุน skill ใน studio เข้าร่วมทั้น)
- **Top Workflow Bar**: ชื่อเจร์ดูก่ + stepper + status + export
- **Step Panel**: แสดงผลลัพธ์ยอบ step + gate controls (Approve/Request changes)
- **Artifact Preview Pane**: แสดง preview ของ `ui.preview.primary_artifact` และรอ artifacts
- **Versions/History**: ข้อ artifact และข้อ step (rerender/compare)

---

## 17.7 Skill Authoring Kit: เจรสร้างเจล + validation

เจรเจลงานอร์มาตริงาน:

```
skills/
  slides_from_analysis_v1/
    manifest.yaml
    prompts/
      planner.md
      step_analyze.md
      step_outline.md
    tools.py        # optional wrapper/bindings
    tests/
      manifest_test.py
```

Validation ข้อน activate:
- schema ถูกข้อ (fields required)
- tool names อยู่ใน allowlist
- artifact types รองรับใน UI renderer
- gate ids ไม่ซ้ำ
- step graph ถูกข้อ (ไม่มี loop ที่ติด)

---

## 17.8 ตัวอย่าง Skill Templates (ยรอนหลุมงานหลัก)

### 17.8.1 Skill: Analysis (วิไจราะห์ข้อมูลจากเจล/อนนใจร)
```yaml
id: "org_data_analysis_v1"
name: "Org Data Analysis"
category: ["analysis","data-viz"]
entrypoints: { chat_enabled: true, studio_enabled: false }
ui:
  inputs:
    - { key: "data_source", type: "file_or_connector", required: true }
    - { key: "questions", type: "textarea", required: true }
workflow:
  steps:
    - { id: "ingest", kind: "toolchain", tools: ["read_spreadsheets","parse_pdf"], outputs: ["dataset_profile"] }
    - { id: "analyze", kind: "llm+tools", tools: ["compute_metrics","make_charts"], outputs: ["findings","charts"],
        gate: { type: "approval", gate_id: "approve_findings", label: "Approve findings" } }
    - { id: "deliver", kind: "deliver" }
artifacts:
  - { id: "report_md", type: "markdown", title: "Analysis Report", preview: "markdown" }
  - { id: "charts", type: "image_gallery", title: "Charts", preview: "grid" }
```

### 17.8.2 Skill: Slides
```yaml
id: "slides_builder_v1"
name: "Slides Builder"
category: ["slides"]
entrypoints: { chat_enabled: true, studio_enabled: true }
ui:
  inputs:
    - { key: "topic", type: "text", required: true }
    - { key: "slide_count", type: "number", required: true, min: 5, max: 40, default: 12 }
workflow:
  steps:
    - { id: "outline", kind: "llm", outputs: ["outline"],
        gate: { type: "approval", gate_id: "approve_outline", label: "Approve outline" } }
    - { id: "render_deck", kind: "tool", tools: ["generate_slides_pptx"], outputs: ["deck_pptx"],
        gate: { type: "approval", gate_id: "approve_deck", label: "Approve deck", cost_sensitive: true } }
    - { id: "deliver", kind: "deliver" }
artifacts:
  - { id: "deck_pptx", type: "pptx", title: "Deck (PPTX)", preview: "slide_thumbnails" }
```

### 17.8.3 Skill: Video Ad
```yaml
id: "video_ad_from_brief_v1"
name: "Video Ad from Brief"
category: ["video"]
entrypoints: { chat_enabled: true, studio_enabled: true }
ui:
  inputs:
    - { key: "brand", type: "text", required: true }
    - { key: "concept", type: "textarea", required: true }
workflow:
  steps:
    - { id: "script", kind: "llm", outputs: ["script","shots"],
        gate: { type: "approval", gate_id: "approve_script", label: "Approve script & shots" } }
    - { id: "images", kind: "toolchain", tools: ["generate_image"], outputs: ["shot_images"],
        gate: { type: "approval", gate_id: "approve_images", label: "Approve images", cost_sensitive: true } }
    - { id: "shot_videos", kind: "toolchain", tools: ["generate_video"], outputs: ["shot_videos"],
        gate: { type: "approval", gate_id: "approve_videos", label: "Approve videos", cost_sensitive: true } }
    - { id: "stitch", kind: "tool", tools: ["stitch_videos"], outputs: ["final_video"] }
    - { id: "deliver", kind: "deliver" }
artifacts:
  - { id: "final_video", type: "video", title: "Final Video", preview: "player" }
```

### 17.8.4 Skill: Infographic เป็น slide ตาม storyboard
```yaml
id: "infographic_storyboard_v1"
name: "Storyboard Infographic (Slide-like)"
category: ["infographic","design"]
entrypoints: { chat_enabled: true, studio_enabled: true }
ui:
  inputs:
    - { key: "story", type: "textarea", required: true }
    - { key: "panel_count", type: "number", required: true, min: 4, max: 20, default: 8 }
workflow:
  steps:
    - { id: "layout", kind: "llm", outputs: ["panel_outline"],
        gate: { type: "approval", gate_id: "approve_layout", label: "Approve layout" } }
    - { id: "generate_panels", kind: "toolchain", tools: ["generate_image"], outputs: ["panel_images"],
        gate: { type: "approval", gate_id: "approve_panels", label: "Approve panels", cost_sensitive: true } }
    - { id: "export", kind: "tool", tools: ["pack_infographic_as_pptx","pack_as_pdf"], outputs: ["infographic_pptx","infographic_pdf"] }
    - { id: "deliver", kind: "deliver" }
artifacts:
  - { id: "panel_images", type: "image_gallery", title: "Panels", preview: "grid" }
  - { id: "infographic_pptx", type: "pptx", title: "Infographic Slides", preview: "slide_thumbnails" }
```

### 17.8.5 Skill: แผนงานเกษณา/ประชาสัมพันธ์ (Campaign Plan)
```yaml
id: "pr_campaign_plan_v1"
name: "PR / Campaign Plan"
category: ["planning","marketing"]
entrypoints: { chat_enabled: true, studio_enabled: false }
ui:
  inputs:
    - { key: "objective", type: "textarea", required: true }
    - { key: "channels", type: "multiselect", required: true, options: ["fb","ig","tiktok","email","pr"] }
workflow:
  steps:
    - { id: "plan", kind: "llm", outputs: ["strategy","timeline","budget_table"],
        gate: { type: "approval", gate_id: "approve_plan", label: "Approve plan" } }
    - { id: "export", kind: "tool", tools: ["generate_spreadsheet","generate_slides_pptx"], outputs: ["timeline_xlsx","deck_pptx"] }
    - { id: "deliver", kind: "deliver" }
artifacts:
  - { id: "plan_md", type: "markdown", title: "Campaign Plan", preview: "markdown" }
  - { id: "timeline_xlsx", type: "xlsx", title: "Timeline & Budget", preview: "table" }
```

---

## 17.9 Approval และ Cost ที่ scale ตาม skill
- gate มี `cost_sensitive` → UI ต้องเงื่อนเรคริต/confirm
- gate มี `scope` (all/per-unit) → รองรับ rerender เพาะแผ่ unit (shot/slide/chart)

---

## 17.10 เดินงานใชรเรียงลำดับ (ทำเป็นกริต)

### Phase 1 — Foundations
1) Skill Manifest Schema + validator
2) Skill Loader/Registry (scan folder → register)
3) Universal JobState (skill_id, inputs, step_results, artifacts, approvals)
4) Artifact Service (store/version/preview/export)
5) Tool allowlist + idempotency

### Phase 2 — Universal Orchestrator
6) Graph builder จาก manifest
7) Gate interrupt/resume + approval events
8) Loop on request_changes
9) Unit-level rerender

### Phase 3 — Universal UI (Chat) + Marketplace UX
10) Universal Job Card + Step bubbles render ตาม manifest
11) Side panel inputs/artifacts/steps
12) Artifact viewers ยริต types หลัก
13) Convert-to / skill chaining

### Phase 4 — Media Studio: Agentic Workflow
14) Top workflow bar + stepper + approvals
15) เงื่อม Job เดียวกัน chat (open in chat / open in studio)
16) Versions/compare per artifact/unit
17) Export package

### Phase 5 — Authoring Kit + Operations
18) Skill template generator
19) คู่มือเขียน skill + ตัวอย่าง 6–8 เจน
20) QA pipeline (lint/allowlist/policy)
21) Marketplace UI (browse/search/version pinning)

---

## 17.11 Checklist สำหรับ Skill ใหม่
- รับ input อะไร? ต้องเจล/connector ไหม?
- steps/gates อยู่ยริไหน? loops อะไร?
- artifacts อะไร? preview แจนไหน?
- unit คืออะไร (shot/slide/chart/panel) และ rerender ได้ไหม?
- cost-sensitive step อะไร?
- policy/guardrails อะไรต้อ enforce?

---
