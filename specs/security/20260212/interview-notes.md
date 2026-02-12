# Interview Notes

Date: 2026-02-12
Mode: New planning session

## Q1: ขอบเขตการแก้รอบนี้
User answer: `1A`
Interpretation:
- เป้าหมายคือทำให้ `npm run check` ผ่าน `0` errors
- ไม่ขยาย scope ไป refactor เชิงสถาปัตยกรรมขนาดใหญ่

## Q2: นโยบายการแก้ type
User answer: `2A`
Interpretation:
- ห้ามใช้ workaround แบบกว้าง เช่น `any`, `@ts-ignore` เพื่อปิด error
- หากจำเป็นต้องใช้ workaround เฉพาะจุด ต้องมีเหตุผลและ follow-up ชัดเจน

## Q3: Dependency ที่อนุญาต
User answer: `3A`
Interpretation:
- อนุญาตเพิ่ม dependency/types ที่จำเป็นต่อความถูกต้องของ type system
- ตัวอย่างใน scope: `@types/pg`, `stripe` (ถ้าขาดจริง)

## Q4: การ rollout
User answer: `4B`
Interpretation:
- ส่งมอบแบบ single batch (งานรวมครั้งเดียว)
- ยังต้องมี phase ภายในเพื่อควบคุมความเสี่ยงก่อน final merge

## Consolidated constraints
- Final target: TypeScript errors in `apps/web` = 0
- Security posture must not be weakened
- Tenant/auth behavior must remain backward-compatible unless explicitly changed
- Delivery format is single-batch, but plan execution should still enforce internal verification gates
