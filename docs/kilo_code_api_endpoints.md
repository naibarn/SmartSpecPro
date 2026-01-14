# Kilo Code: API Endpoint ที่ถูกเรียกจริง (ตรวจจากโค้ดใน repo)

เอกสารนี้สรุปว่าเวลา “เรียกใช้ LLM ผ่าน Kilo Code server” ตัวแอป/ส่วนขยายยิงไปที่ URL ไหนบ้าง โดยอ้างอิงจากไฟล์ใน repo ที่เป็นโอเพนซอร์ส (จาก zip ที่คุณอัปโหลด)

---

## 1) Base URL ที่โค้ดใช้

ใน `src/api/providers/kilocode-openrouter.ts` มีการตั้งค่า base สำหรับ API จากฟังก์ชัน `getKiloUrlFromToken("https://api.kilo.ai/api/", token)` แล้วนำไปประกอบเป็น:

- `openRouterBaseUrl = ${baseApiUrl}openrouter/`
- `apiFIMBase = baseApiUrl`

ดังนั้น **ค่า base ที่เป็น production ปกติจะอยู่บน `https://api.kilo.ai`** และ path หลักมักเริ่มด้วย `/api/...`

### การสลับเป็น dev/local
ใน `packages/types/src/kilocode/kilocode.ts` ฟังก์ชัน `getKiloBaseUriFromToken()` ระบุว่า:

- ถ้า token มี payload `env === "development"` และมี `KILOCODE_BACKEND_BASE_URL` → ใช้ค่านั้นเป็น base
- ถ้าเป็น dev token แต่ไม่ได้ตั้งค่า → ใช้ `http://localhost:3000`
- กรณีปกติ → ใช้ `https://api.kilo.ai`

---

## 2) Endpoint สำหรับ “เรียก LLM ผ่าน Kilo Code server”

### 2.1 Chat Completions (เส้นหลัก)
Kilo Code ตั้งค่าให้ OpenRouter handler ใช้ base เป็น `${baseApiUrl}openrouter/` (ใน `src/api/providers/kilocode-openrouter.ts`) และยิง endpoint แบบ **OpenAI-compatible Chat Completions**

✅ **Endpoint ที่จะถูกเรียกจริง**

- **POST** `https://api.kilo.ai/api/openrouter/chat/completions`

> ในโหมด dev/local อาจกลายเป็น:
> - `http://localhost:3000/api/openrouter/chat/completions`
> - หรือ `<KILOCODE_BACKEND_BASE_URL>/api/openrouter/chat/completions`

### 2.2 Models (ดึงรายชื่อโมเดล)
ใน `src/api/providers/fetchers/openrouter.ts` มีการเรียก `${baseURL}/models` โดย `baseURL` มาจาก `openRouterBaseUrl`

- **GET** `https://api.kilo.ai/api/openrouter/models`

### 2.3 Model Endpoints (ดึง provider endpoints ของโมเดล)
ใน `src/api/providers/fetchers/openrouter.ts` มีการเรียก:

- **GET** `https://api.kilo.ai/api/openrouter/models/{modelId}/endpoints`

---

## 3) Endpoint ที่เกี่ยวข้องกับ Kilo โดยตรง (ไม่ใช่ chat แต่เกี่ยวกับค่าเริ่มต้น)

### 3.1 Default model
ใน `src/api/providers/kilocode/getKilocodeDefaultModel.ts`:

- **GET** `https://api.kilo.ai/api/defaults`
- **GET** `https://api.kilo.ai/api/organizations/{orgId}/defaults`

### 3.2 FIM / Autocomplete (เติมโค้ดกลางบรรทัด)
ใน `src/api/providers/kilocode-openrouter.ts` สร้าง URL ด้วย `new URL("fim/completions", this.apiFIMBase)`

- **POST** `https://api.kilo.ai/api/fim/completions`

---

## 4) Auth / Headers ตามที่โค้ดส่ง

- สำหรับเส้นทาง OpenRouter (chat/models/endpoints): ใช้ `openRouterApiKey = kilocodeToken` → ปกติจะกลายเป็น `Authorization: Bearer <TOKEN>` ผ่าน SDK
- สำหรับ FIM (`/api/fim/completions`) โค้ดใส่ทั้ง:
  - `Authorization: Bearer <TOKEN>`
  - `x-api-key: <TOKEN>`

และมี header เพิ่มเติมหนึ่งชุดจาก `customRequestOptions()` (เช่นระบุ editor/task/org เมื่อมี metadata)

---

## 5) ตัวอย่างการเรียกใช้งานแบบสมบูรณ์ (กำหนด model ตามใน UI)

จากตัวอย่างในภาพ (หน้า Settings) ค่า **Model** เป็น:

- `minimax/minimax-m2.1:free`

> หมายเหตุ: รูปแบบ model นี้เป็นสไตล์ OpenRouter (เช่น `provider/model:variant`) และถูกส่งไปใน field `model` ของ request body

### 5.1 cURL (ไม่ stream)

```bash
curl -sS https://api.kilo.ai/api/openrouter/chat/completions \
  -H "Authorization: Bearer $KILOCODE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax/minimax-m2.1:free",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "ช่วยสรุปข้อดีข้อเสียของ TypeScript แบบสั้น ๆ"}
    ],
    "temperature": 0.7,
    "max_tokens": 400,
    "stream": false
  }'
```

### 5.2 cURL (stream แบบ SSE)

```bash
curl -N https://api.kilo.ai/api/openrouter/chat/completions \
  -H "Authorization: Bearer $KILOCODE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "minimax/minimax-m2.1:free",
    "messages": [
      {"role": "user", "content": "เขียน TODO list สำหรับอ่านหนังสือสอบ 7 วัน"}
    ],
    "stream": true
  }'
```

> ถ้าเป็น SSE ปกติคุณจะเห็นบรรทัดที่ขึ้นต้นด้วย `data: ...` ไหลมาเรื่อย ๆ จนจบด้วย event ที่บอกว่าจบการสตรีม

### 5.3 Python (requests)

```python
import os
import requests

KILOCODE_API_KEY = os.environ["KILOCODE_API_KEY"]

url = "https://api.kilo.ai/api/openrouter/chat/completions"
headers = {
    "Authorization": f"Bearer {KILOCODE_API_KEY}",
    "Content-Type": "application/json",
}

payload = {
    "model": "minimax/minimax-m2.1:free",
    "messages": [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "ยกตัวอย่าง regex สำหรับ validate อีเมล แบบง่าย ๆ"},
    ],
    "temperature": 0.2,
    "max_tokens": 300,
    "stream": False,
}

resp = requests.post(url, headers=headers, json=payload, timeout=60)
resp.raise_for_status()

data = resp.json()
# โครงสร้างคำตอบจะคล้าย OpenAI Chat Completions
print(data["choices"][0]["message"]["content"])
```

### 5.4 Node.js (fetch)

```js
const url = "https://api.kilo.ai/api/openrouter/chat/completions";

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.KILOCODE_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "minimax/minimax-m2.1:free",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "ช่วยเขียนตัวอย่าง JSON schema สั้น ๆ" },
    ],
    temperature: 0.6,
    max_tokens: 300,
    stream: false,
  }),
});

if (!res.ok) {
  throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

const data = await res.json();
console.log(data.choices?.[0]?.message?.content);
```

---

## 6) สรุปสุดท้าย (คำตอบตรงคำถาม)
ถ้าจะ **เรียกใช้ LLM ผ่าน Kilo Code server** ตามที่โค้ดทำจริง ๆ ให้ยิงไปที่:

- **POST** `https://api.kilo.ai/api/openrouter/chat/completions`

และกำหนดโมเดลใน body เช่น:

- `"model": "minimax/minimax-m2.1:free"`

พร้อมแนบ token ตามที่โค้ดใช้ (โดยทั่วไปคือ `Authorization: Bearer <KILOCODE_API_KEY>`)

---

### เช็กลิสต์เร็ว ๆ
- ใช้ production: `https://api.kilo.ai/api/openrouter/chat/completions`
- ใช้ dev token + local backend: `http://localhost:3000/api/openrouter/chat/completions`
- ใช้ dev token + backend custom: `<KILOCODE_BACKEND_BASE_URL>/api/openrouter/chat/completions`

