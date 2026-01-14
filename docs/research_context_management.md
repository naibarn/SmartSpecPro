# Research: Context Management for LLM Agents

## แหล่งข้อมูล: JetBrains Research (Dec 2025)

### 2 วิธีหลักในการจัดการ Context

#### 1. LLM Summarization
- ใช้ AI model สร้าง summary ของ conversation history
- บีบอัด reasoning, action, และ observation ทั้งหมดเป็น compact form
- **ข้อดี**: รองรับ infinite turns ได้ (context ไม่โตเกินไป)
- **ข้อเสีย**: ต้องเรียก LLM เพิ่ม = ค่าใช้จ่ายเพิ่ม, อาจสูญเสียรายละเอียดสำคัญ

#### 2. Observation Masking
- ซ่อนเฉพาะ observation (output จาก environment) ที่เก่า
- **เก็บ reasoning และ action history ไว้ครบ**
- แทนที่ observation เก่าด้วย placeholder เช่น "[content hidden]"
- **ข้อดี**: เรียบง่าย, ไม่ต้องเรียก LLM เพิ่ม, เก็บ reasoning chain ไว้
- **ข้อเสีย**: context ยังโตได้ถ้า turns มากเกินไป

### Hybrid Approach (แนะนำ)
- ใช้ Observation Masking เป็นหลัก
- เมื่อ context ใกล้ limit → ใช้ LLM Summarization

### Key Insights

1. **Observation เป็นส่วนที่ใหญ่ที่สุด** - code files, test logs, file reads
2. **Reasoning และ Action สำคัญกว่า** - ต้องเก็บไว้เพื่อให้ LLM เข้าใจ flow
3. **ไม่ควรลบ turns ทั้งหมด** - จะทำให้ reasoning chain ขาด

## Best Practices จากแหล่งอื่น

### Token Limit Strategies

1. **Sliding Window** - เก็บเฉพาะ N messages ล่าสุด
2. **Token-based Truncation** - ตัดเมื่อใกล้ limit
3. **Summarization** - สรุป messages เก่า
4. **Hybrid** - รวมหลายวิธี

### สำหรับ Code Context

1. **Line Limit** - จำกัดจำนวนบรรทัดที่ส่งไป (เช่น 500 lines)
2. **Relevance Scoring** - ส่งเฉพาะ code ที่เกี่ยวข้อง
3. **Chunking** - แบ่ง code เป็นส่วนๆ

### Model Token Limits (Reference)

| Model | Context Window |
|-------|---------------|
| GPT-4o | 128K tokens |
| GPT-4o-mini | 128K tokens |
| Claude 3.5 Sonnet | 200K tokens |
| Gemini 2.0 Flash | 1M tokens |
| DeepSeek | 64K tokens |

### Token Estimation
- ~4 characters = 1 token (English)
- ~2-3 characters = 1 token (Thai/CJK)
- 1 line of code ≈ 10-30 tokens


## Kilo Code Context Management (Official Docs)

### Context Window ประกอบด้วย:
1. **System prompt** - คำสั่งสำหรับ Kilo Code
2. **Conversation history** - ประวัติการสนทนา
3. **File content** - เนื้อหาไฟล์ที่ mention ด้วย @
4. **Command output** - ผลลัพธ์จาก tools/commands

### Strategies ที่ Kilo Code ใช้:

1. **Be Specific** - ใช้ file paths และ function names ที่ชัดเจน
2. **Context Mentions** - ใช้ @/path/to/file.ts, @problems, @commit
3. **Break Down Tasks** - แบ่งงานใหญ่เป็นงานย่อย
4. **Summarize** - สรุปแทนการส่ง code ทั้งหมด
5. **Prioritize Recent History** - **Kilo Code truncates older messages อัตโนมัติ**
6. **Prompt Caching** - cache prompts เพื่อลดค่าใช้จ่าย

### Key Insight:
> "Kilo Code automatically truncates older messages in the conversation history to stay within the context window."

นี่คือสิ่งที่เราต้อง implement - **Auto-truncation ของ conversation history**


## Kilo Code Source Code Analysis

### Context Management Events (3 ประเภท)
1. **condense_context** - Context ถูก summarize ด้วย AI
2. **condense_context_error** - เกิด error ระหว่าง condensation
3. **sliding_window_truncation** - Context ถูก truncate ด้วย sliding window

### Key Constants
```typescript
N_MESSAGES_TO_KEEP = 3  // เก็บ 3 messages ล่าสุดไว้เสมอ
MIN_CONDENSE_THRESHOLD = 5  // % ขั้นต่ำที่จะ trigger condense
MAX_CONDENSE_THRESHOLD = 100  // % สูงสุด
ANTHROPIC_DEFAULT_MAX_TOKENS = 8192  // Reserved สำหรับ output
```

### Settings ที่ผู้ใช้ตั้งได้
- **autoCondenseContext**: boolean - เปิด/ปิด auto condense
- **autoCondenseContextPercent**: number - % ที่จะ trigger auto condense

### Condense Strategy (summarizeConversation)

1. **เก็บ N_MESSAGES_TO_KEEP (3) messages ล่าสุดไว้**
2. **เก็บ first message ไว้** (อาจมี slash command)
3. **Summarize messages ที่เหลือ** ด้วย LLM
4. **ใส่ summary แทนที่ messages เก่า**
5. **Tag messages เก่าด้วย condenseParent** (non-destructive)

### Summary Prompt Structure
```
1. Previous Conversation: [High level overview]
2. Current Work: [What was being worked on]
3. Key Technical Concepts: [Technologies, frameworks]
4. Relevant Files and Code: [Files modified/examined]
5. Problem Solving: [Problems solved, troubleshooting]
6. Pending Tasks and Next Steps: [Outstanding work]
```

### Context Usage Calculation
```typescript
interface ContextUsage {
  percentage: number;      // % ของ context ที่ใช้
  tokensUsed: number;      // tokens ที่ใช้ไปแล้ว
  maxTokens: number;       // context window ของ model
  reservedForOutput: number; // reserved สำหรับ output
  availableSize: number;   // พื้นที่ว่างที่เหลือ
}
```

### Color Coding for Context Usage
- **Green**: < 61%
- **Yellow**: 61-85%
- **Red**: >= 86%

## สรุป Design Decisions สำหรับ SmartSpec

### 1. Context Storage Strategy
- เก็บ conversation history ใน backend (per session)
- ใช้ session_id เพื่อ track conversations

### 2. Truncation Strategy (Hybrid)
- **Primary**: Sliding Window - เก็บ N messages ล่าสุด
- **Secondary**: LLM Summarization - เมื่อ context ใกล้ limit

### 3. Token Limit Protection
- คำนวณ tokens ก่อนส่ง
- ตรวจสอบ model context window
- Reserve tokens สำหรับ output (8192 default)

### 4. Observation Masking
- แทนที่ output ยาวๆ (code, logs) ด้วย placeholder
- เก็บ reasoning และ action ไว้ครบ

### 5. Settings ที่ควรมี
- maxMessagesToKeep: number (default: 10)
- autoCondenseEnabled: boolean (default: true)
- autoCondenseThreshold: number (default: 80%)
- maxCodeLinesPerMessage: number (default: 500)
