# Spec 209 package

แพ็กเกจนี้ประกอบด้วย:

- `spec.md` — Spec 209 Revision 10 ฉบับเต็มสำหรับ implement planning
- `mockups/01-main-builder-top-down.png` — Main AI Workflow Studio / top-down builder
- `mockups/02-subflow-data-binding.png` — Nested Subflow + typed data binding
- `mockups/03-run-debug-mini-app.png` — Run mode + live debug + reusable Mini App experience
- `examples/` — ตัวอย่าง canonical JSON สำหรับ workflow / UI / marketplace

จุดตัดสินใจสำคัญของ Spec 209:

1. AI Builder เป็นวิธีสร้าง/แก้ Workflow หลัก
2. Canvas ใช้เพื่อดูภาพรวม, inspect, debug และ fine-tune
3. Flow หลักไหลจากบนลงล่าง
4. รองรับ Flow ซ้อน Flow ด้วย typed contract
5. รองรับ run all / run until / run from / node / subflow / resume
6. LLM และ media model เลือก/override/policy/fallback ได้
7. Workflow publish เป็น Mini App ได้
8. Mini App แชร์ Private/Workspace/User/Link/Marketplace ได้
9. Public Marketplace รองรับ creator pricing และ revenue attribution ผ่าน Spec 207
10. ไม่สร้าง Job system, Agent gateway, MCP gateway, Runner plane หรือ Ledger ซ้ำ

11. External CLI-agent nodes ที่ใช้ Orca ต้องผ่าน Spec 210 → Spec 200/206 และ
    ใช้ Job/Runner/tenant/economic authority เดิม ไม่เรียก Orca ตรงจาก Workflow Studio

12. Mini App มี Central Hub กลางสำหรับ Registered/Selected/Bookmarked/Pinned/
    Recently used/Needs setup และไม่ต้องค้นหา Marketplace ซ้ำทุกครั้ง
13. Skill และ Mini App ที่ค้นหาได้ต้องมี shared vector catalog coverage พร้อม
    ACL-safe hybrid search และ reconciliation ไม่ปล่อยรายการตกหล่นเงียบ ๆ
14. External tool และ Skill bundle ต้องประกาศ requirement, rights, hash/trust,
    install path และ readiness ก่อน Run; bundle ห้ามมี secret
15. ก่อนสร้าง Workflow Definition, AI Builder ต้องสร้างและเปรียบเทียบ execution
    options จาก capability, Runner, tool, Skill และ connection readiness ของ user
16. User เลือกทางเลือกที่พร้อมใช้หรือยอมรับคำแนะนำได้เอง; preferred tool ไม่ใช่
    hard requirement และ setup-required option ต้องแสดง blocker/action อย่างชัดเจน

- `audit-revision-2.md` — รายงานการวนตรวจสอบเพิ่ม 18 รอบ (35 รอบสะสม) และรายการ gap ที่แก้ทันที
- `audit-revision-3.md` — รายงานการตรวจเพิ่ม 15 รอบ ทำให้รวมเป็น 50 focused audit passes
- `audit-revision-4.md` — รายงานการตรวจเพิ่ม 12 รอบ ทำให้รวมเป็น 62 focused audit passes

- `audit-revision-5.md` — รายงานการตรวจเพิ่ม 12 รอบ ทำให้รวมเป็น 74 focused audit passes
- `audit-revision-6.md` — รายงานการตรวจเทียบ codebase จริงเพิ่ม 20 รอบ ครอบคลุม Specs 207–209 และปรับ boundary ของ runtime/legacy ให้ตรงกับ repository

- `audit-revision-7.md` — รายงานการตรวจเทียบ codebase จริง 20 รอบของชุด 207–210 ซึ่งเป็น audit companion ก่อนหน้า
- `audit-revision-8.md` — รายงานการตรวจเทียบ codebase จริง 20 รอบของ Specs 186–210 โดยเน้น Spec 209 และตรวจระดับ implementation/contract แยกจาก spec claims
- `audit-revision-9.md` — รายงานการตรวจ 20 รอบตาม requirements ของ Central Mini App Hub, vector catalog, external-tool readiness และ Skill bundle packaging
- `audit-revision-10.md` — รายงานการตรวจ amendment เรื่อง pre-build execution options, user selection และ Runner readiness discovery

บันทึกการตรวจร่วมอยู่ที่ `orchestra/spec-audit-209-186-210-2026-09-19.md`
