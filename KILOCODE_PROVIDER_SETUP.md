# 🚀 Kilo Code Provider Integration

คู่มือการเพิ่มและใช้งาน Kilo Code เป็น LLM Provider ใน SmartSpec Pro

---

## 📋 สิ่งที่ได้เพิ่มเข้ามา

### 1. **Kilo Code Provider Module**
📁 `python-backend/app/llm_proxy/providers/kilocode_provider.py`

**ฟีเจอร์:**
- ✅ OpenAI-compatible interface
- ✅ Support multiple models (OpenRouter format)
- ✅ Chat completions API
- ✅ Model listing
- ✅ Connection testing
- ✅ Cost estimation

**Models รองรับ:**
- `minimax/minimax-m2.1:free` - ฟรี
- `anthropic/claude-3-5-sonnet` - คุณภาพสูง
- `openai/gpt-4o` - OpenAI flagship
- `openai/gpt-4o-mini` - ราคาถูก
- `google/gemini-flash-1.5` - เร็ว
- `meta-llama/llama-3.1-70b-instruct` - Cost-effective

### 2. **Provider Factory Integration**
📁 `python-backend/app/llm_proxy/providers/factory.py`

เพิ่ม `create_kilocode_provider()` ที่:
- อ่าน `KILOCODE_API_KEY` จาก config
- สร้าง KiloCodeProvider instance
- ตั้งค่า default models และ pricing

### 3. **Configuration Support**
📁 `python-backend/app/core/config.py`

เพิ่ม settings:
```python
KILOCODE_API_KEY: str = ""
KILOCODE_BASE_URL: str = "https://api.kilo.ai/api/openrouter"
```

📁 `python-backend/.env`

```bash
# Option 4: Kilo Code (OpenRouter-compatible)
KILOCODE_API_KEY=
KILOCODE_BASE_URL=https://api.kilo.ai/api/openrouter
```

### 4. **Admin UI Integration**
📁 `desktop-app/src/pages/AdminSettings.tsx`

เพิ่ม provider template:
```typescript
{
  provider_name: "kilocode",
  display_name: "Kilo Code",
  base_url: "https://api.kilo.ai/api/openrouter",
  description: "Access multiple LLM models through Kilo Code API (OpenRouter-compatible)",
}
```

### 5. **Database Migration**
📁 `python-backend/migrations/create_provider_configs_table.sql`

เพิ่ม default provider record:
```sql
INSERT INTO provider_configs (...)
VALUES (
    ...
    'kilocode',
    'Kilo Code',
    'https://api.kilo.ai/api/openrouter',
    FALSE,
    'Access multiple LLM models through Kilo Code API (OpenRouter-compatible)'
)
```

---

## 🔧 ขั้นตอนการ Setup

### ขั้นที่ 1: รับ Kilo Code API Key

1. ไปที่: https://kilo.ai
2. สมัครสมาชิกหรือ login
3. ไปที่ Settings → API Keys
4. สร้าง API key ใหม่
5. คัดลอก API key

**หมายเหตุ:** Kilo Code API key มักจะมีรูปแบบ:
- Production: `kilo_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
- Development: JWT token format

### ขั้นที่ 2: Config ใน Python Backend

แก้ไข `python-backend/.env`:

```bash
# Kilo Code API
KILOCODE_API_KEY=kilo_your_api_key_here
KILOCODE_BASE_URL=https://api.kilo.ai/api/openrouter
```

**สำหรับ Development/Local:**
```bash
# ถ้าใช้ local Kilo Code server
KILOCODE_BASE_URL=http://localhost:3000/api/openrouter
```

### ขั้นที่ 3: Restart Backend

```bash
cd python-backend
python -m uvicorn app.main:app --reload --port 8000
```

### ขั้นที่ 4: Config ผ่าน Admin UI (Optional)

1. เปิด Desktop App: http://localhost:1420
2. Login เป็น admin user
3. ไปที่ `/admin/settings`
4. เลือก "Kilo Code" template
5. กรอก:
   - **Display Name**: `Kilo Code`
   - **API Key**: `kilo_your_api_key_here`
   - **Base URL**: `https://api.kilo.ai/api/openrouter`
   - **Description**: (optional)
6. เช็ค "Enable this provider"
7. กด "Save"

---

## 🧪 ทดสอบการทำงาน

### ทดสอบผ่าน Python

```python
import asyncio
from app.llm_proxy.providers.kilocode_provider import create_kilocode_provider

async def test_kilocode():
    # Create provider
    provider = create_kilocode_provider(
        api_key="kilo_your_api_key_here",
        base_url="https://api.kilo.ai/api/openrouter"
    )

    # Test connection
    is_connected = await provider.test_connection()
    print(f"Connection: {'✅ Success' if is_connected else '❌ Failed'}")

    # List models
    models = await provider.list_models()
    print(f"Available models: {len(models)}")

    # Chat completion
    response = await provider.chat_completion(
        messages=[
            {"role": "user", "content": "สวัสดีครับ"}
        ],
        model="minimax/minimax-m2.1:free"
    )

    print(f"Response: {response['choices'][0]['message']['content']}")

# Run test
asyncio.run(test_kilocode())
```

### ทดสอบผ่าน cURL

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "x-proxy-token: dev-token-smartspec-2026" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax/minimax-m2.1:free",
    "messages": [
      {"role": "user", "content": "Hello from Kilo Code!"}
    ],
    "max_tokens": 100
  }'
```

### ทดสอบผ่าน Kilo CLI

```bash
export SMARTSPEC_BACKEND_URL=http://localhost:8000
export SMARTSPEC_PROXY_TOKEN=dev-token-smartspec-2026
export SMARTSPEC_DEFAULT_MODEL=minimax/minimax-m2.1:free

python -m ss_autopilot.cli_enhanced /test_hello.md "ทดสอบ Kilo Code provider"
```

---

## 🎯 การใช้งาน

### 1. ใช้ผ่าน Unified Client

```python
from app.llm_proxy.unified_client import get_unified_client

client = get_unified_client()
await client.initialize()

response = await client.chat(
    messages=[{"role": "user", "content": "Hello"}],
    model="minimax/minimax-m2.1:free",
    use_openrouter=False  # ใช้ Kilo Code แทน OpenRouter
)

print(response.content)
```

### 2. ใช้ผ่าน Direct Proxy

```python
from app.llm_proxy.providers.factory import create_providers_from_settings

providers = create_providers_from_settings()
kilocode = providers.get("kilocode")

if kilocode:
    response = await kilocode.chat_completion(
        messages=[{"role": "user", "content": "Hello"}],
        model="minimax/minimax-m2.1:free"
    )
```

### 3. ใช้ผ่าน Desktop App

1. เปิด Desktop App
2. ไปหน้า "Kilo CLI"
3. พิมพ์: `/test_hello.md ทดสอบ Kilo Code`
4. กด Run
5. ระบบจะใช้ Kilo Code provider อัตโนมัติ (ถ้า config ไว้)

---

## 📊 Models และราคา

| Model | Type | Cost/1K tokens | Speed | Quality |
|-------|------|----------------|-------|---------|
| minimax/minimax-m2.1:free | Free | $0 | Fast | Good |
| anthropic/claude-3-5-sonnet | Paid | $0.003 | Medium | Excellent |
| openai/gpt-4o | Paid | $0.005 | Medium | Excellent |
| openai/gpt-4o-mini | Paid | $0.0002 | Fast | Good |
| google/gemini-flash-1.5 | Paid | $0.00008 | Very Fast | Good |
| meta-llama/llama-3.1-70b | Paid | $0.0005 | Fast | Very Good |

**หมายเหตุ:** ราคาเป็นการประมาณตาม OpenRouter pricing

---

## 🔍 API Endpoints

Kilo Code Provider ใช้ endpoints ต่อไปนี้:

### Chat Completions
```
POST https://api.kilo.ai/api/openrouter/chat/completions
```

**Headers:**
```
Authorization: Bearer <KILOCODE_API_KEY>
Content-Type: application/json
```

**Body:**
```json
{
  "model": "minimax/minimax-m2.1:free",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "temperature": 0.7,
  "max_tokens": 4000,
  "stream": false
}
```

### List Models
```
GET https://api.kilo.ai/api/openrouter/models
```

### Model Endpoints
```
GET https://api.kilo.ai/api/openrouter/models/{modelId}/endpoints
```

---

## ❌ Troubleshooting

### ปัญหา: "KILOCODE_API_KEY not configured"

**วิธีแก้:**
1. ตรวจสอบ `python-backend/.env`:
   ```bash
   KILOCODE_API_KEY=kilo_your_key_here
   ```
2. Restart backend

### ปัญหา: "Failed to connect to Kilo Code API"

**สาเหตุที่เป็นไปได้:**
- API key ไม่ถูกต้อง
- Network issue
- Kilo Code API down

**วิธีแก้:**
1. ตรวจสอบ API key
2. ทดสอบ connection:
   ```bash
   curl -H "Authorization: Bearer $KILOCODE_API_KEY" \
        https://api.kilo.ai/api/openrouter/models
   ```

### ปัญหา: "Model not found"

**วิธีแก้:**
1. ดูรายการ models ที่มี:
   ```python
   models = await provider.list_models()
   for model in models:
       print(model['id'])
   ```
2. ใช้ model name ที่ถูกต้อง

### ปัญหา: "Rate limit exceeded"

**วิธีแก้:**
- รอสักครู่แล้วลองใหม่
- หรือใช้ free model: `minimax/minimax-m2.1:free`

---

## 🎯 Best Practices

### 1. ใช้ Free Model สำหรับทดสอบ
```python
model="minimax/minimax-m2.1:free"
```

### 2. เลือก Model ตามงาน
- **Code Generation**: `anthropic/claude-3-5-sonnet`
- **Analysis**: `openai/gpt-4o`
- **Simple Tasks**: `openai/gpt-4o-mini`
- **Speed**: `google/gemini-flash-1.5`

### 3. ใช้ Cost Estimation
```python
cost = provider.estimate_cost(
    prompt_tokens=100,
    completion_tokens=200,
    model="anthropic/claude-3-5-sonnet"
)
print(f"Estimated cost: ${cost:.4f}")
```

### 4. Handle Errors
```python
try:
    response = await provider.chat_completion(...)
except httpx.HTTPError as e:
    print(f"API error: {e}")
    # Fallback to another provider
```

---

## 📚 เอกสารเพิ่มเติม

- [Kilo Code Official Docs](https://kilo.ai/docs)
- [OpenRouter API Docs](https://openrouter.ai/docs)
- [SmartSpec LLM Proxy Architecture](./KILO_LLM_SETUP.md)

---

## ✅ Checklist

- [ ] รับ Kilo Code API key
- [ ] Config `KILOCODE_API_KEY` ใน `.env`
- [ ] Restart Python Backend
- [ ] ทดสอบ connection
- [ ] ทดสอบ chat completion
- [ ] Config ใน Admin UI (optional)
- [ ] ทดสอบผ่าน Kilo CLI

---

**Created:** 2026-01-09
**Updated:** 2026-01-09
**Version:** 1.0.0
**Status:** ✅ Production Ready
