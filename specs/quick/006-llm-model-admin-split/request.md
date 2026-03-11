## Summary

แยกการตั้งค่า LLM model ออกจากหน้า LLM provider เดิม ไปเป็นหน้า admin ใหม่ เพื่อให้ผู้ดูแลระบบเปิด/ปิดโมเดลแต่ละตัวได้โดยตรง และรองรับการเลือกหลายรายการเพื่อ bulk enable/disable ได้สะดวก

## Likely Affected Areas

- `apps/web/client/src/pages/AdminLLMProviders.tsx`
- `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`
- `apps/web/client/src/App.tsx`
- `apps/web/server/routers/multiProvider.ts`

## Constraints

- ใช้ `model_provider_map.isEnabled` ที่มีอยู่แล้ว ไม่เพิ่ม schema ใหม่ถ้าไม่จำเป็น
- หน้า provider เดิมควรเหลือเฉพาะ provider config เป็นหลัก
- หน้า model ใหม่ต้องรองรับเปิด/ปิดหลายรายการพร้อมกัน

## Assumptions

- canonical LLM model config ปัจจุบันอยู่ใน `model_provider_map`
- การมี route admin ใหม่ (`/admin/llm-models`) สอดคล้องกับโครงสร้างหน้า admin ที่มีอยู่แล้ว

## Non-goals

- ไม่เปลี่ยน logic runtime router นอกเหนือจากการใช้สถานะ `isEnabled` ตามเดิม
- ไม่ออกแบบระบบ role ใหม่
