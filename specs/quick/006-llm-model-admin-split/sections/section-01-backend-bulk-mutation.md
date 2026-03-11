## Goal

เพิ่ม admin mutation สำหรับเปิด/ปิด `model_provider_map.isEnabled` หลายรายการพร้อมกัน

## Tasks

- เพิ่ม `bulkSetModelMappingsEnabled`
- validate ว่ารับ `ids` อย่างน้อย 1 รายการ
- update rows ตาม `ids`
- return affected count

## Verification

- run targeted vitest for multi-provider related tests
