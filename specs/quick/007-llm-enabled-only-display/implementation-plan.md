## Objective

ให้ user-facing LLM model selectors แสดงเฉพาะ models ที่ enabled จริง

## Approach

1. ปรับ endpoint กลาง `llmProviders.availableModels` ให้คืนเฉพาะ enabled mappings จาก enabled providers
2. ปรับ `multiProvider.getAvailableModelsWithProviders` ให้ไม่เติม raw provider models เข้ามา
3. ปรับ `skills.getVisionModels` ให้ใช้เฉพาะ enabled mappings และไม่ fallback เป็น hardcoded list
4. ลบ hardcoded fallback models ใน UI selectors ที่ขัดกับ requirement

## Risks

- environment ที่ยังไม่ sync/import model mappings อาจเห็นรายการว่าง
- saved preferences ที่อ้าง model disabled อาจยังเก็บค่าเดิมไว้จนกว่าผู้ใช้จะเลือกใหม่

## Mitigations

- ให้ UI แสดง empty state ชัดเจนแทนการปลอม fallback models
- ไม่แตะ stored values เก่าในรอบนี้ เพื่อลด behavioral break ที่ไม่จำเป็น

## Acceptance Criteria

- ไม่มี user-facing selector ที่แสดง disabled LLM model จาก fallback/raw provider lists
- endpoint กลางคืนเฉพาะ enabled models
