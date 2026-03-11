# 035 — Live Browser Experience

Version: 1.0
Date: 2026-03-10
Status: Proposed
Audience: Product, Architecture, Frontend, Node Backend, Python Backend, Security
Related Features: 031-PlaywrightVision, 032-Browser-Automation-Copilot, 033-Browser-Automation-Policy

---

## 1. Executive summary

Feature นี้ยกระดับ Browser Automation จากระบบแบบ `chat -> analyze -> execute -> poll result` ไปเป็น **live collaborative browser workspace** ที่ผู้ใช้:

1. เห็นหน้าจอ browser ของ automation แบบสดใน session เดียวกัน
2. สั่งงานผ่าน chat แบบต่อเนื่องบน browser session เดิมได้
3. หยุด agent แล้ว takeover มาควบคุมเองได้
4. ส่งไม้กลับให้ agent ทำต่อจาก state ปัจจุบันได้
5. ตอบ decision request หรือกรอกข้อมูลบางช่องแทน agent ได้
6. ตรวจสอบ approval/policy prompts พร้อม context ของหน้าจอจริงได้

เป้าหมายไม่ใช่แค่ “ให้ agent เปิดเว็บได้” แต่ทำให้ browser automation กลายเป็น **shared operating surface** ระหว่าง user กับ agent ภายใต้ policy engine เดิม

---

## 2. Problem statement

### 2.1 Current state

SmartSpecPro มี browser automation ที่ใช้งานได้แล้ว:

- chat-based task authoring ใน `AutomationChatModal`
- intent analysis + script generation ใน `automation_copilot.py`
- Playwright execution + self-healing ใน `self_healing_executor.py`
- browser policy / approval / audit controls ใน Feature 033
- direct browser action execution ผ่าน `browserTool`

### 2.2 Current gaps

สิ่งที่ยังไม่มีในระบบปัจจุบัน:

1. **No live browser viewport**
   ผู้ใช้ยังไม่เห็น browser session แบบสด มีเพียง status text และผลลัพธ์ปลายทาง

2. **No same-session conversational control**
   การสั่งใหม่ยังเป็น task-based run แยก ไม่ใช่การคุยต่อบน page state เดิม

3. **No human takeover**
   ผู้ใช้ยังไม่สามารถกด takeover เพื่อกรอกฟอร์มเอง เลือก seat เอง หรือเลือก option เองใน session เดิม

4. **No field-level handoff**
   ระบบยังไม่มี UX ที่ agent พูดว่า “ช่วยกรอกช่องนี้ให้หน่อย” หรือ “ช่วยเลือกตัวเลือกนี้ก่อน”

5. **No visual approval context**
   approval path มีแล้ว แต่ยังไม่ anchored กับ live browser surface โดยตรง

6. **No transactional collaboration model**
   use case อย่างจองโรงแรม จองตั๋ว สมัครฟอร์มยาว เปรียบเทียบตัวเลือก แล้วให้ user confirm บางจุด ยังไม่ครบเป็น product flow

### 2.3 Why this matters

หากไม่มี live collaborative layer:

- ผู้ใช้ไม่ trust automation สำหรับงานที่มีผลจริง
- browser path ยังเหมาะกับ extraction/search มากกว่า real-world task completion
- approval system ช่วยเรื่อง security แต่ยังไม่พอสำหรับ usability
- งานที่ต้องมี human judgment ระหว่างทางยังต้อง fallback ไปทำเองนอกระบบ

---

## 3. Goals

1. สร้าง live browser session ที่ user มองเห็นได้ตลอดการทำงาน
2. ให้ user คุยกับ agent ต่อเนื่องบน session เดิม โดยไม่ reset page state
3. รองรับ pause, resume, cancel, takeover, return-control อย่างชัดเจน
4. รองรับ human assist 2 แบบ:
   - structured assist: ตอบคำถาม/เลือก option/กรอก field ผ่าน side panel
   - direct assist: takeover หน้า browser แล้วคลิก/พิมพ์เอง
5. รวม browser policy approvals เข้ากับ live workspace เดียวกัน
6. ทำให้ use case ระดับ “ค้นหา -> กรอก -> เปรียบเทียบ -> เลือก -> ยืนยัน” ใช้งานได้จริง
7. เก็บ timeline, audit, approvals, handoff events, and screen evidence ได้ครบ

---

## 4. Non-goals

1. ไม่ทำ native desktop automation
2. ไม่ bypass CAPTCHA, anti-bot, MFA, OTP, payment verification
3. ไม่ให้ agent กรอก secret, password, OTP, card number โดยอัตโนมัติ
4. ไม่เปิด multi-user simultaneous editing ใน session เดียวตั้งแต่ Phase 1
5. ไม่ทำ cross-tenant shared browsing
6. ไม่ replace Browser Automation Policy Engine; ต้อง reuse และ enforce ของเดิม
7. ไม่รองรับ takeover/direct-input บน mobile viewport (observe + approve/assist เท่านั้น)
8. ไม่ทำ full-frame video recording by default (ใช้ event stream + screenshots แทน)

---

## 5. Product principles

- **Live, not blind**: ถ้างานมีผลกระทบจริง ผู้ใช้ต้องเห็น browser state ปัจจุบันได้
- **One session, many turns**: การคุยหลายรอบต้องต่อบน session เดิมได้
- **Human control at points of consequence**: ก่อน commit สำคัญ ต้องมีทางให้ user intervene
- **Agent never escalates privilege**: live mode ต้องอยู่ใต้ tenant/user/browser policy เดิม
- **Takeover is first-class**: manual intervention ต้องไม่ถือเป็น error path
- **Fail closed, recover clearly**: ถ้า stream/policy/session พัง ต้อง block action สำคัญและแจ้งเหตุผล

---

## 6. User stories

### 6.1 Live research / browsing

- ผู้ใช้เปิด live browser workspace
- พิมพ์ว่า “เข้าเว็บ A แล้วหา pricing ของ package enterprise”
- เห็น browser นำทางจริงและเห็นผลการค้นหาบนหน้าจอ
- สั่งต่อว่า “เปิด tab ที่สองเทียบกับคู่แข่งอีกเจ้า”

### 6.2 Assisted form fill

- ผู้ใช้สั่ง “ช่วยกรอกฟอร์มสมัครงานนี้ให้จาก resume ใน library”
- agent กรอกช่องที่ปลอดภัยให้
- agent ขอให้ user takeover เพื่อกรอก expected salary และตอบคำถามปลายเปิดบางข้อ
- user กด resume แล้ว agent ทำต่อ

### 6.3 Booking / reservation style flow

- ผู้ใช้สั่ง “ช่วยหาโรงแรมแถว Shibuya คืนวันที่ X-Y”
- agent ค้นหา เปรียบเทียบราคา และเสนอ shortlist
- user เลือกตัวเลือก
- agent เข้าหน้าจองและกรอกข้อมูลเบื้องต้น
- user takeover เพื่อเลือกห้อง/เงื่อนไขเฉพาะ แล้วส่ง control กลับ
- final confirmation ยังอยู่ใต้ approval/policy gate

### 6.4 Policy-driven human approval

- agent กำลังจะ submit / send / confirm booking
- workspace แสดง approval panel พร้อม live screenshot, target origin, action summary
- user อนุมัติหรือปฏิเสธในหน้าเดียว

---

## 7. Scope and capability matrix

| Capability | Current | Feature 035 Target |
|-----------|---------|--------------------|
| Chat to browser task | Yes | Keep |
| Browser execution | Yes | Keep |
| Live browser viewport | No | Add |
| Same-session multi-turn control | Partial | Add |
| Pause / resume execution | Partial | Add explicitly |
| Human takeover | No | Add |
| Structured human assist requests | No | Add |
| Visual approval in workspace | No | Add |
| Session timeline / replay | Partial | Add |
| Booking-style collaborative flow | Partial | Add |

---

## 8. Architecture overview

### 8.1 Core idea

เพิ่ม **Live Browser Session** เป็น persistent runtime object ระหว่าง frontend, Node gateway, Python execution service, และ browser sandbox

```
User
  -> Live Browser Workspace (React)
  -> Session API + Stream Gateway (Node)
  -> Live Browser Session Manager (Python)
  -> Headed Browser Sandbox + Stream Adapter
  -> Playwright Agent Controller
```

### 8.1.1 Tab and browsing context model

1 live session = **1 Playwright BrowserContext** ซึ่งรองรับ multiple tabs (pages)

- agent สามารถเปิด tabs เพิ่มได้ตาม task need (เช่น เปรียบเทียบ 2 เว็บ)
- UI แสดง tab list พร้อม active tab indicator
- takeover ให้ user ควบคุมทุก tab ใน context เดียวกัน
- max tabs per session: configurable via policy, default 5
- tab ที่ถูกเปิดโดย agent ต้องอยู่ภายใต้ allowed domains เดิม

### 8.2 Major components

1. **Live Browser Workspace UI**
   - browser viewport
   - chat/command panel
   - session status
   - approvals + assist rail
   - timeline / action log

2. **Session Coordinator (Node)**
   - authn/authz
   - tenant/user policy context resolution
   - signed stream token issuance
   - session lifecycle endpoints
   - chat-command proxy to Python

3. **Live Browser Session Manager (Python)**
   - create/resume/terminate session
   - attach Playwright + policy client
   - own session state machine
   - pause/resume/takeover transitions
   - emit structured events

4. **Browser Stream Adapter**
   - secure interactive viewport transport from sandbox to user
   - supports observe mode and human-control mode

5. **Handoff / Assist Engine**
   - creates structured assist requests
   - pauses agent when user action is required
   - resumes from current DOM state after assist completes

### 8.3 Streaming decision

สำหรับ feature นี้ต้องใช้ **interactive remote browser surface**, ไม่ใช่ polling screenshots อย่างเดียว

Recommended approach:

- browser sandbox รัน **headed Chromium + virtual display**
- stream/control ผ่าน **noVNC-compatible WebSocket gateway** หรือเทียบเท่าที่รองรับ:
  - low-latency screen updates
  - keyboard/mouse input
  - explicit observer vs controller mode
- Node เป็นผู้ issue short-lived viewer/controller tokens

เหตุผล:

- screenshot polling ไม่พอสำหรับ manual fill / takeover
- reuse sandbox isolation model ได้
- ไม่ต้องให้ browser รันบนเครื่องผู้ใช้

### 8.4 Authoritative state and concurrency model

เพื่อป้องกัน split-brain ระหว่าง frontend, Node, Python, และ stream broker ต้องกำหนด ownership ชัดเจนดังนี้:

- **Python `LiveBrowserSessionManager` เป็น authoritative owner ของ runtime session state**
  - canonical fields: `status`, `control_mode`, `controller_actor`, `pause_reason`, `pending_assist_request_id`, `pending_approval_request_id`, `browser_context_ref`
- **Node เป็น policy/authz gateway และ token issuer**
  - ไม่มีสิทธิ์ mutate runtime state ตรง ๆ นอกจากผ่าน Python session commands
- **DB เป็น durable history store ไม่ใช่ low-latency state authority**
  - ใช้สำหรับ recovery, audit, replay, support tooling
- **stream broker เป็น transport only**
  - ไม่มีสิทธิ์ตัดสิน ownership หรือ mutate business state

#### Concurrency rules

- ทุก mutation command (`pause`, `takeover`, `return_control`, `resume`, `cancel`) ต้องมี:
  - `session_version`
  - `idempotency_key`
  - actor identity
- Python session manager ต้องใช้ compare-and-swap semantics:
  - command สำเร็จได้เฉพาะเมื่อ `session_version` ล่าสุดตรงกับที่ caller คาดไว้
  - command ซ้ำด้วย `idempotency_key` เดิมต้องคืนผลเดิม ไม่ execute ซ้ำ
- takeover lock ต้องมี lease:
  - `controller_lease_expires_at`
  - `controller_connection_id`
- หาก lease หมดอายุหรือ connection ขาดเกิน grace window ให้ session revert เป็น `waiting_for_human` หรือ `ready` ตาม pending action state

#### Resource limits and sandbox capacity

- max concurrent live sessions per tenant: configurable, default `3`
- max concurrent live sessions per user: configurable, default `1`
- sandbox resource per session: max 1 vCPU, 1.5 GB RAM, 512 MB disk
- เมื่อ pool เต็ม: return `503 session_pool_exhausted` พร้อม `retryAfterSeconds`
- sandbox idle timeout (ไม่มี command/interaction): default `300s` แล้ว auto-pause
- sandbox hard timeout (รวมทุก state): default `maxLiveSessionDurationSeconds` = `1800s` (30 min)

#### State recovery rule

- เมื่อ Node restart: reload จาก Python + DB event log
- เมื่อ Python restart: recover runtime session จาก DB + ephemeral broker metadata เฉพาะ session ที่ยังไม่ terminal
- เมื่อ authoritative runtime recovery ไม่ครบ:
  - ห้าม auto-resume agent
  - ต้องเปลี่ยน session เป็น `failed_recovery_required` หรือ `waiting_for_human_reconnect`

---

## 9. Session model

### 9.1 Session types

- `ephemeral_live_session`
  - เปิดจาก Automation workspace
  - ผูกกับ user + tenant + policy context

- `workflow_attached_live_session`
  - เปิดโดย workflow/agency แล้ว user attach เข้ามาดูหรือช่วยได้

### 9.2 Session state machine

```
                                    ┌──────────────────────────┐
                                    │                          │
                                    ▼                          │
created ──► provisioning ──► ready ──► agent_running ◄─────────┤
                │              │          │    │                │
                │              │          │    ▼                │
                │              │          │  waiting_for_human ─┤
                │              │          │    │                │
                │              │          │    ▼                │
                │              │          │  human_controlling ─┘
                │              │          │
                ▼              ▼          ▼
             failed        cancelled   completed

Any non-terminal state ──► failed    (on unrecoverable error)
Any non-terminal state ──► cancelled (on user/admin cancel)
Any non-terminal state ──► expired   (on timeout)

Recovery transitions:
  failed/agent_running/waiting_for_human ──► waiting_for_runtime_recovery
  waiting_for_runtime_recovery ──► ready    (recovery success)
  waiting_for_runtime_recovery ──► failed_recovery_required (recovery failed)
  failed_recovery_required ──► cancelled    (user gives up)
```

Terminal states: `completed`, `cancelled`, `failed`, `expired`, `failed_recovery_required`

### 9.3 Control modes

- `observe`
  - user เห็นอย่างเดียว
- `approve_only`
  - user ตอบ approval / structured assist ได้ แต่ยังไม่ควบคุมเมาส์คีย์บอร์ด
- `takeover`
  - user ควบคุม browser โดยตรง
- `agent_control`
  - agent ถือ control หลัก

### 9.4 Invariants

- agent และ human ห้ามมี write control พร้อมกัน
- takeover ต้อง pause agent ก่อนเสมอ
- resume ต้อง re-check policy and DOM context
- approval ที่หมดอายุหรือถูก revoke ต้อง invalidate pending action
- ทุก state mutation ต้องผ่าน authoritative session manager พร้อม `session_version`
- stream reconnect ห้ามเปลี่ยน ownership state ด้วยตัวเอง

### 9.5 Role and permission model

| Role | Observe | Approve | Structured Assist | Takeover | Cancel Session | Attach To Workflow Session |
|---|---|---|---|---|---|---|
| `user` | own sessions only | own approvals only | own sessions only | own sessions if policy allows | own sessions | only if explicitly attached |
| `domain_admin` | tenant sessions when permitted by policy | tenant-scoped approvals per RBAC | yes for same tenant | only when policy allows and session not restricted | tenant sessions | yes |
| `admin` | all tenant sessions in admin scope | yes | yes | policy-gated | yes | yes |
| `support_observer` | optional future read-only role | no | no | no | no | no by default |

Rules:

- default role for Phase 1 คือ owner-user only
- cross-user attach ต้อง explicit และ auditable
- support/admin observer mode ต้องไม่เห็น hidden secrets beyond existing redaction policy

---

## 10. UX design requirements

### 10.1 Primary layout

หน้า `Live Browser Workspace` ต้องมีอย่างน้อย 4 zones:

1. **Browser Viewport**
   - live canvas
   - current URL/origin badge
   - control ownership badge

2. **Chat + Command Panel**
   - natural language commands
   - clarifications
   - agent summaries

3. **Assist / Approval Rail**
   - approval requests
   - decision prompts
   - field handoff tasks

4. **Timeline**
   - navigation
   - filled field summaries
   - approvals
   - takeovers
   - policy incidents

### 10.2 Required user actions

- `Start Session`
- `Pause Agent`
- `Take Control`
- `Return Control to Agent`
- `Approve`
- `Reject`
- `Answer Prompt`
- `Mark Assist Complete`
- `Cancel Session`

### 10.3 Required UX behavior

- เมื่อ agent กำลังพิมพ์/คลิกใน browser ต้องมี visible indicator
- เมื่อ user takeover ต้อง disable agent command execution ชั่วคราว
- เมื่อ session รอ human input ต้อง render blocking state ชัดเจน
- ทุก commit-like action ต้องมี preview/summary ก่อน approval

---

## 11. Human assist model

### 11.1 Structured assist request

agent สามารถสร้าง assist request ชนิด:

- `decision`
  - “เลือกระหว่างตัวเลือก A/B/C”
- `field_input`
  - “ช่วยกรอกข้อมูลช่องนี้”
- `review_page`
  - “ช่วยตรวจว่าหน้านี้ถูกต้องก่อนให้ฉันทำต่อ”
- `takeover_required`
  - “ขั้นตอนนี้ต้องการ manual control”

### 11.2 Direct takeover

เมื่อ structured assist ไม่พอ ผู้ใช้กด takeover แล้วโต้ตอบบน browser canvas โดยตรง

หลัง user กด `Return Control` ระบบต้อง:

1. capture current DOM fingerprint + screenshot evidence
2. re-evaluate browser policy
3. ask agent to continue from current state, not replay from start

### 11.2.1 Takeover security boundary

human takeover **ไม่ใช่ policy bypass**

สิ่งที่ต้องบังคับ:

- manual actions ของ human ใน live canvas ต้องถูก audit เป็น `actor_type=user`
- takeover บนหน้า sensitive class (`auth`, `security`, `billing_admin`, `restricted_data`) ต้องสามารถ require:
  - recent re-auth
  - elevated approval
  - stricter TTL
- hard-block actions ที่แม้ human takeover ก็ยังไม่ควรเปิดใน product นี้:
  - automated password/OTP capture
  - secret extraction/reveal instrumentation
  - card/payment execution via agent-assisted finalization
  - destructive admin/security changes without explicit elevated gate

#### Classification during human control

- `human_direct_input`
  - user พิมพ์/คลิกเองบน canvas
- `human_structured_response`
  - user ตอบจาก side panel
- `human_approved_commit`
  - user approve ให้ agent ทำต่อ
- `human_elevated_takeover`
  - takeover บน sensitive workflow/page

ทุกชนิดต้องเข้าสู่ audit chain เดียวกับ browser policy events

### 11.3 Manual-completion checkpoint

หลัง user takeover ต้องมี explicit checkpoint เช่น:

- `done_fill_form`
- `selected_option`
- `navigated_to_next_step`
- `stop_here`

เพื่อให้ agent รู้ว่าควรทำอะไรต่อ

---

## 12. Policy integration

Feature 035 ต้องใช้ policy layering ของ Feature 033/tenant-user policy model เดิมทั้งหมด

### 12.1 Tenant baseline applies to live mode

- allowed domains
- enforcement mode
- transfer restrictions
- approval TTL
- kill switch
- tamper evidence

### 12.2 User overlay still narrows

ผู้ใช้ยังทำได้แค่:

- ลด domain subset
- ลด mode cap
- block downloads/uploads/external send
- require extra approvals

### 12.3 Live-specific policy additions

ต้องเพิ่ม policy concepts ใหม่:

| Policy key | Type | Default (tenant) | Default (user) | Description |
|---|---|---|---|---|
| `allowLiveView` | boolean | `false` | inherits | เปิด/ปิด live mode ทั้งหมด |
| `allowTakeover` | boolean | `true` | inherits | อนุญาตให้ takeover ได้หรือไม่ |
| `allowDirectHumanInput` | boolean | `true` | inherits | อนุญาตให้พิมพ์/คลิกบน canvas ได้ |
| `allowWorkflowAttachedLiveSessions` | boolean | `false` | inherits | อนุญาตให้ workflow/agency เปิด live session |
| `maxLiveSessionDurationSeconds` | integer | `1800` (30 min) | can only narrow | hard timeout รวมทุก state |
| `maxIdleTakeoverSeconds` | integer | `300` (5 min) | can only narrow | idle timeout ขณะ takeover/waiting |
| `maxConcurrentLiveSessions` | integer | `3` | can only narrow | max sessions per tenant |
| `maxTabsPerSession` | integer | `5` | can only narrow | max browser tabs per session |

### 12.4 Restricted actions

ถึงจะมี live mode ก็ยังต้อง block:

- password / OTP / seed / secret automation
- payment execution by agent
- irreversible destructive admin actions

human takeover สามารถทำบางอย่างเองได้ แต่ต้องถูก audit และ gated ตาม role/policy

### 12.5 Audit parity requirement

live mode และ non-live mode ต้องใช้ audit semantics เดียวกัน:

- shared correlation IDs
- shared approval state vocabulary
- shared incident reason codes
- shared tamper-evident persistence rules

ห้ามมีเส้นทาง live takeover ที่ไม่สร้าง durable event เมื่อมี:

- control transfer
- direct human input on sensitive page
- approval resolution
- resume after human intervention

---

## 13. Backend design

### 13.1 Node endpoints

Add new routes/tRPC procedures:

- `liveBrowser.createSession`
- `liveBrowser.getSession`
- `liveBrowser.sendCommand`
- `liveBrowser.pauseAgent`
- `liveBrowser.takeControl`
- `liveBrowser.returnControl`
- `liveBrowser.submitAssistResponse`
- `liveBrowser.approveAction`
- `liveBrowser.rejectAction`
- `liveBrowser.cancelSession`
- `liveBrowser.listEvents`
- `liveBrowser.getStreamToken`

### 13.2 Python endpoints/services

Add new Python surface:

- `POST /api/live-browser/sessions`
- `GET /api/live-browser/sessions/{id}`
- `POST /api/live-browser/sessions/{id}/command`
- `POST /api/live-browser/sessions/{id}/pause`
- `POST /api/live-browser/sessions/{id}/takeover`
- `POST /api/live-browser/sessions/{id}/resume`
- `POST /api/live-browser/sessions/{id}/assist-response`
- `POST /api/live-browser/sessions/{id}/cancel`

Core new service:

- `LiveBrowserSessionManager`
- `LiveBrowserEventBus`
- `LiveBrowserAssistService`
- `LiveBrowserStreamBroker`

### 13.3 Event model

Every session emits durable events:

- `session_created`
- `stream_ready`
- `agent_started`
- `navigation_completed`
- `assist_requested`
- `approval_requested`
- `approval_resolved`
- `takeover_started`
- `takeover_ended`
- `agent_resumed`
- `session_completed`
- `session_failed`

### 13.4 Integration contract with existing automation surfaces

ต้องปิด boundary ระหว่าง live และ non-live ให้ชัดเจน:

#### Automation Copilot

- `Run in Live Mode` ต้อง create `live_browser_session` ก่อน แล้วค่อย attach Copilot controller
- multi-turn commands ใน live workspace ต้อง reuse intent-analysis/planning primitives เดิม แต่ execute against existing session state
- ถ้า live session สร้างไม่สำเร็จ:
  - live request ต้อง fail closed
  - ห้าม fallback เงียบ ๆ ไป blind automation

#### BrowserTool

- direct `browserTool` path ยังใช้ได้สำหรับ non-live/internal/action-batch use cases
- แต่ถ้า request ถูกระบุเป็น live session command:
  - ต้องผ่าน live session manager เท่านั้น
  - ห้ามยิงเข้า direct batch executor ตรง
- policy counters, approvals, and audit events ต้อง converge เข้าชุดเดียวกัน

#### Workflow / Agency

- workflow หรือ agency run สามารถเปิด `workflow_attached_live_session`
- เมื่อมี live session attached:
  - approval/assist events ต้อง surface ไปที่ workspace เดียวกัน
  - resume path ต้องผ่าน authoritative live session manager ก่อน แล้วค่อยคืนให้ workflow/agency executor
- ถ้า live attach หลุด:
  - workflow ต้องไม่ assume ว่า human step สำเร็จเอง

#### Release gating

- live mode ต้องมี release gate แยกจาก plain browser automation
- tenant ที่ผ่าน browser automation gate แล้ว ไม่ได้แปลว่าผ่าน live browser gate อัตโนมัติ

### 13.4.1 Rate limiting

| Endpoint | Limit | Window | Scope |
|---|---|---|---|
| `createSession` | 5 | per minute | per user |
| `sendCommand` | 20 | per minute | per session |
| `takeControl` | 10 | per minute | per session |
| `returnControl` | 10 | per minute | per session |
| `submitAssistResponse` | 20 | per minute | per session |
| `approveAction` / `rejectAction` | 20 | per minute | per session |
| `cancelSession` | 5 | per minute | per user |
| `getStreamToken` | 10 | per minute | per session |

Implementation: reuse existing BullMQ/Bottleneck rate limiter infrastructure.

Abuse protection:
- repeated `takeControl` spam (>5 rejected requests in 1 min) → temporary lockout + incident event
- repeated `sendCommand` while agent is already executing → queue depth limit of 3, reject with `command_queue_full`

### 13.5 API contract shapes

#### `liveBrowser.createSession`

Request:

```json
{
  "sourceType": "automation",
  "sourceId": "auto-task-123",
  "initialUrl": "https://example.com",
  "mode": "observe",
  "executionIntent": {
    "prompt": "Find the pricing page and summarize plans"
  }
}
```

Response:

```json
{
  "sessionId": "lbs_123",
  "status": "provisioning",
  "controlMode": "observe",
  "sessionVersion": 1,
  "stream": {
    "viewerToken": "signed-token",
    "expiresAt": "2026-03-10T12:00:00Z"
  }
}
```

#### Error response format (all endpoints)

```json
{
  "accepted": false,
  "error": {
    "code": "session_version_conflict",
    "message": "Session version mismatch: expected 11, got 10",
    "currentSessionVersion": 11,
    "retryable": true
  }
}
```

Standard error codes:

| Code | HTTP Status | Retryable | Description |
|---|---|---|---|
| `session_version_conflict` | 409 | yes (re-fetch version) | CAS conflict |
| `session_not_found` | 404 | no | Session doesn't exist or not accessible |
| `session_terminated` | 410 | no | Session in terminal state |
| `invalid_state_transition` | 422 | no | Action not valid in current state |
| `policy_denied` | 403 | no | Browser policy blocked action |
| `rate_limited` | 429 | yes | Rate limit exceeded |
| `command_queue_full` | 429 | yes | Too many pending commands |
| `session_pool_exhausted` | 503 | yes | No sandbox capacity |
| `takeover_locked_out` | 423 | yes (after cooldown) | Abuse protection lockout |
| `step_up_auth_required` | 401 | yes (after auth) | Sensitive takeover needs re-auth |
| `lease_expired` | 410 | yes (re-request) | Controller lease expired |
| `stream_unavailable` | 503 | yes | Stream substrate not ready |

#### `liveBrowser.sendCommand`

Request:

```json
{
  "sessionId": "lbs_123",
  "sessionVersion": 7,
  "idempotencyKey": "cmd-uuid",
  "command": {
    "type": "natural_language",
    "text": "Open the second hotel option and compare cancellation policy"
  }
}
```

Response:

```json
{
  "accepted": true,
  "sessionVersion": 8,
  "queuedCommandId": "lbc_123"
}
```

#### `liveBrowser.takeControl`

Request:

```json
{
  "sessionId": "lbs_123",
  "sessionVersion": 11,
  "idempotencyKey": "takeover-uuid",
  "reason": "manual_selection_required"
}
```

Response:

```json
{
  "accepted": true,
  "status": "human_controlling",
  "controlMode": "takeover",
  "sessionVersion": 12,
  "stream": {
    "controllerToken": "signed-controller-token",
    "expiresAt": "2026-03-10T12:05:00Z",
    "leaseExpiresAt": "2026-03-10T12:04:00Z"
  }
}
```

#### `liveBrowser.returnControl`

Request:

```json
{
  "sessionId": "lbs_123",
  "sessionVersion": 12,
  "idempotencyKey": "return-uuid",
  "checkpoint": "selected_option",
  "notes": "Selected refundable room with breakfast"
}
```

Response:

```json
{
  "accepted": true,
  "status": "agent_running",
  "controlMode": "agent_control",
  "sessionVersion": 13
}
```

#### `liveBrowser.submitAssistResponse`

Request:

```json
{
  "sessionId": "lbs_123",
  "assistRequestId": "lba_123",
  "sessionVersion": 18,
  "idempotencyKey": "assist-uuid",
  "response": {
    "type": "decision",
    "value": "option_b"
  }
}
```

Response:

```json
{
  "accepted": true,
  "assistRequestStatus": "resolved",
  "sessionVersion": 19
}
```

#### `liveBrowser.pauseAgent`

Request:

```json
{
  "sessionId": "lbs_123",
  "sessionVersion": 9,
  "idempotencyKey": "pause-uuid",
  "reason": "user_requested"
}
```

Response:

```json
{
  "accepted": true,
  "status": "waiting_for_human",
  "controlMode": "approve_only",
  "sessionVersion": 10
}
```

#### `liveBrowser.approveAction`

Request:

```json
{
  "sessionId": "lbs_123",
  "sessionVersion": 15,
  "idempotencyKey": "approve-uuid",
  "approvalRequestId": "lbap_123",
  "decision": "approved",
  "notes": "Confirmed booking details look correct"
}
```

Response:

```json
{
  "accepted": true,
  "approvalStatus": "approved",
  "sessionVersion": 16,
  "agentResumed": true
}
```

Note: `rejectAction` ใช้ shape เดียวกันแต่ `"decision": "rejected"` และ `"agentResumed": false`

#### `liveBrowser.cancelSession`

Request:

```json
{
  "sessionId": "lbs_123",
  "sessionVersion": 20,
  "idempotencyKey": "cancel-uuid",
  "reason": "user_cancelled"
}
```

Response:

```json
{
  "accepted": true,
  "status": "cancelled",
  "sessionVersion": 21
}
```

### 13.6 Stream protocol contract

stream layer ต้องส่ง event envelope กลางรูปแบบเดียว:

```json
{
  "eventId": "lbe_123",
  "sessionId": "lbs_123",
  "sessionVersion": 9,
  "type": "navigation_completed",
  "timestamp": "2026-03-10T12:00:00Z",
  "payload": {},
  "cursor": "opaque-cursor"
}
```

Required stream event types:

- `session_state_changed`
- `stream_ready`
- `frame_updated`
- `url_changed`
- `command_queued`
- `command_started`
- `command_completed`
- `command_failed`
- `assist_requested`
- `assist_resolved`
- `approval_requested`
- `approval_resolved`
- `takeover_started`
- `takeover_lease_expiring`
- `takeover_ended`
- `incident`

Rules:

- UI reconnect ต้องใช้ `cursor` เพื่อ replay missed events
- stream transport loss ห้าม imply session state change
- `frame_updated` เป็น transport/UI event; durable audit ต้องใช้ business events แยก
- sensitive payload fields ต้องส่ง redacted representation เท่านั้น

Delivery guarantees:

- business events (state changes, approvals, assists): **at-least-once** with idempotent client-side dedup via `eventId`
- transport events (`frame_updated`): **best-effort**, no replay guarantee
- event replay buffer: max `500` events หรือ `300s` whichever fills first; events older than buffer ต้อง fetch จาก `listEvents` API
- backpressure: ถ้า client ไม่ consume events เร็วพอ stream จะ drop `frame_updated` events ก่อน แต่ buffer business events จนเต็ม limit แล้วจึง disconnect พร้อม `reconnect_required` signal

---

## 14. Data model

### 14.1 New tables

#### `live_browser_sessions`

- `id`
- `tenant_id`
- `user_id`
- `source_type` (`automation`, `workflow`, `agency`)
- `source_id`
- `status`
- `control_mode`
- `session_version` (integer, incremented on every state mutation, used for CAS)
- `controller_actor_type` (`agent`, `user`, `system`, nullable)
- `controller_actor_id` (nullable)
- `controller_connection_id` (nullable, identifies active stream connection)
- `controller_lease_expires_at` (nullable, takeover lease expiry)
- `pause_reason` (nullable)
- `pending_assist_request_id` (nullable, FK to `live_browser_assist_requests`)
- `pending_approval_request_id` (nullable)
- `policy_context_json`
- `browser_context_ref`
- `stream_ref`
- `active_tab_count` (integer, default 1)
- `started_at`
- `last_activity_at`
- `ended_at`
- `end_reason`

#### `live_browser_idempotency_keys`

- `id`
- `session_id`
- `idempotency_key` (unique per session)
- `command_type`
- `response_json` (cached response for dedup)
- `created_at`
- `expires_at` (default: session end + 1 hour)

Note: ใช้ unique constraint `(session_id, idempotency_key)` เพื่อให้ CAS commands ที่ซ้ำคืนผลเดิม

#### `live_browser_events`

- `id`
- `session_id`
- `session_version_at` (version ณ เวลา event เกิด)
- `tenant_id`
- `event_type`
- `actor_type` (`agent`, `user`, `system`, `policy`)
- `actor_id`
- `payload_json`
- `screenshot_ref`
- `cursor` (opaque string for stream replay)
- `created_at`

#### `live_browser_assist_requests`

- `id`
- `session_id`
- `session_version_at` (version when request was created)
- `tenant_id`
- `request_type`
- `status`
- `prompt`
- `context_json`
- `response_json`
- `resolved_session_version_at` (nullable, version when resolved)
- `requested_at`
- `resolved_at`

#### `live_browser_control_transfers`

- `id`
- `session_id`
- `session_version_at` (version when transfer occurred)
- `tenant_id`
- `from_actor_type`
- `from_actor_id`
- `to_actor_type`
- `to_actor_id`
- `reason`
- `policy_check_hash`
- `created_at`

### 14.2 Optional later table

`live_browser_recordings`

ใช้เก็บ replay manifests / compressed event stream / trace metadata สำหรับ support and audit

### 14.3 Persistence and indexing requirements

Required indexes:

- `live_browser_sessions(tenant_id, user_id, status, started_at desc)`
- `live_browser_sessions(status)` partial index WHERE status NOT IN terminal states (for cleanup jobs)
- `live_browser_events(session_id, created_at)`
- `live_browser_events(session_id, cursor)` (for stream replay)
- `live_browser_events(tenant_id, event_type, created_at)`
- `live_browser_assist_requests(session_id, status, requested_at desc)`
- `live_browser_control_transfers(session_id, created_at)`
- `live_browser_idempotency_keys(session_id, idempotency_key)` unique

Retention defaults:

- session rows: 90 days minimum
- assist/control transfer rows: 180 days minimum
- event rows: align with browser policy audit retention baseline
- screenshots/evidence: inherit `evidenceRetentionDays` unless stronger live-session override is configured
- idempotency keys: cleanup expired rows via Celery beat (same job as orphan session cleanup), retain until `expires_at` (session end + 1 hour)

Tamper evidence:

- durable events for approvals, assist resolution, control transfer, and terminal outcomes must be chained or hash-linked consistently with browser policy audit path
- frame transport blobs themselves do not need full tamper-evident persistence by default

### 14.4 Canonical enums

`live_browser_session_status`:

- `created`
- `provisioning`
- `ready`
- `agent_running`
- `waiting_for_human`
- `human_controlling`
- `waiting_for_runtime_recovery`
- `failed_recovery_required`
- `completed`
- `cancelled`
- `failed`
- `expired`

`live_browser_control_mode`:

- `observe`
- `approve_only`
- `takeover`
- `agent_control`

`live_browser_assist_request_type`:

- `decision`
- `field_input`
- `review_page`
- `takeover_required`

---

## 15. Frontend design

### 15.1 New pages/components

- `LiveBrowserPage`
- `LiveBrowserViewport`
- `LiveBrowserChatPanel`
- `LiveBrowserTimeline`
- `LiveBrowserAssistPanel`
- `LiveBrowserApprovalPanel`
- `TakeoverToolbar`

### 15.2 Existing surfaces to update

- `AutomationPage` / `AutomationChatModal`
  - add “Run in Live Mode”
  - attach to existing session
- workflow execution UI
  - link from approval event to live browser session when present
- user/admin settings
  - expose live-mode policy status and permissions

### 15.3 UX rules

- live mode ต้องเปิดได้เฉพาะเมื่อ tenant policy + release gate พร้อม
- ถ้า browser stream unavailable ต้องไม่ fallback เงียบ ๆ เป็น blind execution สำหรับ live request
- session reconnect หลัง refresh ต้อง attach กลับได้

### 15.4 Reconnect and recovery UX

UI ต้องแสดง recovery states อย่าง explicit:

- `reconnecting_stream`
- `waiting_for_runtime_recovery`
- `takeover_connection_lost`
- `approval_stale_revalidation_required`
- `session_recovery_failed`

เมื่อ refresh ระหว่าง takeover:

- UI ต้องกลับมาใน observer mode ก่อน
- ต้อง request control ใหม่หาก lease ไม่ได้ถูก preserve
- ต้องไม่ assume ว่า user ยังถือ keyboard/mouse authority อยู่

### 15.5 Empty, degraded, and blocked states

UI ต้องมี explicit states ต่อไปนี้:

- `feature_not_enabled`
- `tenant_policy_blocked`
- `release_gate_blocked`
- `stream_unavailable`
- `session_expired`
- `sensitive_takeover_requires_reauth`
- `controller_conflict`

Behavior:

- `feature_not_enabled` / `tenant_policy_blocked`: ห้ามโชว์ CTA ที่เริ่ม live session ได้
- `stream_unavailable`: live-mode CTA disabled พร้อม retry affordance
- `controller_conflict`: แจ้งว่ามี actor อื่นถือ control อยู่ และเปิดได้แค่ observer mode

### 15.6 Accessibility requirements

Live viewport เป็น remote canvas (noVNC-compatible) ซึ่งไม่มี native DOM access สำหรับ assistive technology ดังนั้น:

- **Workspace controls** (chat, timeline, assist panel, approval panel, toolbar buttons) ต้อง fully accessible:
  - ARIA roles + labels ทุก interactive element
  - keyboard navigation ด้วย Tab/Enter/Escape ทุกปุ่มหลัก
  - focus management เมื่อเปลี่ยน state (เช่น approval panel โผล่ → auto-focus)
  - screen reader announcements สำหรับ state changes (`aria-live` regions)
- **Browser viewport canvas** ยอมรับว่า not screen-reader accessible by nature แต่:
  - ต้องมี alt text / aria-label บอก current URL + page title + control ownership status
  - agent action summaries ใน timeline ทำหน้าที่เป็น text alternative ของ visual content
  - keyboard shortcuts สำหรับ common actions: `Ctrl+Shift+T` (takeover), `Ctrl+Shift+R` (return control), `Escape` (pause)
- **Color contrast**: ทุก status badge, control indicator ต้องผ่าน WCAG 2.1 AA (4.5:1 ratio)

### 15.7 Mobile and responsive considerations

Live browser workspace ออกแบบสำหรับ **desktop-first** (min viewport 1024px):

- **< 1024px**: แสดง informational banner ว่า "Live Browser Workspace works best on desktop" พร้อม:
  - read-only session status summary
  - approval/assist response buttons (ยังใช้งานได้)
  - chat panel (ยังส่ง commands ได้)
  - **ไม่แสดง** live viewport canvas (bandwidth + usability ไม่เหมาะ)
  - **ไม่เปิด** takeover mode (ต้อง keyboard + mouse precision)
- **Tablet (768-1023px)**: viewport canvas แสดงแบบ scaled-down read-only, takeover disabled
- **Desktop (>= 1024px)**: full experience

---

## 16. Security requirements

1. stream token ต้อง short-lived และ session-bound
2. viewer token กับ controller token ต้องแยกกัน
3. takeover ต้อง require authenticated active user in same tenant
4. session attach ต้องตรวจ tenant isolation ทุกครั้ง
5. agent resume หลัง takeover ต้อง re-check:
   - URL/origin
   - DOM fingerprint
   - approval validity
   - policy state
6. screenshots/events ที่มี sensitive data ต้องอยู่ใต้ retention/redaction policy เดิม
7. live browser stream ต้องไม่เปิด direct public port จาก sandbox

### 16.1 Step-up auth requirements

Sensitive takeover classes:

- auth / identity management
- billing / financial confirmation
- privileged admin console
- restricted-data workflows

เมื่อ user ขอ takeover บน sensitive class ต้องตรวจอย่างน้อย:

- session freshness window
- optional recent password re-entry or 2FA challenge
- explicit elevated confirmation event

ถ้า step-up auth ไม่สำเร็จ:

- session คงอยู่ใน `waiting_for_human`
- takeover request ถูกปฏิเสธแบบ auditable

### 16.2 Human direct input audit requirements

ระบบไม่จำเป็นต้อง log keystroke-by-keystroke แต่ต้องเก็บ:

- focused field metadata ที่ไม่เป็น secret
- action summary (`typed into profile form`, `selected room option`, `navigated to checkout`)
- before/after DOM fingerprints เมื่อ relevant
- screenshot hash หรือ equivalent evidence handle

Secret-like fields ต้องเก็บเฉพาะ redacted metadata

---

## 17. Operational requirements

### 17.1 Performance

- session provisioning < 8s p95
- control handoff < 2s p95
- live viewport latency target < 800ms p95

### 17.2 Reliability

- reconnect หลัง browser tab refresh ได้ภายใน 30s
- orphan session cleanup อัตโนมัติ:
  - sessions ใน `provisioning` > 60s without `stream_ready` → mark `failed`
  - sessions ใน `ready` without activity > `maxIdleTakeoverSeconds` (default 300s) → mark `expired`
  - sessions ใน non-terminal state ที่เกิน `maxLiveSessionDurationSeconds` (default 1800s) → mark `expired` พร้อม `session_expired` event
  - cleanup job ทำงานทุก 30s via Celery beat
- stale control lock cleanup อัตโนมัติ:
  - `controller_lease_expires_at` ที่หมดอายุ → revert เป็น `waiting_for_human`
  - lease check ทำงานทุก 10s ใน session manager event loop

### 17.2.1 Failure and reconnect matrix

| Failure mode | Expected behavior |
|---|---|
| viewer stream disconnect, browser alive | session stays active, UI reconnects, no ownership change |
| controller disconnect during takeover | start grace timer, expire to `waiting_for_human` if not resumed |
| Node restart | clients reconnect, Node rehydrates from Python authoritative state |
| Python restart | active sessions recover if browser context survives; otherwise move to recovery-needed state |
| sandbox/browser crash | session becomes non-terminal recoverable only if restart policy supports same flow; otherwise fail with evidence |
| approval expires during reconnect | pending action invalidated, user must re-approve |
| browser page crash while agent running | pause execution, emit incident, attempt controlled recovery or fail |
| user closes tab during approve_only | session remains waiting until timeout/cancel/resume by same authorized user |

### 17.3 Observability

metrics ที่ต้องมี:

- active live sessions
- stream connection failures
- average takeover duration
- approval wait duration
- assist request completion rate
- policy deny rate in live mode
- session completion vs abandonment

### 17.4 Test strategy and release gates

#### Required test categories

- session state machine unit tests
- CAS/idempotency concurrency tests
- stream reconnect tests
- takeover lease expiry tests
- browser policy parity tests between live and non-live
- RBAC and tenant isolation tests
- assist request lifecycle tests
- recovery tests for Node restart / Python restart / browser crash
- frontend reconnect and degraded-state tests

#### Release gates

live mode must not launch unless:

- browser automation release gate passes
- live stream substrate readiness passes
- reconnect success rate meets target in staging
- approval UX signoff passes
- no split-brain known defects remain open
- audit persistence and tamper-evidence checks pass

### 17.5 SLOs

- live session create success rate >= 99% in controlled rollout
- reconnect success within 30s >= 95%
- takeover request acceptance latency < 2s p95
- approval panel render after approval request < 3s p95

---

## 18. Rollout plan

### Phase 1 — Foundations

- session tables + APIs
- live viewport transport
- session attach/reconnect
- read-only observe mode

### Phase 2 — Agent live control

- same-session chat commands
- pause/resume
- timeline/events

### Phase 3 — Human assist

- structured assist requests
- takeover / return control
- post-takeover continue flow

### Phase 4 — Policy-integrated approvals

- visual approval panel
- live approval to resume action
- audit/replay hardening

### Phase 5 — Transaction-ready UX

- booking/reservation patterns
- compare-and-choose flows
- reusable session templates

---

## 19. ADR decisions

1. **Authoritative runtime owner:** Python `LiveBrowserSessionManager`
2. **Stream substrate:** control-plane-managed remote browser transport with noVNC-compatible semantics, not screenshot polling
3. **Observer sharing:** not enabled for general support/admin in Phase 1; owner-user only by default
4. **Recording format:** event stream + screenshots/evidence handles, not full frame recording by default
5. **Workflow-attached sessions:** owner-user attach starts in Phase 2, broader attach patterns later
6. **Sensitive takeover auth:** reuse session freshness + step-up auth/2FA controls where available

These decisions are normative for implementation unless superseded by a later revision.

---

## 20. Acceptance criteria

Feature นี้ถือว่าพร้อมเมื่อ:

1. user เปิด live browser workspace แล้วเห็น browser session จริงได้
2. agent รับคำสั่งต่อเนื่องใน chat แล้วทำงานบน session เดิมได้
3. user takeover มาคลิก/พิมพ์เองได้ และคืน control ให้ agent ได้
4. agent สามารถสร้าง assist request แบบ decision/input ได้
5. approval ที่เกิดจาก browser policy แสดงใน live workspace พร้อม action context
6. tenant/user policy เดิมยังถูก enforce ครบใน live mode
7. direct browser path ไม่มีทาง bypass live-mode/policy invariants
8. reconnect หลัง refresh ทำงานได้
9. ทุก control transfer, approval, assist, completion มี durable audit event
10. concurrent `takeover` / `return_control` requests ไม่ทำให้ ownership split-brain
11. human takeover ไม่ bypass hard-block policy classes
12. refresh/reconnect ระหว่าง `waiting_for_human` และ `human_controlling` กลับสู่ state ที่ถูกต้อง
13. live-mode audit stream กับ non-live browser-policy audit stream ใช้ correlation และ reason-code semantics ชุดเดียวกัน

---

## 21. Remaining questions

1. จะ reuse control-plane transport implementation ที่มีอยู่แค่ไหนก่อนต้องสร้าง broker ใหม่
2. live browser evidence ควรใช้ storage tier เดียวกับ browser-policy audit หรือแยก bucket/prefix
3. ควรเพิ่ม optional coarse-grained session replay video export ใน Phase 4 หรือหลัง launch
4. sandbox provider: self-hosted headed Chromium (current Playwright setup) vs cloud browser sandbox service (Browserbase, etc.) — cost/latency tradeoff ที่ scale
5. bandwidth estimation per session: noVNC stream ~1-5 Mbps per viewer ควรวาง capacity plan สำหรับ concurrent sessions
6. multi-user observer mode (Phase 2+): ถ้า admin หรือ support ต้อง observe session ของ user → ต้องออกแบบ viewer multiplexing หรือ restream
7. session transfer across devices: ถ้า user เริ่ม session บน desktop แล้วอยากย้ายไป tablet (observe-only) → ต้องรองรับ multi-device attach หรือไม่

---

## 22. Implementation sections

### Section 1 — Authoritative Session Core

- `live_browser_sessions` + `live_browser_idempotency_keys` + canonical enums
- Python session manager with `session_version` CAS
- idempotency key tracking and dedup
- lease management (`controller_lease_expires_at`)
- resource limits enforcement (concurrent sessions per tenant/user)
- state machine tests + CAS concurrency tests

### Section 2 — Stream Transport and Attach

- browser sandbox headed mode
- stream broker + tokens
- viewer attach/reconnect
- degraded/blocked states

### Section 3 — Live Command Execution

- `sendCommand`
- attach Copilot planner/controller to session state
- command events and timeline
- policy parity with non-live execution

### Section 4 — Human Assist and Takeover

- structured assist requests
- takeover/return control
- post-takeover checkpoint + resume
- sensitive takeover step-up auth

### Section 5 — Approval and Audit Integration

- live approval panel
- approval resolution -> resume path
- audit parity / tamper evidence / evidence retention

### Section 6 — Workflow and Agency Attach

- workflow-attached live sessions
- agency/workflow resume semantics
- tenant/RBAC attach rules

### Section 7 — Rollout, Ops, and Hardening

- metrics/SLOs
- recovery drills
- release gates
- support tooling / inspection / cleanup jobs
- orphan session cleanup (Celery beat)
- stale lease cleanup
- rate limiting configuration
- capacity planning for concurrent sandbox sessions

---

## 23. Implementation guidance

ลำดับลงมือที่แนะนำ:

1. ปิด shared session model และ control state machine ก่อน
2. ทำ live viewport transport ให้ใช้งานได้จริง
3. ผูก chat commands กับ session เดิม
4. เพิ่ม takeover/handoff
5. ค่อย integrate approval/policy visualization

หลักสำคัญ:

- ห้ามเริ่มจาก UI ก่อนโดยไม่มี authoritative session state machine
- ห้ามใช้ screenshot polling เป็น final solution สำหรับ takeover use case
- ห้ามให้ live mode เป็นทาง bypass policy engine เดิม
