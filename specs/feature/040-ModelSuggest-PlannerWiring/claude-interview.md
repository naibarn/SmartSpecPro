# Interview Transcript — Spec 040

## Q1: autoDraftTool.ts รับ image_model_id จาก agent โดยตรง — ถ้า agent ไม่ส่งมา ควรทำยังไง?

**Answer:** เรียก model-suggest โดยตรง

ถ้า agent ไม่ส่ง image_model_id ให้เรียก model-suggest function โดยตรง (ไม่ใช่ getDefaultModel()) แล้วใช้ผลลัพธ์เป็น image model

## Q2: ควร implement model-suggest เป็น HTTP endpoint หรือ shared function?

**Answer:** Shared function + HTTP wrapper

Export ranking function สำหรับ autoDraftTool ใช้โดยตรง (direct import, ไม่มี HTTP overhead) พร้อมกัน register HTTP endpoint สำหรับ Python agent เรียกได้

## Q3: เมื่อ agent ส่ง image_model_id มา แต่ model-suggest แนะนำ model อื่น — ควรทำยังไง?

**Answer:** ใช้ของ agent เสมอ + log divergence

Agent รู้ context ดีกว่า ให้ใช้ choice ของ agent เสมอ แต่ log ไว้ใน audit log เพื่อ analysis (field: `diverged: boolean`)

## Q4: Auto-draft ใช้ image_model_id สำหรับ slides ทั้งหมด หรือ agent อาจส่ง model แยกตาม slide?

**Answer:** Model เดียวทั้ง deck

image_model_id ใช้กับทุก slide ใน deck เดียวกัน — model-suggest เรียกครั้งเดียวต่อ request

## Q5: Audit log ของ divergence ควรเก็บที่ไหน?

**Answer:** JSONL audit log เท่านั้น

เก็บใน `auditLogger.log()` event type `"auto_draft.model_selected"` — ง่าย ไม่ต้องมี DB migration

## Q6: ถ้า getModelsByTypeAsync() คืน empty list (ไม่มี model enabled) ควร return ยังไง?

**Answer:** Return { recommended: null, alternatives: [] } + 200

ไม่ throw error — caller จะ fallback ไป default model เอง (auto-draft ต้องทำงานต่อได้เสมอ)
