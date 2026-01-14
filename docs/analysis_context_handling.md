# การวิเคราะห์เปรียบเทียบ: UI vs Kilo Code CLI

## สรุปปัญหาหลัก: Context/Conversation History ไม่ถูกส่งไปยัง LLM

### การทำงานปัจจุบันของ UI (KiloCli.tsx)

```
User Command → kiloRun API → job_manager.py → cli_enhanced.py → LLM
                    ↓
              สร้าง Job ใหม่ทุกครั้ง
                    ↓
              ไม่มีการส่ง conversation history
```

**ปัญหา:**
1. ทุกครั้งที่เรียก `kiloRun()` จะสร้าง Job ใหม่
2. Job ใหม่ไม่มีความรู้เกี่ยวกับ conversation ก่อนหน้า
3. LLM ได้รับเฉพาะ system prompt + user message ปัจจุบัน
4. **ไม่มีการส่ง previous messages/context ไปด้วย**

### การทำงานของ Kilo Code CLI ต้นฉบับ

Kilo Code CLI (VS Code Extension) มีการจัดการ conversation context ดังนี้:
1. เก็บ conversation history ไว้ใน memory
2. ส่ง full conversation history ไปยัง LLM ทุกครั้ง
3. LLM สามารถอ้างอิงบริบทก่อนหน้าได้

### สิ่งที่ขาดหายใน Implementation ปัจจุบัน

| Feature | Kilo Code CLI | SmartSpec UI | Status |
|---------|---------------|--------------|--------|
| Conversation History | ✅ เก็บและส่งทุกครั้ง | ❌ ไม่มี | **ขาดหาย** |
| Context Continuity | ✅ LLM จำบริบทได้ | ❌ เริ่มใหม่ทุกครั้ง | **ขาดหาย** |
| Multi-turn Dialogue | ✅ รองรับ | ❌ ไม่รองรับ | **ขาดหาย** |
| Session Management | ✅ มี session ID | ❌ ไม่มี | **ขาดหาย** |

## แนวทางแก้ไข

### Option 1: Server-side Session Management (แนะนำ)

```python
# job_manager.py - เพิ่ม session/conversation tracking
class Job:
    session_id: str  # เพิ่ม session ID
    conversation_history: List[Dict]  # เก็บ messages ทั้งหมด

# เมื่อรันคำสั่งใหม่ใน session เดิม
# ส่ง conversation_history ไปด้วย
```

### Option 2: Client-side Context Passing

```typescript
// KiloCli.tsx - ส่ง context ไปกับ command
async function runInActiveTab() {
    // รวบรวม conversation history จาก tab
    const history = activeTab.conversationHistory;
    
    // ส่งไปกับ command
    const res = await kiloRun(workspace, cmd, {
        sessionId: activeTab.sessionId,
        conversationHistory: history
    });
}
```

### Option 3: Hybrid Approach

1. Frontend เก็บ session ID และ conversation summary
2. Backend เก็บ full conversation history per session
3. เมื่อรันคำสั่งใหม่ ส่ง session ID ไป
4. Backend ดึง history จาก session และส่งไป LLM

## การเปลี่ยนแปลงที่ต้องทำ

### 1. Backend API (kilo_cli.py)

```python
class RunReq(BaseModel):
    workspace: str
    command: str
    session_id: Optional[str] = None  # เพิ่ม
    conversation_history: Optional[List[Dict]] = None  # เพิ่ม
```

### 2. Job Manager (job_manager.py)

```python
class Job:
    session_id: str
    conversation_history: List[Dict]
    
def start(self, command: str, cwd: str, session_id: str = None, history: List = None):
    # ส่ง history ไปยัง cli_enhanced.py
```

### 3. CLI Enhanced (cli_enhanced.py)

```python
# รับ conversation history และส่งไป LLM
messages = conversation_history + [
    {"role": "user", "content": user_question}
]
response = client.chat(messages, model=None)
```

### 4. Frontend (KiloCli.tsx)

```typescript
type Tab = {
    id: string;
    sessionId: string;  // เพิ่ม
    conversationHistory: Array<{role: string, content: string}>;  // เพิ่ม
    // ...
};

async function runInActiveTab() {
    // ส่ง session และ history ไปด้วย
    const res = await kiloRun(workspace, cmd, {
        sessionId: activeTab.sessionId,
        conversationHistory: activeTab.conversationHistory
    });
    
    // เก็บ response ไว้ใน history
    updateTab(tabId, {
        conversationHistory: [
            ...activeTab.conversationHistory,
            { role: "user", content: cmd },
            { role: "assistant", content: response }
        ]
    });
}
```

### 5. Service (kiloCli.ts)

```typescript
export async function kiloRun(
    workspace: string, 
    command: string,
    options?: {
        sessionId?: string;
        conversationHistory?: Array<{role: string, content: string}>;
    }
): Promise<KiloRunResult> {
    // ...
    body: JSON.stringify({ 
        workspace, 
        command,
        session_id: options?.sessionId,
        conversation_history: options?.conversationHistory
    }),
}
```

## Priority

1. **High**: เพิ่ม session_id และ conversation_history ใน API
2. **High**: แก้ไข job_manager.py ให้ส่ง history ไป cli
3. **High**: แก้ไข cli_enhanced.py ให้ใช้ history
4. **Medium**: แก้ไข frontend ให้เก็บและส่ง history
5. **Low**: เพิ่ม UI แสดง conversation history
