# Spec 209 Revision 10 — Pre-Build Execution Options / User Choice / Runner Readiness Audit

วันที่ตรวจ: 2026-09-19

รอบนี้ตรวจตาม amendment ที่ยืนยันให้ Workflow Builder วิเคราะห์และแสดง
ทางเลือกการทำงานก่อนสร้าง Workflow Definition โดยต้องตรวจ Runner, tools,
Skills และ connections ของ user ว่าพร้อมใช้ ติดตั้งเพิ่ม หรือยังไม่รองรับ

เป็นการแก้ specification เท่านั้น ไม่ได้อ้างว่า repository มี implementation
ของ Builder option discovery หรือ Runner readiness flow ครบแล้ว

SocratiCode MCP ไม่พร้อมใช้งานใน session นี้ จึงใช้ targeted shell discovery และ
exact reads จาก Spec 209, README, audit-revision-9 และ handoff ที่แนบมา

## ผลตรวจ 18 จุด

| จุดตรวจ | Focus | Gap / risk | Repair |
|---:|---|---|---|
| 1 | Build lifecycle | Builder สร้าง Workflow Definition ก่อนเปรียบเทียบ runtime option | เพิ่ม pre-build Execution Option Set ก่อนสร้าง semantic workflow |
| 2 | User choice | `AUTO` อาจถูกตีความเป็นการเลือกเงียบ ๆ | กำหนดให้ Auto เป็น explicit user choice |
| 3 | Multiple plans | ไม่มีข้อกำหนดให้แสดงแผนที่แตกต่างกันอย่างมีนัยสำคัญ | เพิ่ม candidate-plan generation และ material-difference rule |
| 4 | Capability semantics | framework/provider อาจกลายเป็น workflow identity | แยก logical capability จาก runtime/provider/tool preference |
| 5 | Hard constraints | preference กับ requirement ปะปนกัน | เพิ่ม hard constraints versus preferences contract |
| 6 | Runner scope | ยังไม่ระบุการตรวจ Runner ของ user ก่อนสร้าง flow | ผูกกับ server-authoritative Feature 197 readiness projection |
| 7 | Readiness freshness | stale/offline Runner อาจถูกแสดงว่าพร้อม | เพิ่ม `RUNNER_OFFLINE_OR_STALE` และ `UNKNOWN` |
| 8 | Setup visibility | ขาดรายละเอียดสิ่งที่ต้องติดตั้งหรือเชื่อมต่อ | เพิ่ม setup actions, blocker reason และ dependency detail |
| 9 | No forced tool | exact tool requirement อาจบล็อก compatible alternative | เพิ่ม `HARD_CAPABILITY`, `PREFERRED_TOOL`, `OPTIONAL_TOOL` |
| 10 | Silent switching | fallback อาจสลับ Claude/Codex โดย user ไม่ทราบ | ห้าม silent switch; ต้องแสดงและขออนุญาตตาม policy |
| 11 | Draft safety | setup-required option อาจถูกอ้างว่าพร้อม Run | เพิ่ม setup-pending Draft และ readiness state |
| 12 | Transient identity | Runner/session/process IDs อาจรั่วเข้า Workflow Definition | ย้ำให้เก็บ logical contract และ snapshot reference เท่านั้น |
| 13 | Paid execution | option discovery อาจสร้าง Job หรือเสียค่าใช้จ่าย | ห้าม durable Workflow Run และ side-effect/paid execution โดย default |
| 14 | Revalidation | build-time readiness อาจถูกใช้แทน run-time proof | แยก pre-build discovery กับ final run preflight |
| 15 | UX controls | ไม่มี action สำหรับ compare/refresh/setup/เลือก connection | เพิ่ม Execution Options UI contract |
| 16 | Ownership | อาจเกิด Builder-owned readiness database หรือ runtime registry | ยืนยันการ delegate ไป Capability Registry/Feature 197/companion specs |
| 17 | Security | user choice อาจ bypass policy/tenant/secret boundary | เพิ่ม security and policy invariants |
| 18 | DoD coverage | end-to-end scenario ยังไม่พิสูจน์ option selection | เพิ่ม option discovery, readiness comparison และ explicit selection ใน DoD |

## Repairs applied

- Advanced Spec 209 to Revision 10.
- Added primary UX and execution-choice rules to the executive section.
- Added pre-build option discovery to the default authoring flow.
- Extended Capability Discovery to separate capability, readiness and plan selection.
- Replaced OpenAI-default runtime wording with capability-first governed adapter selection.
- Added Runner readiness states and explicit setup behavior.
- Added Execution Options surface to the AI Builder contract.
- Added pre-build versus run-time preflight separation.
- Added normative section `160BN` covering the full option, readiness, selection,
  persistence, ownership, security and acceptance contract.
- Updated Mini App dependency semantics so preferred tool brands do not block
  compatible alternatives.
- Updated Revision 10 acceptance criteria and Definition of Done.
- Updated README and package manifest entry requirements.

## Required implementation gates

- Implement `workflow.build_intent`, option generation and option comparison only
  over the canonical Capability Registry and Feature 197 readiness projection.
- Add tenant/user/device-scoped readiness API evidence; client state is advisory.
- Add focused tests for ready-now, setup-required, stale Runner, policy blocked,
  unsupported and unknown options.
- Add tests proving a compatible alternative does not require duplicating a flow.
- Add tests proving no silent install, sign-in, secret grant or tool switch.
- Add browser evidence for option comparison, refresh, setup-required and
  explicit selection states at the existing Hub/Builder target viewports.
- Keep all long-running work on Feature 195/196 and preserve retired-system
  prohibitions.

## Convergence result

The amendment is architecture-complete for the requested product behavior:
the Builder discovers, compares and explains user-specific execution options
before flow creation, while preserving logical workflow portability and shared
runtime ownership. Implementation and live Runner proof remain separate gates;
specification wording alone is not production proof.
