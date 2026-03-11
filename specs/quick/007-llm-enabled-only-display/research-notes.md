## Findings

- [llmProviders.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/llmProviders.ts) endpoint `availableModels` ยัง merge `provider.availableModels` เข้า model list
- [multiProvider.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/multiProvider.ts) endpoint `getAvailableModelsWithProviders` ยังเติมรายการจาก `provider.availableModels` เมื่อไม่พบ mapping enabled
- [skills.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/skills.ts) function `getVisionModelOptions` อ่านจาก `llmProviders.availableModels` ตรง และมี `FALLBACK_VISION_MODELS`
- [ModelPicker.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/agency/ModelPicker.tsx) มี hardcoded built-in fallback models
- [AdminSettings.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/AdminSettings.tsx) มี fallback `SelectItem value=\"gpt-4o-mini\"`

## Impact

- จุดที่เรียก `trpc.llmProviders.availableModels.useQuery()` และ `trpc.skills.getVisionModels.useQuery()` อาจยังเห็น model ที่ disable แล้ว
- การแก้ endpoint กลางจะลดงานแก้รายหน้าได้มากที่สุด

## Fit

- ควรทำ model availability ให้มี source เดียวคือ enabled mappings
- ควรตัด fallback display ที่ hardcode รายชื่อ models เพราะขัดกับ requirement ใหม่โดยตรง
