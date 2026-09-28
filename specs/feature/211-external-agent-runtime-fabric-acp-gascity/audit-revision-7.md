# Spec 211 — 20-round repository convergence audit

วันที่ตรวจ: 2026-09-19

การตรวจนี้ยึด codebase เป็นหลัก ไม่ถือข้อความใน Spec 211 เป็นหลักฐานว่า
ระบบ implement แล้ว. SocratiCode MCP ไม่พร้อมใช้งานใน tool set ของ session นี้
จึงใช้ targeted shell discovery, exact source reads, migration/schema reads,
package-manifest checks และ focused contract-test planning แทน. ไม่รัน
repository-wide TypeScript typecheck ตาม `AGENTS.md`.

## สรุปผล

Spec 211 มี architecture ที่ครอบคลุม ACP/Gas City อย่างละเอียด แต่ใน
repository ปัจจุบันยังไม่มี ACP adapter, Gas City bridge, dependency, migration,
route หรือ conformance implementation จริง. มีเพียง shared Job/Runner/agent
building blocks และ `external_agent_task` admission ที่นำมา reuse ได้.

พบและแก้ gap ที่มีผลต่อความสอดคล้องทันที:

1. เพิ่ม repository implementation-status baseline เพื่อไม่ให้ research/spec
   claims ถูกตีความเป็น runtime ที่ติดตั้งแล้ว.
2. ผูก Spec 211 กับ canonical Feature 195 Job status และแยกชื่อ phase ของ
   ACP/Gas City ออกจาก top-level Job status.
3. ยืนยัน contract/version, Runner, A2A, Spec 209, MCP, Computer Use,
   economics, Orca และ retired-system boundaries จาก code/spec ที่มีจริง.
4. เพิ่มเงื่อนไข re-probe/license/conformance สำหรับ upstream release claims.

## 20 รอบตรวจสอบ

| รอบ | ขอบเขต | หลักฐานที่ตรวจ | ผลตรวจ / การปรับปรุง |
|---:|---|---|---|
| 1 | Package inventory | `specs/feature/211-*`, header, existing audit history | Spec 211 มี package เดียวและ Revision 6 เดิมอ้าง review 24 รอบ; เริ่ม audit ใหม่เป็น Revision 7 โดยไม่ถือรอบเก่าแทน |
| 2 | ACP implementation proof | exact search ใน `apps/web`, `python-backend`, `apps/runner-app`, package manifests | ไม่พบ ACP adapter/dependency/route/conformance source; เพิ่ม implementation-status boundary |
| 3 | Gas City implementation proof | exact search `gascity`, `GasCity`, `runtime.Provider`, Beads/Dolt ใน source/manifests | ไม่พบ bridge/dependency/store integration; เพิ่ม gate ห้ามตีความ architecture เป็น installed runtime |
| 4 | Spec 200 ownership | Spec 200, `agentControlPlaneContracts.ts`, agent runtime paths | Spec 200 ยังเป็น External Agent owner; Spec 211 เป็น protocol/runtime composition layer และต้อง reuse contract เดิม |
| 5 | Spec 206 routing | Spec 206 and source search for A2A adapter/routes | A2A-first เป็น routing target แต่ไม่มี current adapter proof; ACP ไม่แทน A2A |
| 6 | Spec 210 sibling runtime | Spec 210 repository baseline, Runner adapter source | Orca adapter ยังไม่พบใน code; Spec 211 ห้ามสมมติ fallback พร้อมใช้ |
| 7 | Spec 209 workflow boundary | Spec 209 baseline and source search for canonical workflow tables/routes | Workflow Studio ยัง target; transient ACP/Gas City IDs ห้ามกลายเป็น workflow persistence |
| 8 | Feature 195 physical truth | `schema.ts` Job tables and `jobControlPlaneGateway.ts` | attempts/events/dispatches/outbox/settlements เป็น shared truth; ACP/Gas City เป็น subordinate metadata |
| 9 | Feature 195 contract version | `feature-186-v1` in agent contract/adapters | Current implementation ยัง compatibility-first; เพิ่ม requirement ให้มี version migration/mixed-version proof |
| 10 | Feature 195 status vocabulary | `jobControlPlaneTypes.ts` | พบ canonical status 10 ค่าไม่ตรงกับ Spec 211 phase list; แก้โดยกำหนด phase เป็น attempt detail ไม่ใช่ Job status |
| 11 | Feature 196 handoff | orchestration gateway/contracts/policy | approved plan → canonical Job มีอยู่; Spec 211 ห้ามสร้าง planner/queue ใหม่ |
| 12 | Feature 197 Runner | `runnerContracts.ts`, `runnerControl.ts`, Rust protocol | `sah-runner-v1` เป็น control boundary เดียว; เพิ่ม requirement ให้ ACP/Gas City ใช้ authenticated Runner |
| 13 | Spec 199 MCP | MCP gateway/governance services and Spec 199 | MCP transport/auth/lifecycle เป็น owner เดิม; runtime terminal ไม่ bypass MCP policy |
| 14 | Spec 208 Computer Use | Spec 208 and workflow/browser node flags | ACP/Gas City terminal capability ไม่ให้ GUI/browser authority อัตโนมัติ |
| 15 | Spec 207 economics | credit/reservation/settlement source and Spec 207 | runtime route ไม่เป็น wallet/ledger/payout/finality owner; usage facts ต้องส่ง shared economic plane |
| 16 | Tenant/auth/secrets | server-derived job gateway, Runner secret-key rejection, Spec 200/210 policies | provider/account/runner/tenant values จาก client ไม่เป็น authority; secrets ห้ามเข้า transcript/runtime metadata แบบ raw |
| 17 | Persistence/migration | current schema/migrations and conceptual Spec 211 fields | proposed route-attempt fields ยังไม่มี migration; เพิ่ม explicit migration/subordinate-record gate |
| 18 | Lifecycle/effect proof | Spec 211 ACK-vs-effect, cancellation, reconciliation plus current Runner control | command ACK ไม่ใช่ session/cancel/cleanup proof; ต้องมี effect receipt และ shared outbox/reconciliation |
| 19 | Release/conformance | Spec 211 tests/certification, upstream version claims, package/dependency state | version/license/release claims เป็น planning input; เพิ่ม re-probe, pin, license review, isolated conformance and rollback gate |
| 20 | Final cross-spec convergence | ownership matrix, new baseline, status mapping, retired boundaries | ไม่พบ duplicate authority ที่ควรเพิ่ม; แก้เอกสาร gap แล้ว เหลือ implementation/external proof gates ที่ต้องทำในงานถัดไป |

## Remaining implementation gates

- Add ACP v1 client adapter and certified agent profiles through Spec 200/Runner.
- Add bounded Gas City bridge/provider/store integration only where selected,
  with isolated profile, dependency tuple and authoritative-read barriers.
- Define any route-attempt persistence/migration against existing Feature 195
  attempts and fencing, including `feature-186-v1` mixed-version behavior.
- Add actual command/effect receipts, capability publication, focused failure
  tests and conformance fixtures before enabling route selection.
- Obtain provider, OS, Runner, account, security, cost, rollback and production
  proof; current spec/source review is not that proof.

ไม่มีการเพิ่ม dependency, route, migration หรือ application runtime ในรอบนี้
เพราะ codebase ยังไม่มี Spec 211 implementation ให้แก้แบบปลอดภัย. การเพิ่ม
runtime จริงควรเป็น implementation plan แยกภายใต้ Spec 200 + Runner.
