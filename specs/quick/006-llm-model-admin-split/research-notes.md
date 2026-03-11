## Codebase Scan

- หน้า [AdminLLMProviders.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminLLMProviders.tsx) รวม provider settings, provider sync และ `MultiProviderAdmin`
- component [MultiProviderAdmin.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/admin/MultiProviderAdmin.tsx) มี tab `mappings`, `rules`, `health`, `usage`
- backend router [multiProvider.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/multiProvider.ts) เป็นแหล่ง CRUD ของ `model_provider_map`

## Existing Data Model

- `model_provider_map.isEnabled` มีอยู่แล้วใน [schema.ts](/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts)
- runtime selectors หลายจุด query เฉพาะ mapping ที่ `isEnabled = true`

## Gaps

- ยังไม่มีหน้าเฉพาะสำหรับ LLM models
- `ModelMappingsTab` ยังไม่มี bulk selection / bulk enable-disable
- route backend ยังไม่มี bulk mutation สำหรับเปลี่ยน `isEnabled` หลายรายการพร้อมกัน

## Fit

- ควรเก็บ model admin ไว้ในเส้น `multiProvider` ต่อไป เพราะ table/logic อยู่ตรงนั้นอยู่แล้ว
- ควรทำ `MultiProviderAdmin` ให้เลือก tab ได้ เพื่อแยกหน้า provider กับ model ออกจากกันโดยไม่ duplicate UI มากเกินไป
