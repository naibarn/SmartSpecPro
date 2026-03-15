## Objective

ทำให้ A4/block workflow ใช้งานได้ตรง intent มากขึ้น ทั้งใน AI draft และ manual editing พร้อมแก้ bug header/footer และเปิด editing ของ fallback nodes ที่ลึกขึ้น

## Sections

1. AI draft header/footer suppression hardening
2. Component autofit toolbar + AI post-insert A4 autofit
3. Raw fallback node selection/resize
4. A4 catalog expansion and routing hardening

## Acceptance Criteria

- Auto Draft ที่ปิด header/footer จะไม่สร้าง header/footer ออกมา
- editor มี action autofit สำหรับ component ตาม family (A4 vs non-A4)
- raw fallback node ของ built-in component สามารถ select/resize แยกได้
- มี A4 multi-image และ A4 landscape 16:9 block เพิ่มใน library/AI routing
- Draft with AI ใช้ auto-fit กับ A4 blocks อัตโนมัติ
- มี tests ครอบ regression หลัก
