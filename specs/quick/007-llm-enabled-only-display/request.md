## Summary

ตรวจสอบและปรับทั้งโปรเจกต์ให้รายการ LLM models ที่แสดงใน UI ใช้เฉพาะรายการที่ `enabled` เท่านั้น

## Likely Affected Areas

- `apps/web/server/routers/llmProviders.ts`
- `apps/web/server/routers/multiProvider.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/client/src/components/agency/ModelPicker.tsx`
- `apps/web/client/src/pages/AdminSettings.tsx`

## Constraints

- ไม่ทำให้หน้า admin สำหรับจัดการ model สูญเสียความสามารถในการเห็น disabled mappings
- user-facing selectors ต้องไม่แสดง disabled หรือ hardcoded fallback models

## Assumptions

- `model_provider_map.isEnabled` คือ source of truth สำหรับ LLM model availability
- provider-level `availableModels` ใช้เพื่อ sync/import/admin context เท่านั้น ไม่ควรแสดงตรงใน user selectors ถ้ามีระบบ enable/disable ราย model แล้ว

## Non-goals

- ไม่ยกเครื่อง fallback runtime defaults สำหรับ backend execution ในรอบนี้
