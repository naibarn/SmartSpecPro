# SmartSpecPro Repository Coverage — 2026-09-19

เอกสารนี้เป็นฐานหลักฐานสำหรับ infographic ในโฟลเดอร์เดียวกัน โดยสรุปจาก source ปัจจุบันใน repo และสถานะที่ระบุไว้ใน feature specifications ไม่ได้ตีความว่า local source เท่ากับ production readiness

## ภาพที่สร้าง

- `01-system-coverage-overview.svg` — แผนที่ coverage ระดับระบบ
- `02-workflow-builder-runtime-coverage.svg` — เส้นทาง Workflow Builder ไปจนถึง Runner/Runtime และช่องว่างสำคัญ
- `03-feature-coverage-matrix-186-211.svg` — matrix ของ Feature 186–211

## สถานะที่ใช้

- **มีหลักฐานใน repo** — พบ route/service/schema/runtime code หรือ focused tests ที่สอดคล้องกับขอบเขตนั้น
- **มีบางส่วน / ยังไม่ครบ** — มี building blocks หรือ local implementation แต่ยังขาดการเชื่อมต่อ, deployment, target-account, provider acceptance หรือ production recovery proof
- **spec / target** — เอกสารกำหนดทิศทาง แต่การ implement ยังไม่ควรนับเป็นของที่ใช้งานได้แล้ว
- **retired residue** — พบชื่อหรือ artifact เก่าคงค้างใน repo; ห้ามเพิ่ม caller/route/schema/migration ใหม่ให้ระบบเหล่านี้

## หลักฐานหลักที่ใช้ทำภาพ

### Workflow Studio และ user choice

- `apps/web/server/routers/workflowStudio.ts` มี `previewCandidate`, `createDraft`, `publishVersion`, `publishApp` และ marketplace surface
- `apps/web/server/services/workflowStudioContracts.ts` มี validation, cycle check, secret redaction และ publish immutability contract
- `apps/web/server/services/workflowBuilderCompiler.ts` รับ `intent` กับ `options` แล้วเลือก ready option แรกที่ caller ส่งมา
- `apps/web/server/routers/runnerNodes.ts` อ่าน runner inventory และส่ง `status`, `availability`, `auth`, `health`, `policy`, `reasonCodes` แบบ tenant-scoped
- ข้อสรุป: มีชิ้นส่วนของ builder และ readiness projection แล้ว แต่ยังไม่พบ execution-option discovery service กลางที่ probe ทุกทางเลือก, เปรียบเทียบข้อดีข้อจำกัด, แนะนำวิธีติดตั้ง และบันทึก user selection ก่อนสร้าง workflow definition ครบวงจร

### Durable execution และ runtimes

- `apps/web/server/services/jobControlPlane.ts` มี canonical job admission, attempts, lifecycle events, outbox, checkpoint recovery และ settlement fencing
- `python-backend/app/orchestrator/workflow_compiler.py` compile ReactFlow JSON เป็น LangGraph `StateGraph`
- `python-backend/app/orchestrator/langgraph_runtime.py` มี PostgreSQL checkpointing, execute, stream, resume และ recovery boundary
- `apps/runner-app/src/discovery.rs` มี trust/readiness dimensions สำหรับ Agent CLI, Agent Harness, Media, Browser, Desktop, Local AI, MCP และ Generic CLI
- `apps/runner-app/src/protocol.rs` มี `sah-runner-v1`, local/managed profiles และ ack semantics
- `apps/web/server/services/agentRuntime/client.ts` มี run/stream/resume/cancel/health adapter boundary สำหรับ OpenAI Agents runtime

### Data, product และ integration surface

- Web client/server, Python backend, Worker App, Runner, Extension, Tauri/Desktop และ Cloudflare-related code มีอยู่เป็นหลาย runtime surface
- Drizzle/Postgres schema และ worker job tables รองรับ workflow, runner, artifact/library, tenant, credit และ control-plane slices หลายส่วน
- MCP, browser/computer-use, marketplace, library/artifact และ vector-provider adapters มีอยู่แบบผสมระหว่าง local implementation กับ target integration

### Feature status signals

สถานะใน matrix อ่านร่วมกับ source ปัจจุบัน: Feature 186–189 ระบุ local implementation/readiness แต่ยังมี external gates; 193 และ 205 ระบุ local implementation ของ editor/runner foundation; 195–200 และ 209 ระบุ partial; 206 ระบุ planning-only/no A2A adapter; 207–208 เป็น target architecture; 210 ระบุ Orca route ยังไม่ production-enabled; 211 ระบุยังไม่มี ACP/Gas City adapter/bridge

## Static scan boundary

การสแกนตัด `.git`, `node_modules`, build output, cache และ `.claude/worktrees` ออกจาก architecture map เพราะ worktree เก่าอาจทำให้ระบบที่ retired หรือ code คนละ revision ปะปนกับ current tree ได้ ตัวเลขด้านล่างเป็นขนาด source ที่พบ ไม่ใช่เปอร์เซ็นต์ test coverage:

| พื้นที่ | ไฟล์ | บรรทัดโดยประมาณ |
|---|---:|---:|
| `apps/web/server` | 2,800 | 587,289 |
| `apps/web/client/src` | 1,623 | 93,194 |
| `python-backend/app` | 644 | 206,223 |
| `apps/runner-app/src` | 19 | 3,927 |
| `apps/worker-app` | 1,356 | 52,524 |
| `apps/extension/src` | 18 | 13,832 |

## Important boundary

ภาพนี้เป็น repository coverage map ไม่ใช่ production certification โดยเฉพาะยังไม่ได้อ้างว่า target Cloudflare account, installed Runner ของ user, provider authentication, Windows/macOS acceptance, browser fixture, live A2A, ACP/Gas City หรือ deployment recovery ทำงานจริงครบแล้ว

พบ retired residue เช่น legacy `/workflows`, Agency/workpack references, `sandbox_jobs`/OpenSandbox references และ historical tests/docs บางส่วนใน repo ภาพจึงทำเครื่องหมายเป็น “residue / do not extend” ไม่ได้นับเป็น active architecture ใหม่
