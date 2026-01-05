# Kilo Code CLI Integration - UML Diagrams

เอกสารนี้รวบรวม UML Diagrams ที่อธิบายการทำงานของ Kilo Code CLI Integration ใน SmartSpec Pro

## 1. Activity Diagram - ภาพรวมการทำงาน

แผนภาพนี้แสดงขั้นตอนการทำงานทั้งหมดของ Kilo CLI Integration ตั้งแต่เริ่มต้นจนจบ

![Kilo CLI Activity Diagram](diagrams/kilo_cli_activity.png)

### คำอธิบาย Phases

| Phase | สี | คำอธิบาย |
|-------|-----|----------|
| **🚀 Initialization** | น้ำเงิน | ตรวจสอบ CLI และสร้าง Session |
| **💡 Skill Injection** | เขียว | ดึง Memory และ Inject Skills |
| **⚡ Execution** | ส้ม | รัน Kilo CLI และรอผลลัพธ์ |
| **📊 Result Processing** | ม่วง | ประมวลผลและบันทึก Metrics |
| **🔄 State Sync** | ฟ้า | Sync Checkpoints และ Tasks |
| **💾 Memory Storage** | ชมพู | บันทึกลง Episodic Memory |
| **🧹 Cleanup** | เทา | ปิด Session และ Cleanup |

---

## 2. Sequence Diagram - ลำดับการเรียก Methods

แผนภาพนี้แสดงลำดับการเรียก methods ระหว่าง components ต่างๆ

![Kilo CLI Sequence Diagram](diagrams/kilo_cli_sequence.png)

### Components ที่เกี่ยวข้อง

| Component | หน้าที่ |
|-----------|--------|
| **Workflow Orchestrator** | ควบคุมการทำงานทั้งหมด |
| **Session Manager** | จัดการ Kilo Sessions |
| **Skill Manager** | จัดการ Skills และ Injection |
| **State Sync** | Sync State ระหว่าง SmartSpec ↔ Kilo |
| **Kilo CLI** | เครื่องมือ CLI สำหรับ coding |
| **Git Repository** | เก็บ code changes และ checkpoints |
| **Memory Services** | Semantic + Episodic Memory |

---

## 3. State Diagram - สถานะของ Kilo Session

แผนภาพนี้แสดง state transitions ของ Kilo Session

![Kilo Session State Diagram](diagrams/kilo_session_state.png)

### Session States

| State | สัญลักษณ์ | คำอธิบาย |
|-------|----------|----------|
| **Created** | 🆕 | Session ถูกสร้างแล้ว กำลัง initialize |
| **Idle** | ⏸️ | พร้อมรับ task ใหม่ |
| **Running** | 🔄 | กำลังรัน task อยู่ |
| **Error** | ⚠️ | เกิด error (recoverable หรือ fatal) |
| **Timeout** | ⏱️ | Task timeout, กำลัง kill process |
| **Stopped** | 🛑 | Session ถูกปิดแล้ว |

### State Transitions

```
Created → Idle       : CLI verified, session ready
Idle → Running       : execute_task() called
Running → Idle       : Task completed successfully
Running → Error      : Task failed
Running → Timeout    : Timeout exceeded
Error → Idle         : Retry successful
Error → Stopped      : Fatal error
Timeout → Idle       : Process killed, ready for retry
Idle → Stopped       : close_session() called
```

---

## 4. สรุป Flow หลัก

### 4.1 Happy Path (Normal Execution)

```
1. Check CLI Available ✓
2. Create Session ✓
3. Initialize Sync State ✓
4. Get Semantic Memories ✓
5. Inject SmartSpec Context ✓
6. Setup Project Skills ✓
7. Receive Task from Workflow ✓
8. Build & Execute Kilo Command ✓
9. Parse JSON Output ✓
10. Update Metrics ✓
11. Record Checkpoint & Task ✓
12. Store Episode (optional) ✓
13. Close Session ✓
```

### 4.2 Fallback Path (CLI Not Available)

```
1. Check CLI Available ✗
2. Fallback to LLM Execution
3. Use LCEL Chains
4. Return LLM Result
```

### 4.3 Error Recovery Path

```
1. Task Execution Failed
2. Record Error in State
3. Check if Recoverable
   - Yes: Retry with same/modified prompt
   - No: Mark as Fatal, close session
4. Sync Error State
```

---

## 5. Key Decision Points

| Decision | Yes Path | No Path |
|----------|----------|---------|
| CLI Available? | Create Session | Fallback to LLM |
| Has Memories? | Inject Context | Skip to Default Skills |
| Task Successful? | Extract Result | Record Error |
| New Checkpoint? | Record Mapping | Skip to Task Record |
| Store Episode? | Save to ChromaDB | Continue |
| More Tasks? | Loop to Receive Task | Cleanup |

---

## 6. ไฟล์ Diagram Sources

ไฟล์ต้นฉบับ Mermaid สำหรับแก้ไขเพิ่มเติม:

- `diagrams/kilo_cli_activity.mmd` - Activity Diagram
- `diagrams/kilo_cli_sequence.mmd` - Sequence Diagram
- `diagrams/kilo_session_state.mmd` - State Diagram

### การ Render ใหม่

```bash
# Render Activity Diagram
manus-render-diagram diagrams/kilo_cli_activity.mmd diagrams/kilo_cli_activity.png

# Render Sequence Diagram
manus-render-diagram diagrams/kilo_cli_sequence.mmd diagrams/kilo_cli_sequence.png

# Render State Diagram
manus-render-diagram diagrams/kilo_session_state.mmd diagrams/kilo_session_state.png
```

---

## 7. Related Documentation

- [Priority 2 Report](PRIORITY_2_REPORT.md) - รายละเอียดการ implement
- [Kilo CLI Research](kilo_cli_research.md) - ข้อมูล Kilo CLI
- [Comprehensive Plan](COMPREHENSIVE_PLAN.md) - แผนงานทั้งหมด
