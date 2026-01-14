# 🚀 Kilo CLI + LLM Integration Setup Guide

คู่มือการติดตั้งและ config ให้ Kilo CLI เชื่อมต่อกับ LLM ผ่าน Python Backend Proxy

---

## ✅ สิ่งที่ได้ implement แล้ว

### 1. **LLM Client สำหรับ Kilo CLI**
- ไฟล์: `.smartspec/ss_autopilot/llm_client.py`
- ฟีเจอร์:
  - ✅ เรียกใช้ LLM ผ่าน Backend OpenAI-compatible endpoint
  - ✅ รองรับ error handling (401, 402, 500)
  - ✅ แสดง usage statistics
  - ✅ รองรับ workflow execution

### 2. **Kilo CLI Integration**
- ไฟล์: `.smartspec/ss_autopilot/cli_enhanced.py`
- ฟีเจอร์:
  - ✅ เรียกใช้ LLM เมื่อผู้ใช้ให้ input
  - ✅ ส่ง workflow content + user input ไปยัง LLM
  - ✅ แสดงผลลัพธ์จาก LLM แบบเรียบร้อย
  - ✅ Error handling สำหรับทุกกรณี

### 3. **Python Backend Proxy**
- ไฟล์: `python-backend/app/api/openai_compat.py`
- ฟีเจอร์:
  - ✅ รองรับสองโหมด:
    - **Direct Proxy Mode** (USE_WEB_GATEWAY=false) - ใช้ local providers
    - **Web Gateway Mode** (USE_WEB_GATEWAY=true) - ใช้ SmartSpecWeb gateway
  - ✅ OpenAI-compatible format
  - ✅ Multi-provider support (OpenRouter, OpenAI, Anthropic, etc.)

---

## 📋 ขั้นตอนการ Setup

### ขั้นที่ 1: ติดตั้ง Dependencies

```bash
cd /home/naibarn/projects/SmartSpecPro

# ติดตั้ง requests library สำหรับ Kilo CLI
pip install requests

# ถ้ายังไม่ได้ติดตั้ง backend dependencies
cd python-backend
pip install -r requirements.txt
```

### ขั้นที่ 2: Setup LLM Provider API Key

เลือก **หนึ่ง** ในตัวเลือกต่อไปนี้:

#### ตัวเลือก A: OpenRouter (แนะนำ - 420+ models, API key เดียว)

1. ไปที่: https://openrouter.ai/keys
2. สร้าง API key
3. แก้ไข `python-backend/.env`:

```bash
# Option 1: OpenRouter (Recommended)
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENROUTER_SITE_URL=https://smartspec.pro
OPENROUTER_SITE_NAME=SmartSpec Pro
USE_OPENROUTER=true
```

#### ตัวเลือก B: OpenAI Direct

```bash
# Option 2: OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### ตัวเลือก C: Anthropic Direct

```bash
# Option 3: Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### ตัวเลือก D: Kilo Code (แนะนำ - OpenRouter-compatible)

```bash
# Option 4: Kilo Code
KILOCODE_API_KEY=kilo_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
KILOCODE_BASE_URL=https://api.kilo.ai/api/openrouter
```

### ขั้นที่ 3: Config Kilo CLI Environment Variables

สร้างไฟล์ `.env` ที่ root project หรือ export ตัวแปรเหล่านี้:

```bash
# Backend URL
export SMARTSPEC_BACKEND_URL=http://localhost:8000

# Proxy Token (ใช้ค่าเดียวกับที่ตั้งใน python-backend/.env)
export SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026

# Default Model (optional)
export SMARTSPEC_DEFAULT_MODEL=anthropic/claude-3-5-sonnet-20241022
```

หรือสร้างไฟล์ `.env` ที่ root:

```bash
cat > .env <<EOF
SMARTSPEC_BACKEND_URL=http://localhost:8000
SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026
SMARTSPEC_DEFAULT_MODEL=anthropic/claude-3-5-sonnet-20241022
EOF
```

### ขั้นที่ 4: ตรวจสอบ Backend Configuration

แก้ไข `python-backend/.env` ให้มีค่าเหล่านี้:

```bash
# Kilo CLI / Desktop App Security
SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026
SMARTSPEC_LOCALHOST_ONLY=false

# LLM Gateway Mode (เลือกโหมด)
# Mode 1: Direct Proxy (แนะนำสำหรับเริ่มต้น)
SMARTSPEC_USE_WEB_GATEWAY=false

# Mode 2: Web Gateway (ถ้าต้องการใช้ SmartSpecWeb)
# SMARTSPEC_USE_WEB_GATEWAY=true
# SMARTSPEC_WEB_GATEWAY_URL=http://localhost:3000/api/v1/llm/openai/chat/completions
# SMARTSPEC_WEB_GATEWAY_TOKEN=your_gateway_token_here
```

### ขั้นที่ 5: Start Python Backend

```bash
cd python-backend
python -m uvicorn app.main:app --reload --port 8000
```

ตรวจสอบว่า backend ทำงาน:
```bash
curl http://localhost:8000/health
```

### ขั้นที่ 6: ทดสอบ LLM Connection

#### วิธีที่ 1: ทดสอบผ่าน LLM Client โดยตรง

```bash
cd /home/naibarn/projects/SmartSpecPro

# Export environment variables
export SMARTSPEC_BACKEND_URL=http://localhost:8000
export SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026

# Run test
python -m ss_autopilot.llm_client
```

**ผลลัพธ์ที่คาดหวัง:**
```
✅ LLM Client initialized
   Backend URL: http://localhost:8000
   Model: anthropic/claude-3-5-sonnet-20241022
   Has token: True

🧪 Testing connection with simple message...
✅ Connection successful!
   Response: Hello from Kilo CLI
   Model: anthropic/claude-3-5-sonnet
   Usage: {'prompt_tokens': 10, 'completion_tokens': 8, 'total_tokens': 18}
```

#### วิธีที่ 2: ทดสอบผ่าน Kilo CLI

```bash
cd /home/naibarn/projects/SmartSpecPro

# Export environment variables
export SMARTSPEC_BACKEND_URL=http://localhost:8000
export SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026

# Run workflow with input
python -m ss_autopilot.cli_enhanced /test_hello.md "สวัสดีครับ"
```

**ผลลัพธ์ที่คาดหวัง:**
```
🔍 Executing workflow: test_hello

🚀 Executing workflow with LLM...
   - Workflow: test_hello
   - User input: สวัสดีครับ
   - Platform: kilo

🤖 Calling LLM with model: anthropic/claude-3-5-sonnet-20241022
📝 Workflow length: 52 characters
💬 User input: สวัสดีครับ...
✅ LLM responded with 156 characters

================================================================================
🤖 LLM Response:
================================================================================

สวัสดีครับ! ยินดีต้อนรับสู่ Kilo CLI

[LLM response content here...]

================================================================================

📊 Usage Statistics:
   - Prompt tokens: N/A
   - Completion tokens: N/A
   - Total tokens: 234

✅ Workflow executed successfully!
```

#### วิธีที่ 3: ทดสอบผ่าน Desktop App

1. เปิด Desktop App: http://localhost:1420
2. ไปที่หน้า "Kilo CLI (Compat)"
3. ใส่ Proxy Token: `dev-token-smartspec-2026`
4. ใส่ Workspace: `/home/naibarn/projects/SmartSpecPro`
5. กด "Refresh workflows"
6. พิมพ์คำสั่ง: `/test_hello สวัสดีครับ`
7. กด "Run"

---

## 🔍 Flow การทำงานของระบบ

```
Desktop App UI
    │
    ▼
Python Backend (/api/v1/kilo/run)
    │
    ▼
Job Manager (subprocess)
    │
    ▼
Kilo CLI (ss_autopilot.cli_enhanced)
    │
    ├─ Load workflow.md
    │
    ├─ Check user input
    │
    ▼
LLM Client (llm_client.py)
    │
    ▼
HTTP POST to Backend (/v1/chat/completions)
    │
    ├─ Check: USE_WEB_GATEWAY?
    │
    ├─ If FALSE → UnifiedLLMClient
    │   │
    │   ├─ Check: OPENROUTER_API_KEY?
    │   │   ├─ Yes → Use OpenRouter
    │   │   └─ No → Use other providers
    │   │
    │   ▼
    │   OpenRouter / OpenAI / Anthropic / etc.
    │
    └─ If TRUE → SmartSpecWeb Gateway
        │
        ▼
        Web Gateway → Forge API → LLM Provider
```

---

## ❌ Troubleshooting

### ปัญหา: "requests library not found"

**วิธีแก้:**
```bash
pip install requests
```

### ปัญหา: "Failed to connect to backend"

**สาเหตุ:** Backend ไม่ได้รัน

**วิธีแก้:**
```bash
cd python-backend
python -m uvicorn app.main:app --reload --port 8000
```

### ปัญหา: "Authentication Failed"

**สาเหตุ:** SMARTSPEC_PROXY_TOKEN ไม่ตรงกัน

**วิธีแก้:**
1. ตรวจสอบ `python-backend/.env`:
   ```bash
   SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026
   ```
2. ตรวจสอบ environment variable:
   ```bash
   echo $SMARTSPEC_PROXY_TOKEN
   ```
3. ต้องเป็นค่าเดียวกัน!

### ปัญหา: "Gateway Error: SMARTSPEC_WEB_GATEWAY_URL not configured"

**สาเหตุ:** USE_WEB_GATEWAY=true แต่ไม่มี URL

**วิธีแก้:**

ตัวเลือก A: ปิด Web Gateway (แนะนำ)
```bash
# ใน python-backend/.env
SMARTSPEC_USE_WEB_GATEWAY=false
```

ตัวเลือก B: Setup Web Gateway
```bash
# ใน python-backend/.env
SMARTSPEC_USE_WEB_GATEWAY=true
SMARTSPEC_WEB_GATEWAY_URL=http://localhost:3000/api/v1/llm/openai/chat/completions
SMARTSPEC_WEB_GATEWAY_TOKEN=your_token_here
```

### ปัญหา: "LLM call failed: No API key configured"

**สาเหตุ:** ไม่มี LLM provider API key

**วิธีแก้:**
1. ติดตาม "ขั้นที่ 2: Setup LLM Provider API Key" ด้านบน
2. Restart Backend:
   ```bash
   # Ctrl+C แล้วรันใหม่
   python -m uvicorn app.main:app --reload --port 8000
   ```

### ปัญหา: "Insufficient Credits"

**สาเหตุ:** ถ้าใช้ credit system และ credits หมด

**วิธีแก้:**
- สำหรับ Direct Proxy mode: ไม่ต้อง credit (FREE)
- สำหรับ Web Gateway mode: ต้อง top up credits

---

## 💡 Models ที่แนะนำ

### สำหรับ Code Generation:
- `anthropic/claude-3-5-sonnet-20241022` (Quality)
- `meta-llama/llama-3.1-70b-instruct` (Cost-effective)
- `google/gemini-flash-1.5` (Speed)

### สำหรับ Analysis:
- `openai/gpt-4o` (Quality)
- `anthropic/claude-3-5-sonnet` (Balanced)

### สำหรับ Simple Tasks:
- `openai/gpt-4o-mini` (Fast & cheap)
- `google/gemini-flash-1.5` (Speed)

**วิธีเปลี่ยน model:**
```bash
export SMARTSPEC_DEFAULT_MODEL=anthropic/claude-3-5-sonnet-20241022
```

หรือระบุใน workflow call:
```python
response = llm_client.chat(
    messages=[...],
    model="openai/gpt-4o"
)
```

---

## 📊 ตรวจสอบสถานะระบบ

### 1. ตรวจสอบ Backend
```bash
curl http://localhost:8000/health
```

### 2. ตรวจสอบ Proxy Token
```bash
curl -H "x-proxy-token: dev-token-smartspec-2026" \
     http://localhost:8000/api/v1/kilo/workflows
```

### 3. ตรวจสอบ LLM Endpoint
```bash
curl -X POST http://localhost:8000/v1/chat/completions \
     -H "x-proxy-token: dev-token-smartspec-2026" \
     -H "Content-Type: application/json" \
     -d '{
       "model": "anthropic/claude-3-5-sonnet-20241022",
       "messages": [{"role": "user", "content": "Say hello"}],
       "max_tokens": 50
     }'
```

---

## ✅ Checklist สำหรับการ Setup

- [ ] ติดตั้ง `requests` library
- [ ] Setup LLM Provider API key (OpenRouter/OpenAI/Anthropic)
- [ ] Config `python-backend/.env`
- [ ] Set environment variables สำหรับ Kilo CLI
- [ ] Start Python Backend
- [ ] ทดสอบ LLM Client
- [ ] ทดสอบ Kilo CLI
- [ ] ทดสอบผ่าน Desktop App (optional)

---

## 🎯 สรุป

หลังจาก setup เสร็จแล้ว คุณจะสามารถ:

1. ✅ ใช้ Kilo CLI เรียกใช้ workflows ผ่าน LLM
2. ✅ Desktop App ส่งคำสั่งให้ Kilo CLI → เรียก LLM
3. ✅ LLM ทำงานผ่าน Backend Proxy
4. ✅ Backend ส่งต่อไปยัง LLM Provider (OpenRouter/OpenAI/Anthropic)
5. ✅ รับผลลัพธ์กลับมาแสดงใน Desktop App

**ขั้นตอนการใช้งาน:**
```bash
# Export env vars
export SMARTSPEC_BACKEND_URL=http://localhost:8000
export SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026

# Run workflow
python -m ss_autopilot.cli_enhanced /workflow_name "your question here"
```

**หรือผ่าน Desktop App:**
1. เปิด http://localhost:1420
2. ไปหน้า "Kilo CLI"
3. พิมพ์: `/workflow_name your question here`
4. กด Run

---

**Created:** 2026-01-09
**Updated:** 2026-01-09
**Version:** 1.0.0
**Status:** ✅ Production Ready
