# Feature 058: AI Agency Creator — Intelligence Upgrade

## Overview

ปรับปรุง AI Agency Creator ให้ LLM ตัดสินใจทางเทคนิคทั้งหมดแทน user โดย user แค่บอกสิ่งที่ต้องการ แล้ว LLM วิเคราะห์เองว่า:
- ต้องแบ่ง node อย่างไร แต่ละ node ทำอะไร
- แต่ละ node ต้องใช้ capability อะไร (web search, thinking, code execution, vision, computer use)
- ควรใช้ execution mode ไหน (single_shot / agentic with react/cot/basic)
- ต้อง enable memory หรือไม่ scope เท่าไร
- ควรมี conditions/routing อย่างไร
- ใช้ model strategy อะไร (cheapest/balanced/best)
- ดึงข้อมูลจาก memories อย่างไร

## Problem Statement

### ปัจจุบัน (ก่อน upgrade)
AI Creator สร้างได้แค่ basic topology:
- Hardcode model เป็น gpt-4o ทุก node
- ไม่ set executionMode (ใช้ single_shot default ที่ไม่ฉลาด)
- ไม่ set planningStrategy (ไม่มี react/cot reasoning)
- ไม่ enable long-term memory (ไม่จำข้ามรอบ)
- ไม่ set capability requirements (ไม่รู้ว่า node ไหนต้องใช้ web search, vision ฯลฯ)
- ไม่ set agency objective (improvement loop ไม่มีเป้าหมาย)
- ไม่ set memory scope (ไม่ share memory ข้าม node)
- ใช้ interview ถาม user เรื่องเทคนิค (user ตอบไม่ได้)
- ไม่มี self-review loop (output อาจไม่สมบูรณ์)

### เป้าหมาย
- User ระบุแค่สิ่งที่ต้องการ → LLM คิดต่อทั้งหมด
- LLM ตัดสินใจ capability requirements ให้แต่ละ node อัตโนมัติ
- LLM เลือก execution mode + planning strategy ตามความซับซ้อนของงาน
- LLM กำหนด memory settings ที่เหมาะสม
- LLM ตั้ง agency objective สำหรับ continuous improvement loop
- ระบบ self-review spec หลายรอบก่อน implement
- ใช้ข้อมูลจาก existing memories (ถ้ามี) ในการออกแบบ

## Depends On
- 052: Agency Swarm (7 node types, tools, entry point)
- 053: Agentic Intelligence (executionMode, planningStrategy, memory, cost controls)
- 056: Memory Vector RAG (agency-wide memory, objective, memoryScope)
- Continuous Improvement Loop (objective, feedback, health monitor)

## Architecture

### Design Flow (ปรับปรุง)

```
User: "ต้องการ agency ที่ทำ TikTok content สำหรับแม่และเด็ก"
         │
         ▼
Phase 1: DISCOVER
  LLM วิเคราะห์ requirement:
  - Domain: Social media content creation
  - Target: Mom & kid audience
  - Tasks: Research → Script → Visual
  - Complexity: Medium-High
         │
         ▼
Phase 2: LLM PLANNING (ใหม่ — แทน interview)
  LLM แตกงานเอง:
  - ต้องใช้กี่ node อะไรบ้าง
  - แต่ละ node ต้องใช้ capability อะไร
  - Flow ควรเป็นอย่างไร
  - Memory strategy ควรเป็นอย่างไร
         │
         ▼
Phase 3: DESIGN
  LLM สร้าง full spec:
  - objective, sharedInstructions
  - Per-node: executionMode, planningStrategy, modelRequirements,
    enableLongTermMemory, memoryScope, tools
  - Edges with proper flowType
         │
         ▼
Phase 4: SELF-REVIEW LOOP (ใหม่ — 2-3 รอบ)
  LLM ตรวจ spec ตัวเอง:
  Round 1: ตรวจ 8-point checklist → แก้ไข
  Round 2: ตรวจซ้ำ → ยืนยัน
  Round 3: (ถ้าจำเป็น) ตรวจ edge cases
         │
         ▼
Phase 5: VALIDATE
  Code-level validation:
  - Entry point ถูกต้อง
  - Node IDs unique
  - Router config ครบ
  - Intelligence defaults เติม
         │
         ▼
Phase 6: IMPLEMENT
  สร้าง agency ใน DB:
  - ทุก field ครบ (including new spec 053/056 fields)
  - Auto model selection (modelRequirements)
  - Memory enabled + agency scope
         │
         ▼
Phase 7: SUGGEST IMPROVEMENTS (ใหม่)
  LLM แนะนำ optional upgrades:
  - "เพิ่ม node QA reviewer จะช่วยตรวจคุณภาพ"
  - "เปิด computer use สำหรับ Designer จะดูตัวอย่างจริงได้"
  → แสดงให้ user เลือก apply
```

### Self-Review Checklist (8 points)

1. ทุก agent มี executionMode ที่เหมาะสม?
2. ทุก agentic agent มี planningStrategy?
3. ทุก agent มี modelRequirements ที่ถูกต้อง?
   - Research agents → supportsWebSearch: true
   - Analysis agents → supportsCodeExecution/supportsThinking: true
   - Visual agents → supportsVision: true
   - Critical output → strategy: "best"
4. enableLongTermMemory เปิดสำหรับ agents ที่ควรเรียนรู้?
5. Agency objective ชัดเจนและเฉพาะเจาะจง?
6. Tools ตรงกับ role ของแต่ละ agent?
7. Edges/flow สมเหตุสมผล?
8. มี capability ที่ควรเพิ่มแต่ยังไม่ได้ assign?

### Capability Auto-Detection Rules

| งานที่ต้องทำ | Capabilities ที่ต้องใช้ |
|-------------|----------------------|
| ค้นหาข้อมูล/วิจัย | supportsWebSearch: true |
| วิเคราะห์ตัวเลข/ข้อมูล | supportsCodeExecution: true, supportsThinking: true |
| ดูรูป/วิเคราะห์ภาพ | supportsVision: true |
| คิดเชิงลึก/วางแผน | supportsThinking: true |
| ควบคุม browser | supportsComputerUse: true |
| ใช้ tools | supportsFunctionTools: true |
| งานง่ายซ้ำๆ | strategy: "cheapest" |
| งานทั่วไป | strategy: "balanced" |
| งานสำคัญ/output สุดท้าย | strategy: "best" |

### Execution Mode Decision Matrix

| ลักษณะงาน | executionMode | planningStrategy |
|-----------|--------------|-----------------|
| ตอบคำถามง่าย, แปลภาษา | single_shot | - |
| งาน multi-step ไม่ใช้ tools | agentic | cot |
| งาน multi-step + ใช้ tools | agentic | react |
| งานซับซ้อน + วางแผน + review | agentic | react + maxReflectionCycles: 5 |

### Memory Decision Matrix

| ลักษณะ agency | enableLongTermMemory | memoryScope |
|--------------|---------------------|-------------|
| Run ครั้งเดียว (one-off task) | false | - |
| Run ซ้ำหลายรอบ (ongoing) | true | agency |
| Agent เฉพาะทางที่ต้องจำวิธีทำ | true | node |
| Default | true | agency |

## Affected Files

### Python Backend
- `app/tasks/agency_creator_task.py` — Main logic: design prompt, self-review, validate, implement
- `app/api/agency_creator.py` — API endpoints

### Node.js Backend
- `server/routers/agency.ts` — saveBuilder accepts new fields
- Internal API `/api/internal/agency/create`

### Frontend
- `client/src/components/agency/AutoCreateAgencyModal.tsx` — Show suggestions after creation

## Success Metrics

- Created agencies have executionMode set on every agent node
- Created agencies have modelRequirements (not hardcoded model)
- Created agencies have enableLongTermMemory: true by default
- Created agencies have meaningful objective
- Self-review loop catches and fixes 80%+ of missing fields
- User ไม่ต้องตอบคำถามเทคนิคใดๆ
