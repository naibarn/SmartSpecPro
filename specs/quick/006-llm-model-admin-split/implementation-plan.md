## Objective

แยกหน้า LLM model admin ออกจาก LLM provider admin และเพิ่ม bulk enable/disable สำหรับ model mappings

## Approach

1. เพิ่ม tRPC mutation สำหรับ bulk update `model_provider_map.isEnabled`
2. ปรับ `MultiProviderAdmin` ให้กำหนด tabs ที่แสดงได้ และเพิ่ม bulk-selection UX ใน mappings tab
3. สร้างหน้า `AdminLLMModels` ใหม่และ route `/admin/llm-models`
4. ลด coupling ในหน้า provider เดิม โดยคง provider config ไว้และชี้ผู้ใช้ไปหน้า model ใหม่

## Risks

- Selection state อาจค้างเมื่อ filter เปลี่ยน
- mutation bulk อาจ invalidate query ไม่ครบ ทำให้ UI stale

## Mitigations

- reset selection เมื่อ dataset เปลี่ยน
- invalidate `multiProvider.listModelMappings`, `multiProvider.getAvailableModelsWithProviders`, และ `llmProviders.adminList`

## Acceptance Criteria

- มีหน้า admin ใหม่สำหรับ LLM models
- ผู้ใช้ admin สามารถเลือกหลาย model mappings แล้ว enable/disable พร้อมกันได้
- หน้า provider เดิมไม่ใช่ที่หลักสำหรับ model toggles อีกต่อไป
