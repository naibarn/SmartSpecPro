# Context Management Architecture for SmartSpec Kilo CLI

## Overview

ระบบ Context Management ที่ออกแบบมาเพื่อจัดการ conversation history อย่างมีประสิทธิภาพ
โดยอ้างอิงจาก Kilo Code และ best practices จากงานวิจัย

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Frontend (KiloCli.tsx)                       │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────────┐  │
│  │   Tab 1     │  │   Tab 2     │  │   Tab N                     │  │
│  │ sessionId   │  │ sessionId   │  │   sessionId                 │  │
│  │ localHistory│  │ localHistory│  │   localHistory              │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────────┘  │
│                              │                                       │
│                              ▼                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    kiloCli.ts Service                         │   │
│  │  - kiloRun(workspace, command, sessionId, localHistory)      │   │
│  │  - Sends only essential context to backend                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      Backend API (kilo_cli.py)                       │
├─────────────────────────────────────────────────────────────────────┤
│  POST /api/v1/kilo/run                                              │
│  {                                                                   │
│    workspace: string,                                                │
│    command: string,                                                  │
│    session_id?: string,                                              │
│    conversation_context?: ConversationContext                        │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Session Manager (session_manager.py)              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     SessionStore                                │ │
│  │  - sessions: Dict[session_id, Session]                         │ │
│  │  - create_session() -> session_id                              │ │
│  │  - get_session(session_id) -> Session                          │ │
│  │  - add_message(session_id, message)                            │ │
│  │  - get_context(session_id, max_tokens) -> List[Message]        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                     Session                                     │ │
│  │  - session_id: str                                              │ │
│  │  - created_at: datetime                                         │ │
│  │  - messages: List[Message]                                      │ │
│  │  - summary: Optional[str]                                       │ │
│  │  - total_tokens: int                                            │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                 Context Manager (context_manager.py)                 │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                  ContextManager                                 │ │
│  │                                                                 │ │
│  │  Settings:                                                      │ │
│  │  - max_context_tokens: int (default: 100000)                   │ │
│  │  - reserved_output_tokens: int (default: 8192)                 │ │
│  │  - max_messages_to_keep: int (default: 10)                     │ │
│  │  - auto_condense_threshold: float (default: 0.80)              │ │
│  │  - max_code_lines: int (default: 500)                          │ │
│  │                                                                 │ │
│  │  Methods:                                                       │ │
│  │  - prepare_context(session, new_message) -> PreparedContext    │ │
│  │  - truncate_if_needed(messages) -> List[Message]               │ │
│  │  - summarize_old_messages(messages) -> Summary                 │ │
│  │  - mask_large_observations(messages) -> List[Message]          │ │
│  │  - estimate_tokens(text) -> int                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CLI Enhanced (cli_enhanced.py)                  │
├─────────────────────────────────────────────────────────────────────┤
│  - Receives prepared context from backend                           │
│  - Builds messages array for LLM                                    │
│  - Calls LLM with full context                                      │
│  - Returns response                                                  │
└─────────────────────────────────────────────────────────────────────┘

## Data Structures

### Message
```python
@dataclass
class Message:
    role: str  # "user" | "assistant" | "system"
    content: str
    timestamp: datetime
    token_count: int
    message_type: str  # "command" | "response" | "code" | "summary"
    metadata: Optional[Dict] = None
    is_masked: bool = False
    original_content: Optional[str] = None  # เก็บ content เดิมก่อน mask
```

### ConversationContext (ส่งจาก Frontend)
```python
@dataclass
class ConversationContext:
    session_id: Optional[str]
    recent_messages: List[Dict]  # เฉพาะ 3-5 messages ล่าสุด
    summary: Optional[str]  # summary ของ conversation ก่อนหน้า
```

### PreparedContext (ส่งไป LLM)
```python
@dataclass
class PreparedContext:
    messages: List[Dict]  # messages ที่พร้อมส่งไป LLM
    total_tokens: int
    was_truncated: bool
    was_summarized: bool
    context_usage_percent: float
```

## Context Preparation Flow

```
1. Receive Request
   │
   ▼
2. Get/Create Session
   │
   ▼
3. Add New Message to Session
   │
   ▼
4. Calculate Current Token Count
   │
   ▼
5. Check if Exceeds Threshold
   │
   ├── No ──► 7. Build Context
   │
   ▼ Yes
6. Apply Truncation Strategy
   │
   ├── Strategy 1: Sliding Window
   │   └── Keep last N messages
   │
   ├── Strategy 2: Observation Masking
   │   └── Replace large outputs with "[Content truncated: X lines]"
   │
   └── Strategy 3: Summarization (if still over limit)
       └── Summarize old messages with LLM
   │
   ▼
7. Build Context for LLM
   │
   ├── System Prompt
   ├── Summary (if exists)
   ├── Recent Messages
   └── Current User Message
   │
   ▼
8. Return PreparedContext
```

## Truncation Strategies

### Strategy 1: Sliding Window (Primary)
- เก็บ N messages ล่าสุด (default: 10)
- เรียบง่าย ไม่มี overhead
- เหมาะสำหรับ conversations ที่ไม่ยาวมาก

### Strategy 2: Observation Masking
- แทนที่ output ยาวๆ ด้วย placeholder
- เก็บ reasoning และ action ไว้ครบ
- ลด tokens โดยไม่สูญเสีย flow

```python
def mask_large_observation(content: str, max_lines: int = 500) -> str:
    lines = content.split('\n')
    if len(lines) <= max_lines:
        return content
    
    # เก็บ first และ last lines
    keep_start = max_lines // 3
    keep_end = max_lines // 3
    
    masked = lines[:keep_start]
    masked.append(f"\n[... {len(lines) - keep_start - keep_end} lines truncated ...]\n")
    masked.extend(lines[-keep_end:])
    
    return '\n'.join(masked)
```

### Strategy 3: LLM Summarization (Secondary)
- ใช้เมื่อ Sliding Window ไม่เพียงพอ
- สร้าง summary ของ conversation เก่า
- เก็บ summary ไว้ใน session

```python
SUMMARY_PROMPT = """
Summarize the conversation so far, focusing on:
1. What the user asked for
2. What actions were taken
3. Current state of the work
4. Any pending tasks

Keep the summary concise but preserve important technical details.
"""
```

## Token Estimation

```python
def estimate_tokens(text: str) -> int:
    """
    Estimate token count without calling tokenizer API.
    Rule of thumb: ~4 chars per token for English, ~2-3 for Thai/CJK
    """
    # Count characters
    char_count = len(text)
    
    # Detect if mostly non-ASCII (Thai, CJK, etc.)
    non_ascii = sum(1 for c in text if ord(c) > 127)
    non_ascii_ratio = non_ascii / max(char_count, 1)
    
    if non_ascii_ratio > 0.3:
        # More non-ASCII characters, use lower ratio
        return int(char_count / 2.5)
    else:
        # Mostly ASCII/English
        return int(char_count / 4)
```

## Model Token Limits

```python
MODEL_CONTEXT_LIMITS = {
    # OpenAI
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-3.5-turbo": 16385,
    
    # Anthropic
    "claude-3-5-sonnet": 200000,
    "claude-3-opus": 200000,
    "claude-3-haiku": 200000,
    
    # Google
    "gemini-2.0-flash": 1000000,
    "gemini-1.5-pro": 2000000,
    
    # DeepSeek
    "deepseek-chat": 64000,
    "deepseek-coder": 64000,
    
    # Default fallback
    "default": 32000
}

def get_model_limit(model_name: str) -> int:
    """Get context limit for a model, with fallback to default"""
    for key, limit in MODEL_CONTEXT_LIMITS.items():
        if key in model_name.lower():
            return limit
    return MODEL_CONTEXT_LIMITS["default"]
```

## Settings Configuration

```python
@dataclass
class ContextSettings:
    # Token limits
    max_context_tokens: int = 100000  # Max tokens to use (leave room for model limit)
    reserved_output_tokens: int = 8192  # Reserved for model output
    
    # Truncation settings
    max_messages_to_keep: int = 10  # Messages to keep in sliding window
    auto_condense_enabled: bool = True
    auto_condense_threshold: float = 0.80  # Trigger at 80% capacity
    
    # Content limits
    max_code_lines: int = 500  # Max lines per code block
    max_output_lines: int = 200  # Max lines for command output
    
    # Summarization
    enable_summarization: bool = True
    summary_model: Optional[str] = None  # Use same model if None
```

## API Changes

### Backend: kilo_cli.py

```python
class RunReq(BaseModel):
    workspace: str
    command: str
    session_id: Optional[str] = None
    conversation_context: Optional[ConversationContext] = None

@router.post("/run")
async def run(req: Request, body: RunReq):
    # ... existing validation ...
    
    # Get or create session
    session_id = body.session_id or str(uuid.uuid4())
    
    # Prepare context
    context_manager = ContextManager()
    prepared_context = context_manager.prepare_context(
        session_id=session_id,
        new_command=body.command,
        conversation_context=body.conversation_context
    )
    
    # Start job with context
    job = JOB_MANAGER.start(
        command=body.command,
        cwd=body.workspace,
        session_id=session_id,
        context=prepared_context
    )
    
    return {"jobId": job.job_id, "sessionId": session_id}
```

### Frontend: kiloCli.ts

```typescript
export interface ConversationContext {
    sessionId?: string;
    recentMessages: Array<{role: string, content: string}>;
    summary?: string;
}

export async function kiloRun(
    workspace: string, 
    command: string,
    context?: ConversationContext
): Promise<KiloRunResult> {
    // ... existing code ...
    body: JSON.stringify({ 
        workspace, 
        command,
        session_id: context?.sessionId,
        conversation_context: context
    }),
}
```

### Frontend: KiloCli.tsx

```typescript
type Tab = {
    id: string;
    sessionId: string;  // NEW: Session ID for context continuity
    title: string;
    command: string;
    jobId: string;
    status: string;
    lines: string[];
    lastSeq: number;
    isWaiting: boolean;
    conversationHistory: Array<{  // NEW: Local history
        role: "user" | "assistant";
        content: string;
        timestamp: number;
    }>;
};
```

## Implementation Priority

1. **Phase 1: Basic Session Support**
   - Add session_id to API
   - Store session in memory
   - Pass context to CLI

2. **Phase 2: Sliding Window Truncation**
   - Implement max_messages_to_keep
   - Add token estimation
   - Frontend history management

3. **Phase 3: Observation Masking**
   - Detect large outputs
   - Implement masking logic
   - Preserve reasoning chain

4. **Phase 4: LLM Summarization**
   - Implement summary generation
   - Store summaries in session
   - Auto-trigger on threshold

5. **Phase 5: Settings & UI**
   - Add settings to Admin panel
   - Context usage indicator in UI
   - Manual condense button
