# Adversarial Self-Review — Round 2 (Variable Shot Duration Update)

## Scope

ตรวจการปรับแผนหลังยกเลิก fixed episode runtime และเทียบความสอดคล้องระหว่าง spec, plan, TDD และ section contracts

## Findings and resolution

1. **Fixed-runtime regression risk** — แก้โดยระบุชัดว่า 60/90 วินาทีไม่ใช่ canonical rule, เพิ่ม `duration_pending`/`legacy_compat`, และเพิ่ม regression fixtures สำหรับ uniform/mixed duration
2. **Logical shots vs render segments** — แก้โดยแยก 9 logical storyboard shots ออกจาก `renderSegmentDurationsSeconds` ที่ provider mapping อาจมี 8 หรือ 9 segments
3. **Runtime source-of-truth ambiguity** — แก้โดยกำหนดให้ runtime เป็น derived value จาก logical vector และ explicit assembly mapping; ห้ามกรอก runtime ซ้ำแยกจาก vector
4. **Legacy safety** — แก้โดยกำหนดให้ audit อ่าน profile ที่มีหลักฐานเท่านั้น ไม่เดา profile ใหม่และไม่ rewrite episode เดิม
5. **Skill-first boundary** — ผ่าน: planner/skill เลือกความหมายและ beat; deterministic code ตรวจ vector, capability, mapping และผลรวมเท่านั้น

## Result

ผ่าน focused review รอบนี้ ไม่พบข้อขัดแย้งที่ต้องหยุดการวางแผนต่อ และไม่พบข้อกำหนดใหม่ที่จำเป็นต้องสร้าง ledger/source of truth ชุดที่สอง
