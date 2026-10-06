# Spec 058 — AI Agency Creator Intelligence Upgrade

## 1. Problem

AI Agency Creator สร้าง agencies ที่ไม่ฉลาด — ไม่ set execution mode, ไม่วิเคราะห์ capability needs, ไม่ enable memory, ไม่ตั้ง objective สำหรับ improvement loop และยังถาม user เรื่องเทคนิคที่ user ตอบไม่ได้

## 2. Solution

ปรับ Creator ให้ **LLM คิดทุกอย่างเอง** — user แค่บอกสิ่งที่ต้องการ

### Core Changes

1. **LLM-Driven Capability Analysis**: LLM วิเคราะห์เองว่าแต่ละ node ต้องใช้ capability อะไร (web search, thinking, vision, code execution, computer use)
2. **Auto Execution Mode**: LLM เลือก executionMode (single_shot/agentic) + planningStrategy (react/cot/basic) ตามความซับซ้อนของ task
3. **Memory by Default**: enableLongTermMemory: true + memoryScope: "agency" เป็น default
4. **Auto Model Selection**: ใช้ modelRequirements + strategy แทน hardcode model
5. **Objective from Requirement**: LLM สร้าง objective จาก user requirement สำหรับ improvement loop
6. **Memory-Informed Design**: ดึง learnings จาก agencies เก่าที่คล้ายกันมาช่วยออกแบบ
7. **Self-Review Loop**: LLM ตรวจ spec 2-3 รอบก่อน implement (ดีกว่า 1 รอบเดิม)
8. **Post-Creation Suggestions**: แสดง improvement suggestions ทันทีหลังสร้างเสร็จ
9. **Template Save**: Save agency ที่ดีเป็น template

## 3. Affected Phases

### Phase 1: DISCOVER (enhanced)
- LLM วิเคราะห์ capability needs จาก requirement
- Output เพิ่ม: recommended_capabilities, recommended_execution_mode, complexity_level

### Phase 2: INTERVIEW → LLM PLANNING (replaced)
- ไม่ถาม user เรื่องเทคนิค
- LLM แตกงานเอง: กี่ node, capability อะไร, flow อย่างไร

### Phase 3: PLAN (enhanced)
- ดึง memories จาก agencies เก่าที่คล้ายกัน
- Plan includes per-node capability requirements

### Phase 4: REVIEW_PLAN (enhanced)
- เช็ค capability completeness
- เช็ค memory settings

### Phase 5: DESIGN (enhanced — already partially done)
- Output includes: objective, sharedInstructions, modelRequirements, executionMode, planningStrategy, enableLongTermMemory, memoryScope per node

### Phase 6: REVIEW_DESIGN (enhanced)
- 8-point checklist (already implemented in _self_review_spec)
- Additional check: capability-responsibility alignment

### Phase 7: VALIDATE (enhanced — already done)
- Intelligence defaults fallback

### Phase 8: IMPLEMENT (enhanced — already done)
- Map all new fields to saveBuilder

### Phase 9+: POST-CREATION (new)
- Generate improvement suggestions
- Option to save as template

## 4. Memory-Informed Design

เมื่อสร้าง agency ใหม่:
1. Query `agency_agent_memories` for memories with type "strategy_success" or "strategy_failure" from agencies in same tenant
2. Query `agency_improvement_history` for recent improvements
3. Include top 5 relevant learnings in design prompt as "past learnings" context
4. LLM uses these to make better design decisions

## 5. Post-Creation Suggestions

หลังสร้าง agency เสร็จ LLM วิเคราะห์ spec แล้ว suggest:
- Missing capabilities ("เพิ่ม vision สำหรับ Visual Designer")
- Missing nodes ("เพิ่ม QA Reviewer ก่อน output สุดท้าย")
- Alternative strategies ("ใช้ autonomous mode สำหรับ Researcher จะดีกว่า")
- Tool suggestions ("เพิ่ม code-interpreter สำหรับ Data Analyst")

แสดงเป็น cards ที่ user กด Apply/Skip

## 6. Template System

- ปุ่ม "Save as Template" ใน Agency Builder header
- Template stores: nodes, edges, instructions, modelRequirements, nodeConfig
- Template ไม่ store: specific data, memories, run history
- Templates visible in agency marketplace/gallery
- Uses existing `agencyTemplates` table

## 7. Files to Modify

### Python Backend
- `app/tasks/agency_creator_task.py` — Phases 1,2,3,4,5,6, new Phase 9+
- `app/api/agency_creator.py` — New endpoint for suggestions

### Node.js Backend
- `server/_core/index.ts` — Internal create API: pass objective + sharedInstructions
- `server/routers/agency.ts` — New: saveAsTemplate, getCreatorSuggestions

### Frontend
- `client/src/components/agency/AutoCreateAgencyModal.tsx` — Show suggestions, save template button

## 8. Budget Impact

- Current: 12 MAX_LLM_CALLS
- After: ~16 calls (add suggestion + memory retrieval phases)
- Cost increase: ~$0.02-0.04 per creation (acceptable)

## 9. Testing

- Python: test_agency_creator_v2.py — add tests for new phases
- Verify: every created agency has executionMode, modelRequirements, enableLongTermMemory, objective
- Verify: self-review loop catches missing capabilities
- Verify: suggestions are generated after creation
