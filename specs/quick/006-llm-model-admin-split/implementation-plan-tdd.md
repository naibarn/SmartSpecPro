## Tests First

- เพิ่ม unit tests สำหรับ helper ที่กรอง/จัดกลุ่ม mappings เพื่อรองรับ bulk UI behavior
- เพิ่ม backend test สำหรับ bulk enabled mutation helper logic ถ้ามีการ extract pure function

## Expected Initial Failures

- ไม่มี bulk mutation ใน `multiProvider`
- ไม่มีหน้า `/admin/llm-models`
- `MultiProviderAdmin` ยังไม่มี selection และ bulk actions

## Regression Checks

- provider page ยังโหลดรายชื่อ providers ได้ตามเดิม
- model list สำหรับผู้ใช้ยังใช้เฉพาะ mappings ที่ enabled
