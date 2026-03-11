## Goal

เพิ่มหน้า `AdminLLMModels` ใหม่และทำ mappings tab ให้รองรับ bulk enable/disable

## Tasks

- ให้ `MultiProviderAdmin` รับ `tabs` / `defaultTab`
- ปรับ mappings tab ให้มี search, provider filter, row selection, select all filtered, bulk enable, bulk disable
- สร้างหน้า `AdminLLMModels.tsx`
- เพิ่ม route ใน `App.tsx`
- ปรับ `AdminLLMProviders.tsx` ให้ลิงก์ไปหน้า model ใหม่ และซ่อน mappings tab ออกจากหน้านี้

## Verification

- run targeted frontend/backend tests if available
