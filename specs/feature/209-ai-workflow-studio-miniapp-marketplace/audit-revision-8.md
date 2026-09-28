# Spec 209 — 20-round repository convergence audit across Specs 186–210

วันที่ตรวจ: 2026-09-19

เอกสารนี้เป็นการตรวจรอบใหม่โดยยึด codebase เป็นหลัก ไม่ถือว่า spec ที่เขียนไว้
เป็น implementation proof. SocratiCode MCP ไม่พร้อมใช้งานใน session นี้ จึงใช้
targeted shell discovery, symbol search, exact source reads, migration reads และ
focused contract tests แทน โดยไม่รัน repository-wide TypeScript typecheck ตาม
ข้อจำกัดใน `AGENTS.md`.

## ผลสรุป

Spec 209 มี architecture และ boundary ที่สอดคล้องกับระบบหลักหลัง Revision 8
แต่ยังเป็น target product layer ไม่ใช่ Workflow Studio ที่ implement ครบแล้ว.
หลักฐานใน codebase พบ canonical Job/Runner/Chat/agent building blocks และ legacy
workflow residue แต่ยังไม่พบ canonical Spec 209 persistence, compiler, publish,
Mini App หรือ Marketplace execution surface ที่จะยืนยันว่า product นี้พร้อมใช้.

ดังนั้นรอบนี้แก้เฉพาะความคลาดเคลื่อนของเอกสาร: ปรับ Revision/README ให้ตรงกับ
ขอบเขต audit และบันทึก compatibility/ownership gates ให้ชัดเจน ไม่สร้าง code,
route, migration หรือ caller ใหม่ให้ระบบที่ยังไม่มี implementation จริง.

## 20 รอบตรวจสอบ

| รอบ | ขอบเขต | ตรวจจาก codebase/spec | ผลตรวจและข้อสรุป |
|---:|---|---|---|
| 1 | Inventory 186–210 | `specs/feature/*` และ git worktree | มีแพ็กเกจ 186–189, 191–209 และ 210; ไม่พบแพ็กเกจ Spec 190 ใน tree ปัจจุบัน จึงไม่สร้าง spec สมมติและถือเป็น missing-number boundary |
| 2 | Ownership ของ Feature 186 | Spec 186, `workerJobs`, `workerJobEvents`, migration 0303 | Feature 186 เป็น lineage/runtime-neutral control-plane building block; Spec 209 ต้องใช้ Job authority เดิมและห้ามทำ queue ชุดใหม่ |
| 3 | Cloudflare/migration boundary | Specs 187–188, `ops/feature-187/*`, `ops/feature-188/*` และ local verification scripts | 187/188 มี local contract/readiness และ cutover gate แต่ไม่มี target-account/production proof; Workflow Studio ห้ามถือ local readiness เป็น production execution proof |
| 4 | Tenant identity/data transfer | Spec 189, tenant/auth services และ migration-ordering tests | 189 ระบุ implemented locally/not enabled; workflow ownership ต้อง derive tenant/actor จาก server context และไม่อาศัย client-supplied tenant เป็น authority |
| 5 | Media/director dependencies | Specs 191–193 และ Vertical Drama/editor/worker paths | มี planner, editor parity และ worker evidence เฉพาะโดเมน; Spec 209 อ้าง capability ได้ แต่ไม่ย้าย media state หรือสร้าง media executor ใหม่ |
| 6 | Vector/RAG retirement | Spec 194, Vectorize manifests, `vectorProvider.js`, vectorize tests | มี provider switch/target gate และยังพบ pgvector/Chroma compatibility; Workflow node ต้องใช้ Library/Vector gateway และไม่ประกาศว่า retirement เสร็จจากเอกสารอย่างเดียว |
| 7 | Feature 195 lifecycle | `jobControlPlaneTypes.ts`, `jobControlPlane.ts`, `schema.ts` | สถานะ canonical, attempts, events, dispatches, outbox และ settlements มีอยู่จริง; workflow run ต้อง enter gateway เดียวกันและไม่เก็บ lifecycle truth เอง |
| 8 | Feature 195 compatibility | `jobControlPlaneGateway.ts`, `agentControlPlaneContracts.ts`, adapters/registry | code ปัจจุบันยัง emit/accept `feature-186-v1`; นี่เป็น compatibility baseline ไม่ใช่หลักฐานว่า Spec 209 มี Feature-195-native compiler แล้ว จึงระบุ migration gate ใน Spec 209 |
| 9 | Feature 196 plan handoff | `orchestration/gateway.ts`, `orchestration/contracts.ts`, policy checks | มี approved-plan → Job handoff และ tenant/idempotency/dependency checks; ยังไม่พบ workflow authoring/compiler route ที่ต่อ end-to-end จาก Spec 209 |
| 10 | Feature 197 Runner | `runnerContracts.ts`, `runnerControl.ts`, `apps/runner-app/src/protocol.rs` | `sah-runner-v1`, sequence/fencing/capability contracts เป็น Runner authority; Spec 209 ต้อง request capability ผ่าน Runner และห้ามเปิด channel ใหม่ |
| 11 | Feature 198 Chat ingress | `chatOrchestrationContracts.ts` และ chat tests | Chat contract ทำ normalization ของ tenant/conversation/correlation/idempotency และ project Job status; Spec 209 เป็น workflow-specific surface เท่านั้น ไม่สร้าง conversation/status authority ใหม่ |
| 12 | Spec 199 MCP | MCP governance/contract services and gateway routes | MCP transport/upstream lifecycle เป็น owner แยก; Workflow capability ต้องผ่าน MCP gateway/normalization ไม่ฝัง token หรือสร้าง MCP manager ซ้ำ |
| 13 | Spec 200 agent plane | `agentControlPlaneContracts.ts`, `agentRuntime/client.ts`, OpenAI Agents runtime routes | native agent bridge และ `external_agent_task` มีอยู่บางส่วน; ไม่พบหลักฐานว่า Spec 209 ควร execute external agent เอง จึงคง Spec 200 เป็น owner |
| 14 | Spec 201 provenance | provenance services, content-protection routes/tests และ Spec 201 | provenance เป็น evidence/audit concern ที่มี implementation กระจายตามโดเมน; workflow output ต้องอ้าง provenance contracts และไม่สรุป legal ownership จาก technical metadata |
| 15 | Specs 202–203 editor/director | rough-cut/editor-director specs และ editor change-set/render services | มี editor-side building blocks แต่ไม่ใช่ generic workflow persistence/compiler; Spec 209 ทำ typed capability adapter และรักษา editor authority เดิม |
| 16 | Specs 204–205 runtime/Runner | container-runtime spec, Runner release/protocol files | Cloudflare Container/Runner เป็น isolated execution/release boundaries; retired Docker/OpenSandbox dispatch ไม่ใช่ทาง fallback ของ Spec 209 |
| 17 | Spec 206 A2A | Spec 206 and source search for A2A adapter/routes | ไม่พบ current A2A adapter/route implementation ที่ยืนยัน production path; A2A-first remains target owner, and Spec 209 must not infer it from job types or marketplace text |
| 18 | Specs 207–208 economic/CU | Specs 207/208, `creditTransactions`, provider reservations, settlements, browser node types and `workflowBrowserSessionNodes` flag | Credits/reservation/settlement และ browser node definitions มีบางส่วน แต่ multi-wallet/ledger finality/production Computer Use ยังเป็น target/gated; Spec 209 emits facts only |
| 19 | Spec 210 and retired residue | Spec 210, Runner/Web/Python search, `retiredRouteGuard.ts`, legacy workflow tables, missing `routers/workflow.ts` | ไม่พบ `orca.v1` adapter; `/workflows`, old tables, stale docs and Kilo local listing are residue, not permission to revive retired systems or claim Spec 209 implementation |
| 20 | Final convergence/release proof | Spec 209 authority/baseline sections, README, manifest, focused tests and diff checks | Spec 209 boundaries now explicitly cover 186–210; no duplicate Job/agent/MCP/Runner/economic authority was added. Remaining work is implementation and external proof, not a hidden spec-internal fix |

## Repairs made in this audit

- Updated Spec 209 metadata from “207–210 convergence” to “186–210 convergence”.
- Corrected the package README from Revision 7 to Revision 8.
- Distinguished the existing 207–210 companion audit from this full 186–210
  audit instead of treating the narrower audit as complete evidence.
- Preserved the existing Revision 8 repository-alignment rows for
  `feature-186-v1`, Chat, A2A, Computer Use, economics, legacy workflow
  residue, retired routes and Orca.

## Open implementation gates

1. Define and test the Feature 195-compatible workflow Job contract/version
   migration, including idempotency, attempts, events, outbox and settlement.
2. Implement and test canonical workflow persistence, compiler, publish,
   Mini App and Marketplace APIs; do not reuse legacy workflow tables as a
   second source of truth without an authorized migration audit.
3. Complete Feature 198, 199, 200, 206 and 208 integration contracts before
   exposing corresponding workflow nodes.
4. Complete Spec 207 economic authorization/finality and Spec 210 Orca adapter
   evidence before enabling paid marketplace or Orca-backed workflows.
5. Obtain authenticated browser, provider, Runner, migration, deployment and
   rollback evidence before calling the product production-ready.

No application implementation was changed in this audit because the codebase
does not contain a complete Spec 209 runtime to repair safely; adding one would
be a separate implementation project with migrations, API contracts and tests.
