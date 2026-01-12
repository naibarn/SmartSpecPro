# LLM Proxy Analysis

## ปัญหาที่พบ

### 1. Auth Token ไม่ถูก Forward ไปยัง Web Gateway

**ปัจจุบัน:**
- `web_gateway.py` ใช้ `SMARTSPEC_WEB_GATEWAY_TOKEN` (static token) เท่านั้น
- ไม่ forward user's auth token ไปยัง SmartSpecWeb

**ผลกระทบ:**
- SmartSpecWeb ไม่รู้ว่า user คนไหนเรียก
- Credit tracking ไม่ทำงาน
- Dashboard ไม่แสดงข้อมูลถูกต้อง

### 2. Multimodal Content

**ปัจจุบัน:**
- Frontend ส่ง `image_url` และ `file_url` ใน messages
- Backend forward payload ไป SmartSpecWeb โดยไม่แปลง
- SmartSpecWeb ต้องรองรับ format เหล่านี้

## สิ่งที่ต้องแก้ไข

### Backend (Python)

1. **Forward user auth token** ไปยัง SmartSpecWeb
   - เพิ่ม parameter `user_token` ใน `forward_chat_*` functions
   - ส่ง `Authorization: Bearer {user_token}` แทน static token

2. **ตรวจสอบ multimodal format**
   - ตรวจสอบว่า SmartSpecWeb รองรับ `image_url` และ `file_url`

### Frontend (React)

1. **ตรวจสอบว่า auth token ถูกส่งไปกับ request**
   - ปัจจุบันส่ง `Authorization: Bearer {token}` อยู่แล้ว ✅

## การแก้ไข

### web_gateway.py

```python
def _auth_headers(trace_id: str, user_token: Optional[str] = None) -> Dict[str, str]:
    h: Dict[str, str] = {"x-trace-id": trace_id}
    
    # Prefer user token for credit tracking
    if user_token:
        h["Authorization"] = f"Bearer {user_token}"
    elif settings.SMARTSPEC_WEB_GATEWAY_TOKEN:
        h["Authorization"] = f"Bearer {settings.SMARTSPEC_WEB_GATEWAY_TOKEN}"
    
    return h
```

### openai_compat.py

```python
# Extract user token from request
user_token = None
auth_header = req.headers.get("authorization", "")
if auth_header.lower().startswith("bearer "):
    user_token = auth_header.split(" ", 1)[1].strip()

# Forward with user token
if stream:
    async def gen():
        async for chunk in forward_chat_stream(payload, trace_id=tid, user_token=user_token):
            yield chunk
    return StreamingResponse(gen(), media_type="text/event-stream")

upstream = await forward_chat_json(payload, trace_id=tid, user_token=user_token)
```


---

## สรุปการแก้ไขที่ทำแล้ว (2026-01-12)

### 1. Backend Changes

#### `app/clients/web_gateway.py`
- ✅ เพิ่ม `user_token` parameter ใน `_auth_headers()` function
- ✅ เพิ่ม `user_token` parameter ใน `forward_chat_json()`, `forward_chat_stream()`, `forward_models()`, `mcp_tools()`, `mcp_call()`
- ✅ เพิ่ม `x-user-token` header สำหรับ SmartSpecWeb ระบุ user
- ✅ เพิ่ม `get_user_credits()` function สำหรับดึง credit balance

#### `app/api/openai_compat.py`
- ✅ เพิ่ม `_extract_user_token()` function เพื่อดึง user token จาก request
- ✅ แก้ไข `chat_completions()` endpoint ให้ forward user token ไปยัง Web Gateway
- ✅ แก้ไข `models()` endpoint ให้ forward user token ไปยัง Web Gateway

### 2. Frontend Status (No Changes Needed)

#### `services/llmOpenAI.ts`
- ✅ ส่ง auth token ใน `Authorization: Bearer {token}` header
- ✅ รองรับ multimodal content (`image_url`, `file_url`)
- ✅ รองรับ streaming

### 3. Data Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Desktop App    │────▶│  Python Backend │────▶│  SmartSpecWeb   │
│  (React/Tauri)  │     │  (FastAPI)      │     │  Gateway        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        │ Auth Token            │ Forward Token         │ Credit Tracking
        │ + Multimodal          │ + Multimodal          │ + LLM Providers
        ▼                       ▼                       ▼
```

### 4. Headers Sent to SmartSpecWeb

| Header | Value | Purpose |
|--------|-------|---------|
| `Authorization` | `Bearer {user_token}` | User authentication |
| `x-user-token` | `{user_token}` | Explicit user identification |
| `x-trace-id` | `{uuid}` | Request tracing |
| `Content-Type` | `application/json` | Request format |

### 5. Testing Checklist

- [ ] Auth token forwarded correctly
- [ ] Streaming works through gateway
- [ ] Image attachments processed
- [ ] File attachments processed
- [ ] Credits deducted on SmartSpecWeb
- [ ] Dashboard shows usage data
- [ ] Error handling for insufficient credits
