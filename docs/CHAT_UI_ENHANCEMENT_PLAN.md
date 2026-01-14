# Chat-to-Workflow Bridge & Approval UI: Development Plan

**วันที่:** 14 มกราคม 2026  
**Version:** 1.0.0  
**Status:** Planning

---

## 1. บทนำ

จากการประเมิน Use Case ล่าสุด พบว่าระบบ SmartSpecPro มี core logic และ workflows ที่แข็งแกร่ง แต่ยังขาดการเชื่อมต่อที่สมบูรณ์ระหว่าง **Desktop App Chat UI** และ **Backend Workflows** รวมถึงไม่มี UI สำหรับการ **อนุมัติ (Approval)** ในแต่ละขั้นตอน

เอกสารนี้คือแผนการพัฒนาเพื่อปิดช่องว่างดังกล่าว โดยจะเน้นการสร้าง 2 ส่วนประกอบหลัก:

1.  **Chat-to-Workflow Bridge:** กลไกสำหรับตรวจจับเจตนาของผู้ใช้ในหน้าแชทและเรียกใช้ workflow ที่เกี่ยวข้องโดยอัตโนมัติ
2.  **Approval UI:** Component ในหน้าแชทสำหรับให้ผู้ใช้ตรวจสอบและอนุมัติผลลัพธ์จาก workflow (เช่น `spec.md`, `plan.md`)

---

## 2. สถาปัตยกรรมที่นำเสนอ

สถาปัตยกรรมใหม่จะเชื่อมต่อ Chat UI เข้ากับ `ss-autopilot` ผ่าน Tauri Core (Rust) โดยตรง

```mermaid
graph TD
    subgraph Desktop App (Frontend - TypeScript)
        A[ChatInput] --> B{Intent Detection};
        B -- "สร้าง spec..." --> C[WorkflowService];
        C -- "call execute_workflow" --> D[Tauri Core];
        D -- "stream events" --> E[ChatMessages];
        E -- "render approval_request" --> F[ApprovalCard UI];
        F -- "on Approve" --> C;
    end

    subgraph Tauri Core (Backend - Rust)
        D -- "invoke" --> G[workflow_commands.rs];
        G -- "spawn child process" --> H[ss-autopilot CLI];
        H -- "stdout/stderr" --> G;
    end

    subgraph Autopilot System (Python)
        H -- "runs" --> I[Workflows];
    end

    style F fill:#d4edda,stroke:#c3e6cb
    style C fill:#d1ecf1,stroke:#bee5eb
    style G fill:#f8d7da,stroke:#f5c6cb
```

---

## 3. ส่วนประกอบที่ต้องพัฒนา

### 3.1 Part 1: Chat-to-Workflow Bridge

#### Frontend (TypeScript)

1.  **`src/services/workflowService.ts` (สร้างใหม่)**
    *   **`detectAndRunWorkflow(message: string): Promise<boolean>`**: ตรวจจับ intent จากข้อความ ถ้าเจอ keyword (เช่น "สร้าง spec") จะเรียก Tauri command
    *   **`handleWorkflowEvents()`**: รับ event stream จาก Tauri (stdout, stderr, exit, approval_request) และอัปเดต state ของ chat

2.  **`src/hooks/useWorkflow.ts` (สร้างใหม่)**
    *   Hook สำหรับจัดการ state ของ workflow (running, error, logs)
    *   ผูก `workflowService` เข้ากับ React context

3.  **`src/components/chat/ChatInterface.tsx` (แก้ไข)**
    *   ใน `handleSend()` จะเรียก `detectAndRunWorkflow()` ก่อน `sendMessage()`
    *   ถ้า `detectAndRunWorkflow()` คืนค่า `true` จะไม่ส่งข้อความไปหา LLM โดยตรง

#### Backend (Rust - Tauri)

1.  **`src-tauri/src/workflow_commands.rs` (สร้างใหม่)**
    *   **`#[tauri::command] async fn execute_workflow(window: Window, command: String, args: Vec<String>)`**: command หลักสำหรับรัน child process
    *   ใช้ `tokio::process::Command` เพื่อ spawn `ss-autopilot` หรือ workflow script อื่นๆ
    *   อ่าน stdout/stderr แบบ line-by-line และ emit event กลับไปที่ frontend (`window.emit("workflow-event", ...)`)

2.  **`src-tauri/src/main.rs` (แก้ไข)**
    *   Register `workflow_commands` module และ `execute_workflow` command

### 3.2 Part 2: Approval UI

#### Frontend (TypeScript)

1.  **`src/components/chat/ApprovalCard.tsx` (สร้างใหม่)**
    *   Component ที่แสดงผลเมื่อได้รับ message type `approval_request`
    *   **UI ประกอบด้วย:**
        *   Title (เช่น "อนุมัติ Spec?", "อนุมัติ Plan?")
        *   Preview ของ artifact (แสดงเนื้อหา `spec.md` บางส่วนใน `<pre>` tag)
        *   ปุ่ม **[✅ Approve]**, **[❌ Reject]**, **[✏️ Edit]**

2.  **`src/services/chatService.ts` (แก้ไข)**
    *   เพิ่ม `approval_request` ใน `ChatMessage` interface
    *   `interface ApprovalRequest { artifact_path: string; next_command: string; }`

3.  **`src/components/chat/ChatInterface.tsx` (แก้ไข)**
    *   ใน `MessageRenderer` จะ render `<ApprovalCard />` เมื่อ `message.type === 'approval_request'`

---

## 4. ขั้นตอนการดำเนินงาน (Phase 1)

| ขั้นตอน | Task | รายละเอียด | ระยะเวลา |
|---------|------|------------|----------|
| **1** | **Backend (Tauri)** | สร้าง `workflow_commands.rs` และ `execute_workflow` command | 1-2 วัน |
| **2** | **Frontend (Service)** | สร้าง `workflowService.ts` และ `useWorkflow.ts` | 1 วัน |
| **3** | **Frontend (UI)** | สร้าง `ApprovalCard.tsx` และปรับปรุง `chatService.ts` | 2 วัน |
| **4** | **Integration** | เชื่อมทุกส่วนเข้าด้วยกันใน `ChatInterface.tsx` และทดสอบ E2E | 1-2 วัน |
| **รวม** | | | **5-7 วัน** |

---

## 5. ตัวอย่าง Flow การทำงาน

1.  **User:** พิมพ์ "ช่วยสร้าง spec สำหรับ gallery website..." ใน `ChatInterface`
2.  **`ChatInterface`:** `handleSend()` เรียก `workflowService.detectAndRunWorkflow()`
3.  **`workflowService`:** ตรวจเจอ keyword → เรียก Tauri command `execute_workflow` พร้อม command `ss-autopilot run --spec-prompt "..."`
4.  **`workflow_commands.rs`:** Spawn process `ss-autopilot`
5.  **`ss-autopilot`:** รัน workflow `/smartspec_generate_spec_from_prompt`
6.  **Tauri:** Stream stdout/stderr กลับมาที่ `workflowService` → แสดงผลใน chat เป็น log
7.  **`ss-autopilot`:** สร้าง `spec.md` เสร็จ → พิมพ์ JSON output พิเศษ เช่น `SMARTSPEC_APPROVAL_REQUEST:{"artifact_path": "...", "next_command": "..."}`
8.  **`workflow_commands.rs`:** ตรวจเจอ `SMARTSPEC_APPROVAL_REQUEST` → emit event `workflow-approval-request`
9.  **`workflowService`:** รับ event → `addMessage({ type: 'approval_request', ... })`
10. **`ChatInterface`:** Render `<ApprovalCard />`
11. **User:** กดปุ่ม "Approve"
12. **`ApprovalCard`:** เรียก `workflowService` ให้รัน `next_command` ที่ได้รับมา
13. **Loop:** กลับไปขั้นตอนที่ 3 เพื่อรัน workflow ถัดไป (เช่น `/smartspec_generate_plan`)

---

## 6. สรุป

แผนการพัฒนานี้จะช่วยปิดช่องว่างที่สำคัญระหว่าง UI และ core logic ทำให้ผู้ใช้สามารถสั่งงานที่ซับซ้อนผ่านหน้าแชทได้อย่างราบรื่นและเป็นธรรมชาติ โดยมีระยะเวลาการพัฒนาเบื้องต้นประมาณ **5-7 วัน**
