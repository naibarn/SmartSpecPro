# Interview Transcript: Feature 045 — Hybrid Skill Orchestrator

## Q1: Parameter Extraction Strategy

**Question:** เมื่อ Orchestrator เลือก skill แล้ว ค่า input parameters หลายตัว (เช่น cartoonStyle, review_angle, storytelling_style) ควรจัดการอย่างไร?

**Answer:** Hybrid: LLM Extract + Confirm if Low Confidence
- LLM สกัด params จาก message ก่อน
- ถ้าค่า required ขาดหรือ confidence ต่ำ → แสดง form ให้ user ยืนยัน
- ถ้าครบแล้วมั่นใจ → execute เลย

## Q2: Data Flow Between Skills (COMPOUND mode)

**Question:** สำหรับ COMPOUND mode (หลาย skills) เช่น 'เขียนบทความอาหาร + สร้างรูปประกอบ + แปลภาษา' ข้อมูลควรไหลข้าม skills อย่างไร?

**Answer:** Output → Input Mapping
- กำหนด mapping: output ของ skill A ส่งเป็น input ของ skill B
- เช่น article-writer output → translation input (topic)
- Orchestrator LLM ตัดสินใจ mapping

## Q3: Handling Missing Required Parameters

**Question:** ระบบควร handle กรณี user ไม่ได้ระบุ parameters สำคัญ (required fields) อย่างไร?

**Answer:** Ask Only Critical Missing Fields
- ถาม user เฉพาะ required fields ที่ไม่มี default และ LLM infer ไม่ได้
- ลดการถามให้น้อยที่สุด

## Q4: Skill Scope

**Question:** Orchestrator ควรเปิดใช้งานเฉพาะบาง skill categories หรือทุก skills ตั้งแต่แรก?

**Answer:** All Skills from Day 1
- ส่งทุก 48 skills เป็น catalog ให้ classifier
- ใช้ hierarchical classification (category → skill) เพื่อจัดการ
- ครอบคลุมทุก use case ตั้งแต่แรก

## Q5: Architecture Layer

**Question:** ตัว Orchestrator ควรทำงานที่ layer ไหนของ stack?

**Answer:** New Service Layer
- สร้าง skillOrchestrator.ts เป็น service ใหม่
- chat.ts เรียก orchestrator แทน detectSkill
- แยก concern ชัดเจน, test ง่าย

---

## Auto-Decisions (Technical)

- **LLM for classification:** Use existing llmRouter.ts + cheapest model strategy from taskExecutionPlanner
- **Framework:** Pure TypeScript, no LangGraph dependency — agent loop is simple enough for custom implementation
- **Testing:** Vitest with existing mock patterns (vi.mock for services)
- **Feature flags:** Redis-based via existing featureFlags.ts (global + tenant-scoped)
- **Audit logging:** Use existing auditLogger.ts — add new event types: `orchestration_classify`, `orchestration_execute`, `orchestration_quality_check`
- **Credit tracking:** Wrap existing creditService.ts — sum credits across multi-skill executions
- **Schema loading:** Read input.schema.json from skill folder at runtime for parameter extraction
- **Structured output:** Use function calling (tools) for classifier, not plain JSON mode — models are trained for this
- **Caching:** Cache skill catalog (name+description+category) in Redis, invalidate on skill sync
