# Feature 077 Release Note

## SmartSpecPro Claw Runtime Suite

Release date: 2026-04-09  
Status: Important platform release note and operator guide  
Scope: Consolidated guidance across Features 071, 072, 074, 075, and 077  
Verified against official runtime docs on: 2026-04-09 (Asia/Bangkok)

---

## ภาษาไทย

### สรุปสั้น ๆ

SmartSpecPro ตอนนี้ไม่ได้รองรับแค่ OpenClaw worker ภายนอกอีกต่อไป แต่มีภาพสถาปัตยกรรมที่ชัดขึ้นสำหรับ **Claw runtime ecosystem ทั้งชุด** โดยวาง **SmartSpecPro Web** เป็น control plane กลาง, **SmartSpec Desktop Host** เป็น machine host ที่มี trust model ของตัวเอง, และเปิดทางให้เชื่อม runtime หลายสายได้ตามลักษณะงาน:

- `openclaw_gateway` สำหรับ external general-purpose agent runtime
- `desktop_zeroclaw_managed` สำหรับ local desktop execution, files, GPU, media, และ companion runtimes
- `nemoclaw_sandbox` สำหรับ secure sandbox / egress-controlled execution
- `hiclaw_cluster` สำหรับ collaborative manager-workers clusters

เอกสารนี้ตั้งใจเป็น release note ฉบับสำคัญที่รวม:

- ฟังก์ชันหลักของระบบตระกูล Claw ที่เกี่ยวข้องกับ SmartSpecPro
- หลักการทำงานของแต่ละ runtime
- วิธีที่ SmartSpecPro ใช้หรือเชื่อม runtime เหล่านี้ร่วมกัน
- สิ่งที่ปล่อยจริงใน repo ปัจจุบัน
- guardrails, security posture, และข้อจำกัดที่ทีมต้องเข้าใจตรงกัน

### Runtime ที่ครอบคลุมในเอกสารนี้

runtime และระบบกลุ่มเดียวกันที่เอกสารนี้ครอบคลุมมี 3 ระดับ:

1. **First-class SmartSpecPro runtime families**
   - OpenClaw
   - ZeroClaw managed desktop runtime
   - NemoClaw
   - HiClaw
2. **Adjacent Claw-family systems**
   - CoPaw
   - NanoClaw
   - worker/runtime variants ที่มักอยู่หลัง HiClaw หรือ external runtime stacks
3. **SmartSpecPro execution labels ที่เกี่ยวข้อง**
   - Pi
   - Agency Swarm

หมายเหตุสำคัญ:

- SmartSpecPro มี first-class runtime identity จริงแค่ 4 ตัวใน worker fabric คือ `openclaw_gateway`, `desktop_zeroclaw_managed`, `nemoclaw_sandbox`, และ `hiclaw_cluster`
- runtime กลุ่มใกล้เคียงอย่าง CoPaw, NanoClaw, หรือ variant อื่น ๆ ถูกมองเป็น worker implementation หรือ future profile จนกว่าจะมี registration contract ของตัวเอง
- `Pi` และ `Agency Swarm` เป็น product/runtime labels ฝั่ง SmartSpecPro Desktop ตาม Feature 075 ไม่ใช่ external worker registry identity แบบเดียวกับ OpenClaw หรือ HiClaw

---

## 1. Runtime Catalog

| ระบบ | เป็นอะไร | ฟังก์ชันเด่น | SmartSpecPro ใช้ทำอะไร |
|---|---|---|---|
| OpenClaw | self-hosted gateway + agent runtime | sessions, channels, tools/plugins, skills, workspace, gateway ops | external operator workers และ delegated platform work |
| ZeroClaw | lightweight personal/local assistant runtime | onboard, gateway, dashboard, daemon, doctor, channels, hardware/peripherals | managed local runtime profile ใต้ Desktop Host |
| NemoClaw | OpenClaw-on-OpenShell secure stack | sandbox, network policy, egress approval, sandbox hardening, secure inference routing | secure worker pool สำหรับงานเสี่ยงสูงหรือ policy-heavy |
| HiClaw | collaborative multi-agent runtime platform | Manager-Workers, Matrix rooms, Higress gateway, MinIO shared files, human-in-the-loop | collaborative cluster path สำหรับทีม agent แบบ observable |
| CoPaw / NanoClaw / variants | lighter worker engines หรือ alternate agent containers | footprint ต่ำลง, template-driven teams, alternate runtimes | ใช้เป็น worker implementation ใต้ HiClaw หรือ future runtime profile; ยังไม่ใช่ top-level SmartSpecPro runtime type |
| Pi / Agency Swarm | SmartSpecPro desktop-interactive categories | Pi = desktop-local interactive runtime, Agency Swarm = complex orchestration layer | user-facing local execution model ฝั่ง Desktop Host; ไม่ใช่ worker registry type โดยตรง |

---

## 2. แต่ละระบบทำอะไร และทำงานอย่างไร

### 2.1 OpenClaw

OpenClaw คือ runtime แบบ **gateway-centric** ที่เก่งเรื่อง assistant node, long-lived sessions, channels, tools, plugins, skills, และ remote operation surfaces

ฟังก์ชันสำคัญจาก official docs:

- มี **Gateway** ตัวเดียวต่อ host เป็นจุดรวม messaging surfaces และ control-plane connections
- มี **Session Management** ที่แยก session ตาม DM, group, room, cron, webhook
- มี **embedded agent runtime** พร้อม workspace, skills, built-in tools, และ session persistence
- มี **Channels** จำนวนมาก เช่น Discord, Slack, Telegram, Matrix, WhatsApp, Teams และอื่น ๆ
- มี **Windows path** ทั้ง native และ WSL2 แต่ official docs ยังแนะนำ WSL2 เป็นเส้นทางที่เสถียรกว่า

วิธีคิดเชิง product:

- OpenClaw เหมาะกับการเป็น **external general-purpose agent runtime**
- มันไม่ใช่ desktop-local media worker โดยธรรมชาติ
- ถ้าจะให้ SmartSpecPro ใช้ OpenClaw ให้ใช้ในบทบาท:
  - personal bound worker
  - long-running external assistant
  - browser/tool-heavy automation
  - delegated platform access

### 2.2 ZeroClaw

ZeroClaw คือ runtime แบบ **personal/local-first** ที่เน้น footprint ต่ำ, daemon mode, และ control surfaces ครบในตัวเอง

ฟังก์ชันสำคัญจาก official README:

- มี onboarding path ผ่าน `zeroclaw onboard`
- มี gateway, web dashboard, agent mode, daemon mode, status, และ `doctor`
- รองรับ channels จำนวนมาก
- มี migration path จาก OpenClaw
- มี security defaults เช่น pairing, autonomy levels, allowlisting, path blocking, rate limits
- รองรับ deployment บนอุปกรณ์เล็กและ hardware/peripheral integrations

วิธีคิดเชิง product:

- ใน SmartSpecPro เรา **ไม่ใช้ ZeroClaw เป็น personal dashboard product ของผู้ใช้โดยตรง**
- เราใช้มันในฐานะ **managed local runtime profile** ใต้ Desktop Host
- สิ่งที่ SmartSpecPro ดึงมาใช้คือ:
  - local execution surface
  - lifecycle hooks
  - diagnostics / doctor / health semantics
  - constrained workspace execution
  - optional WSL2-managed path

### 2.3 NemoClaw

NemoClaw คือ stack สำหรับรัน OpenClaw ในสภาพแวดล้อมที่ harden ขึ้น โดยใช้ NVIDIA OpenShell เป็น sandbox runtime

ฟังก์ชันสำคัญจาก official NVIDIA docs:

- เป็น **alpha software** และเอกสารเตือนชัดว่าไม่ควรใช้ใน production โดยไม่ยอมรับความเสี่ยงของ early preview
- วางตัวเป็น OpenClaw plugin / reference stack ที่เพิ่ม privacy และ security controls
- มี **strict-by-default network policy**
- รองรับ **operator-controlled egress approval**
- มี sandbox hardening เช่น capability dropping, process limits, baseline filesystem/network policy
- รองรับ inference profile และ remote GPU deployment

วิธีคิดเชิง product:

- ใน SmartSpecPro เราใช้ NemoClaw เป็น **secure worker pool option**
- เหมาะกับงาน:
  - high-risk browsing / automation
  - sensitive tasks
  - policy-heavy routes
  - งานที่ต้องควบคุม network egress ชัดเจน
- ไม่ใช่ desktop default
- ไม่ควรถูกอธิบายว่าเป็นเส้นทางทั่วไปแทน Desktop Host

### 2.4 HiClaw

HiClaw คือ **collaborative multi-agent runtime platform** ที่ออกแบบมาสำหรับ manager-workers coordination และ human-in-the-loop visibility

ฟังก์ชันสำคัญจาก official README:

- ใช้ **Manager-Workers architecture**
- ใช้ **Matrix rooms** เพื่อให้คนเห็นและแทรกแซงการทำงานได้
- ใช้ **MinIO shared file system** เพื่อแลกไฟล์ระหว่าง agents
- ใช้ **Higress AI Gateway** เพื่อเก็บ credential จริงไว้ที่ gateway
- workers ถือเพียง consumer token แทนการถือ secret หลัก
- รองรับ mobile/Matrix clients และมี install flow พร้อม local-only หรือ external access mode
- รองรับ worker templates และ marketplace
- official roadmap ยังบอกชัดว่า lightweight workers อย่าง ZeroClaw / NanoClaw เป็นส่วนที่กำลังพัฒนาอยู่ใน ecosystem นี้

วิธีคิดเชิง product:

- ใน SmartSpecPro เราใช้ HiClaw เป็น **collaborative cluster runtime**
- เหมาะกับงาน:
  - visible research squads
  - multi-agent collaboration
  - manager-mediated execution
  - human-observable task delegation
- ไม่ใช่ replacement ของ Desktop Host
- ไม่ใช่ replacement ของ OpenClaw personal worker

### 2.5 ระบบกลุ่มเดียวกันที่ SmartSpecPro ยังไม่ยกเป็น first-class runtime type

ตัวอย่าง:

- **CoPaw**
- **NanoClaw**
- lightweight worker runtimes อื่น ๆ

บทบาทใน SmartSpecPro วันนี้:

- มองเป็น runtime/worker implementation ภายใน cluster หรือ future external profile
- ยังไม่ควรถูกโฆษณาเหมือนว่า SmartSpecPro มี registry contract แยกเฉพาะให้แล้ว
- ถ้าจะรองรับแบบ first-class ต้องเพิ่ม:
  - registration metadata
  - policy snapshot model
  - scheduler semantics
  - fleet/admin truth
  - workflow/runtime routing rules

---

## 3. SmartSpecPro ใช้ runtime เหล่านี้ร่วมกันอย่างไร

### 3.1 SmartSpecPro Web เป็น control plane กลาง

ไม่ว่า runtime ใดจะทำงานจริง SmartSpecPro Web ยังคงเป็นเจ้าของ:

- auth / authorization
- tenant, team, persona, workflow context
- worker registry
- policy distribution
- scheduling and routing
- artifact publication
- audit / admin / fleet controls
- indexing and Library/RAG linkage

### 3.2 SmartSpec Desktop Host เป็น machine host

สำหรับงานที่ต้องแตะเครื่องจริง SmartSpecPro ใช้ Desktop Host เป็น trust boundary และ machine host layer

Desktop Host รับผิดชอบ:

- device identity และ proof posture
- desktop enrollment / worker projection
- local workspace และ parser/runtime capability reporting
- doctor summary และ diagnostics
- local execution loop สำหรับ typed desktop jobs
- secure credential storage และ offboarding cleanup

### 3.3 Runtime mapping ที่ใช้จริงใน SmartSpecPro

runtime family ใน SmartSpecPro map แบบนี้:

- `openclaw_gateway`
  - external worker
  - owner-bound delegated operator path
- `desktop_zeroclaw_managed`
  - local managed worker path
  - typed jobs สำหรับ file/media/Comfy workloads
- `nemoclaw_sandbox`
  - secure sandbox path
  - security-class routing
- `hiclaw_cluster`
  - collaborative cluster path
  - multi-agent / human-observable work

### 3.4 Artifact flow เหมือนกัน แต่ execution semantics ต่างกัน

ถึง runtime จะต่างกัน แต่ SmartSpecPro พยายาม normalize ปลายทางของผลลัพธ์ให้เหมือนกัน:

1. job ถูก dispatch จาก Web
2. runtime claim งานตาม policy และ compatibility
3. runtime ทำงานใน trust boundary ของตัวเอง
4. upload artifact กลับผ่าน scoped tokens / signed uploads
5. SmartSpecPro publish artifact เข้า Library / media / workflow history
6. trigger indexing / RAG ตามชนิดงาน

สิ่งที่ต่างกันจริงคือ:

- การได้สิทธิ์ใช้งาน
- ระดับ sandbox
- ลักษณะ file access
- visibility / human intervention model
- delegated platform semantics

---

## 4. ฟังก์ชันที่ปล่อยจริงใน SmartSpecPro ตอนนี้

### 4.1 OpenClaw external runtime

สิ่งที่พร้อมใช้แล้ว:

- worker registration, heartbeat, claim, event, diagnostics, artifact flow
- admin monitoring และ worker controls
- owner-bound personal worker model
- team binding ผ่าน External Connector และ Bound Worker
- delegated platform access สำหรับ supported jobs
- worker budgeting / credit attribution
- truthful MCP discovery/execution สำหรับ supported families

เหมาะกับ:

- ผู้ช่วยส่วนตัวภายนอก
- งาน browser/tool-heavy
- session-based operator work

### 4.2 Desktop Host + managed local runtime

สิ่งที่พร้อมใช้แล้ว:

- device enrollment และ worker projection path
- desktop capability reporting
- doctor summary
- typed desktop credentials
- local execution loops สำหรับ typed worker jobs
- workspace-root และ local path guardrails

เหมาะกับ:

- local files
- media transformation
- GPU / render-adjacent work
- companion runtimes บนเครื่อง

### 4.3 Typed desktop jobs ชุดแรก

ใน worker fabric ปัจจุบัน SmartSpecPro รองรับ typed jobs ชุดแรกดังนี้:

- `video_assembly`
- `local_folder_ingest`
- `comfy_image_generation`
- `comfy_workflow_run`

ภาพรวมการใช้งาน:

- `video_assembly`
  - render / transcode / subtitle / thumbnail / media artifact publication
- `local_folder_ingest`
  - enumerate files ใน root ที่อนุญาต, สร้าง manifest/summary, publish artifact, trigger indexing
- `comfy_image_generation`
  - วิ่งกับ local loopback-only Comfy service เพื่อ generate image outputs แล้ว publish กลับ
- `comfy_workflow_run`
  - ส่ง workflow แบบกำหนดเองให้ companion service รัน แล้วเก็บ outputs / manifests / artifact links กลับ

### 4.4 Workflow integration

workflow runtime path ตอนนี้รองรับ node bridge หลักแล้ว:

- `dispatch_worker_job`
- `wait_for_worker_completion`
- `publish_worker_artifacts`
- `trigger_worker_rag_index`

ผลลัพธ์คือ workflow สามารถ:

- route ไป runtime ที่เหมาะกับงาน
- รอ terminal status
- publish artifact เข้า SmartSpecPro
- trigger indexing ต่อได้โดยไม่ต้อง hard-code runtime ตรง ๆ ทุกจุด

### 4.5 NemoClaw และ HiClaw

ใน release line นี้ SmartSpecPro รองรับ runtime semantics ของ NemoClaw / HiClaw ชัดขึ้นแล้วในระดับ:

- runtime identity
- registration metadata
- routing intent
- security class / capability family awareness
- workflow dispatch bridge

การตีความที่ถูกต้องคือ:

- SmartSpecPro พร้อม “รับรู้และ route” NemoClaw / HiClaw เป็น runtime คนละชั้นอย่างตรงความจริง
- SmartSpecPro ไม่ได้อ้างว่าไปแทน implementation ภายในของ NemoClaw หรือ HiClaw เอง

---

## 5. ใช้งานร่วมกันแบบไหนถึงจะถูก

### แบบที่ 1: personal external operator

ใช้:

- OpenClaw
- Bound Worker
- delegated platform access

เหมาะกับ:

- ผู้ใช้มี worker ของตัวเอง
- อยากให้ worker คุยกับ SmartSpecPro แบบภายใต้ grant ที่ชัดเจน
- อยากให้ worker ใช้ Library / RAG / callback / workflow update ของเจ้าของ

### แบบที่ 2: managed desktop media worker

ใช้:

- SmartSpec Desktop Host
- `desktop_zeroclaw_managed`
- typed worker jobs

เหมาะกับ:

- local path jobs
- media assembly
- folder ingest
- Comfy companion workloads

### แบบที่ 3: secure sandbox pool

ใช้:

- NemoClaw
- security-class routing

เหมาะกับ:

- งานเสี่ยงสูง
- งานที่ต้องคุม network egress
- งานที่ไม่ควรปล่อยให้ worker ทั่วไปถือ credential หรือ filesystem access กว้างเกินไป

### แบบที่ 4: collaborative visible agent team

ใช้:

- HiClaw
- manager-workers orchestration
- human-observable rooms

เหมาะกับ:

- multi-agent squads
- collaborative research
- operator intervention ที่ต้องเห็นทุก step

### แบบที่ไม่ควรสลับใช้แทนกันแบบตรง ๆ

- อย่าใช้ OpenClaw เป็นตัวแทน desktop media worker ถ้างานต้องแตะไฟล์ในเครื่องหรือ GPU
- อย่าใช้ HiClaw แทน Desktop Host สำหรับ local Windows render jobs
- อย่าใช้ ZeroClaw managed desktop profile ไปอธิบายเหมือน collaborative cluster
- อย่าใช้ NemoClaw เป็น default ทุกงาน เพราะต้นทุนและ hardening overhead สูงกว่า

---

## 6. Security และ governance ที่สำคัญ

### 6.1 กฎกลางของ SmartSpecPro

- Web เป็น control plane กลาง
- token ต้อง short-lived, scoped, revocable, auditable
- artifact publication ต้อง reuse safe-serving / content-type controls
- centralized logs และ diagnostics ต้อง redact secret และ path-sensitive data

### 6.2 กฎเฉพาะของ personal OpenClaw workers

- owner-bound ตาม Feature 072
- cross-tenant ไม่ได้
- delegated access ต้องมาจาก job-bound grants
- budget guardrails และ concurrency caps ยังบังคับใช้

### 6.3 กฎเฉพาะของ Desktop Host

- local file access เป็น policy-bound
- workspace-scoped เป็นค่าเริ่มต้น
- source path ต้องผ่าน normalization / boundary checks
- local companion services เช่น Comfy ถูกคาดหวังให้ bind แบบ loopback-only
- device identity, signed package/update trust, และ offboarding cleanup เป็น first-class concern

### 6.4 กฎเฉพาะของ NemoClaw

- ใช้ strict network policy
- egress approval เป็นคุณสมบัติสำคัญ ไม่ใช่ side feature
- เหมาะกับ high-risk tasks มากกว่างานทั่วไป

### 6.5 กฎเฉพาะของ HiClaw

- credentials หลักควรอยู่ที่ gateway
- workers ควรถือ consumer token หรือ scope ต่ำกว่า
- จุดแข็งคือ transparency และ intervention ไม่ใช่การซ่อน execution ไว้หลัง black box

---

## 7. Operator checklist

### 7.1 ถ้าจะเริ่มจาก OpenClaw

1. เปิด tenant feature flags ที่เกี่ยวข้อง
2. ให้ worker register
3. ผูก worker กับ team/connector ตาม owner model
4. ตรวจ Monitoring, Credits, และ delegated manifests

### 7.2 ถ้าจะเริ่มจาก Desktop Host + ZeroClaw managed path

1. enroll desktop device
2. ตรวจ device identity / doctor summary / toolchain readiness
3. ตั้ง workspace roots และ policy profile
4. ทดสอบ `video_assembly` หรือ `local_folder_ingest`
5. ตรวจ artifact publication และ indexing

### 7.3 ถ้าจะเริ่มจาก NemoClaw

1. ใช้เฉพาะ admin-controlled rollout
2. กำหนด security class ให้ชัด
3. review network policy และ egress behavior ก่อน
4. อย่าโฆษณาเป็น production default หาก deployment ยังอยู่บน alpha constraints

### 7.4 ถ้าจะเริ่มจาก HiClaw

1. มองเป็น cluster/manager endpoint
2. ใช้กับ collaborative teams ไม่ใช่ per-user personal worker
3. ตกลงเรื่อง visibility, human intervention, และ room governance ให้ชัด

---

## 8. ข้อจำกัดและ truthfulness ที่ต้องพูดตรง ๆ

- SmartSpecPro รองรับ runtime families หลายสาย แต่ไม่ได้หมายความว่าทุก runtime มี semantics เหมือนกัน
- OpenClaw path ยังเป็นเส้นทาง delegated external operator ที่ mature ที่สุด
- Desktop managed path คือเส้นทางหลักของ local files / GPU / media / Comfy
- NemoClaw เหมาะกับ secure pool มากกว่าการเป็นค่าเริ่มต้น
- HiClaw เหมาะกับ collaborative clusters มากกว่าการเป็น worker บนเครื่องเดียว
- CoPaw, NanoClaw, และ runtime variants อื่นยังไม่ใช่ top-level SmartSpecPro runtime types เว้นแต่จะมี profile ของตัวเองในอนาคต

---

## 9. เอกสารภายในที่เกี่ยวข้อง

- Feature 071 release note: [release-note.md](/home/dev/projects/SmartSpecPro/specs/feature/071-openclaw-external-runtime-integration/release-note.md)
- Feature 072 release note: [release-note.md](/home/dev/projects/SmartSpecPro/specs/feature/072-claw-worker-platform-access/release-note.md)
- Feature 075 release note: [release-note.md](/home/dev/projects/SmartSpecPro/specs/feature/075-unified-web-desktop-agent-platform/release-note.md)
- Feature 077 spec: [spec.md](/home/dev/projects/SmartSpecPro/specs/feature/077-distributed-worker-fabric-completion/spec.md)
- OpenClaw workers help: [openclaw-workers.md](/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/openclaw-workers.md)
- Desktop Host help: [desktop-host-managed-mode.md](/home/dev/projects/SmartSpecPro/apps/web/docs/help/th/desktop-host-managed-mode.md)
- Worker runtime contracts: [workerRuntime.ts](/home/dev/projects/SmartSpecPro/apps/web/shared/workerRuntime.ts)

---

## 10. Official source snapshot used for this release note

Official runtime docs checked on 2026-04-09 (Asia/Bangkok):

- ZeroClaw GitHub README: <https://github.com/zeroclaw-labs/zeroclaw>
- OpenClaw Windows: <https://docs.openclaw.ai/platforms/windows>
- OpenClaw Gateway Architecture: <https://docs.openclaw.ai/architecture>
- OpenClaw Agent Runtime: <https://docs.openclaw.ai/concepts/agent>
- OpenClaw Session Management: <https://docs.openclaw.ai/concepts/session>
- OpenClaw Channels: <https://docs.openclaw.ai/channels>
- NVIDIA NemoClaw overview: <https://docs.nvidia.com/nemoclaw/latest/>
- NVIDIA NemoClaw network policies: <https://docs.nvidia.com/nemoclaw/0.0.4/reference/network-policies.html>
- NVIDIA NemoClaw sandbox hardening: <https://docs.nvidia.com/nemoclaw/latest/deployment/sandbox-hardening.html>
- HiClaw official repository/README: <https://github.com/agentscope-ai/HiClaw>

---

## English

### Summary

This release note consolidates SmartSpecPro's Claw-runtime story across Features 071, 072, 074, 075, and 077.

SmartSpecPro now treats the Claw ecosystem as a **multi-runtime fabric**:

- `openclaw_gateway` for external general-purpose assistant workers
- `desktop_zeroclaw_managed` for machine-local, policy-bound file/media/GPU/companion jobs
- `nemoclaw_sandbox` for high-control sandboxed execution
- `hiclaw_cluster` for collaborative, human-observable agent teams

### What each runtime is best at

- **OpenClaw**
  - best for long-lived external sessions, channels, tools/plugins, and delegated platform work
- **ZeroClaw**
  - best for lean, machine-local managed runtime behavior under SmartSpec Desktop Host
- **NemoClaw**
  - best for secure-pool, egress-controlled, policy-heavy execution
- **HiClaw**
  - best for manager-workers collaboration with Matrix-room visibility and gateway-held credentials

### What SmartSpecPro ships in this release line

- OpenClaw external workers with monitoring, routing, delegated access, budget controls, and truthful MCP surfaces
- Desktop Host enrollment, worker projection, capability reporting, doctor summaries, typed credentials, and managed local execution
- Typed desktop job families:
  - `video_assembly`
  - `local_folder_ingest`
  - `comfy_image_generation`
  - `comfy_workflow_run`
- Workflow worker-runtime nodes for dispatch, wait, publish, and indexing
- Runtime-aware normalization across worker registry, scheduling, policy, artifact publication, and admin truth

### Core truthfulness rules

- Not every Claw-family runtime means the same thing inside SmartSpecPro
- OpenClaw is the mature external operator path
- Desktop + managed ZeroClaw is the correct path for local files, GPU, media, and Comfy-style companion execution
- NemoClaw is a secure pool option, not the default desktop path
- HiClaw is a collaborative cluster, not a desktop-local replacement
- Adjacent runtimes such as CoPaw and NanoClaw are ecosystem-relevant, but they are not top-level SmartSpecPro worker runtime identities today
