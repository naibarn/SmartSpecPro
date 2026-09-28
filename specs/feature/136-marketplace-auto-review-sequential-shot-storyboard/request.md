# Original Request — Feature 136

Date received: 2026-07-21 (in-session, Thai)

## User request (summary)

ปรับปรุงระบบ Auto Storyboard Review ของ Marketplace Capture:

- ของเดิมมีเฉพาะการสร้าง storyboard แบบ 3x3 — สร้าง 1 ภาพที่มี 9 เฟรมในภาพเดียว
  ออกมา 3 candidate แล้วเลือกภาพที่ดีที่สุดมาสร้าง Storyboard Review
- ขอ "option ใหม่" (เพิ่ม ไม่ใช่แทนที่): สร้าง storyboard เป็น **ภาพแยก 9 ภาพ,
  1 prompt ต่อ 1 ภาพ** เป็นเรื่องราวต่อเนื่องกันเพื่อรีวิวสินค้า
- เน้นว่า **ภาพสินค้าต้องตรง** — ใช้วิธีแนบภาพสินค้าหลายมุมมองเพื่อ lock
  รายละเอียดสินค้า ไม่ว่าสินค้าหันด้านไหนต้องไม่เพี้ยน
- มีการตรวจสอบว่า **หากสินค้าเกี่ยวกับเด็กและใช้ภาพเด็ก จำเป็นต้องมีภาพ
  ผู้ปกครอง (ผู้ใหญ่) อยู่ในฉากด้วย** โดย user สามารถเลือกแนบภาพ character
  ผู้ใหญ่ที่ต้องการใส่ในภาพได้
- ต้องเป็นไฟล์ spec ใหม่ใน `specs/feature/` ต่อจากเลขเดิม (ห้ามแก้ spec เดิม)
- ต้องสอดคล้องกับ codebase เดิม ไม่กระทบการทำงานของเดิม
- เน้น **skill-first** เป็นหลัก

## Attached source document

The request included a full development specification titled
**"SmartSpecPro Skill-First Product Review Storyboard & Video Prompt Generator —
Development Specification v1.0"** covering: evidence-grounded generation,
product category classification, claim whitelisting, a nine-shot narrative with
continuous Thai dialogue, per-shot start-frame image prompts (≤4,000 chars),
per-shot self-contained video prompts (≤2,000 chars with a mandatory global
identity block), three-round loop engineering, LLM semantic compression instead
of mechanical truncation, price/overclaim prohibitions, and structured JSON
output.

That document is **adapted — not copied verbatim — into `spec.md`**, mapped onto
the existing SmartSpecPro Marketplace Auto Review architecture (Feature 118
implemented snapshot) and the Vertical Drama per-shot pipeline prior art
(Features 131/132). Where the source document and the existing codebase
disagree on mechanics (e.g. prompt budgets, reference caps), `spec.md` records
the reconciliation and is authoritative.

## Context screenshots provided

- Marketplace Capture product detail page (`smartaihub.app/marketplace-capture/products/mp_7b1ab…`)
  showing the Auto Storyboard Review panel, Character/Presenter modes, the
  "การปรากฏของบุคคลในภาพ 3x3" dropdown, and mood/structure pickers.
- Example product: children's desk chair (เก้าอี้เด็ก) with multi-angle seller
  images — the motivating case for both the multi-angle product lock and the
  guardian-presence policy.
