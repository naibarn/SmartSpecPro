## Tests First

- ปรับ unit test ของ `mergeAvailableLlmModels` ให้ยืนยันว่าไม่เติม raw provider models ที่ไม่มี enabled mapping
- เพิ่ม test ของ `multiProvider` สำหรับกรณี disabled/unmapped provider models ต้องไม่ถูก re-add

## Regression Checks

- chat/workflow/agency/settings/admin skills ยัง compile และอ่านรายการ model ได้จาก endpoint เดิม
- admin model management page ยังเห็น disabled mappings ได้ผ่าน admin route
