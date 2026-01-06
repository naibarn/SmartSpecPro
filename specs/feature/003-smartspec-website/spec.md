# spec.md — 003-smartspec-website (SmartSpecWeb)

Spec ID: **SSP-WEB-003**  
Spec folder: `specs/feature/003-smartspec-website/`  
Code boundary: **`SmartSpecWeb/` (ทั้งหมดของเว็บแอป)**  
Last updated: 2026-01-06

---

## 1) Purpose
**SmartSpecWeb** คือเว็บแอปหลักของแพลตฟอร์ม (Website + Web App) ที่รวมทั้ง:
- **Client (React/Vite)** สำหรับหน้าใช้งานและหน้าแอดมิน
- **Web Server (Node/Express)** สำหรับเสิร์ฟเว็บ + API (tRPC) + OAuth routes
- **Gateway endpoints (OpenAI-compatible)** สำหรับให้ LLM proxy เรียกใช้งานผ่านเว็บ
- **MCP server endpoints** (tool allowlist + audit) เพื่อให้ proxy เรียก tool ผ่านเว็บอย่างปลอดภัย
- **Shared code** (types/const) ใช้ร่วม client/server
- **DB schema & migrations** (Drizzle)

> หมายเหตุ: SmartSpecWeb เป็น **full‑stack Node** (ไม่ใช่ “frontend-only”).

---

## 2) Code locations
- Root: `SmartSpecWeb/`
- Client: `SmartSpecWeb/client/`
- Server runtime entry: `SmartSpecWeb/server/_core/index.ts`
- Server routers (tRPC): `SmartSpecWeb/server/routers.ts`
- Gateway routes: `SmartSpecWeb/server/_core/llmRoutes.ts`
- MCP routes: `SmartSpecWeb/server/_core/mcpRoutes.ts`
- Shared: `SmartSpecWeb/shared/`
- DB (Drizzle): `SmartSpecWeb/drizzle/`

Scripts ที่เกี่ยวข้อง:
- `pnpm dev` → `tsx watch server/_core/index.ts`
- `pnpm build` → `vite build` + `esbuild ... -> dist`
- `pnpm start` → `node dist/index.js`

---

## 3) Public interface (runtime)

### 3.1 Web + tRPC
- Web server default port: `PORT` (default 3000)
- API: tRPC ที่ `"/api/trpc"`

### 3.2 OAuth
- OAuth callback routes ภายใต้ `"/api/oauth/*"`

### 3.3 OpenAI-compatible Gateway (LLM)
- `POST /v1/chat/completions` (รองรับ `stream: true` แบบ SSE passthrough)
- `GET /v1/models` (ขั้นต่ำสำหรับ OpenAI-compatible clients)
- UI wrappers:
  - `POST /api/llm/chat`
  - `POST /api/llm/stream`

**Auth**: รองรับทั้ง
- cookie session (browser/UI)
- bearer token สำหรับ non-browser callers (LLM proxy)

ENV ที่เกี่ยวข้อง:
- `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY` (upstream LLM proxy)
- `SMARTSPEC_WEB_GATEWAY_TOKEN` (bearer token)

### 3.4 MCP Server (tools)
- `GET /api/mcp/tools` / `POST /api/mcp/call`
- alias: `GET /mcp/tools` / `POST /mcp/call`

Tools ที่ expose (allowlist):
- `artifact_get_url`
- `workspace_read_file`
- `workspace_write_file` (optional write-token)

ENV ที่เกี่ยวข้อง:
- `SMARTSPEC_MCP_TOKEN` (bearer token)
- `WORKSPACE_ROOT`, `MCP_EXT_ALLOWLIST`, `MCP_MAX_READ_BYTES`, `MCP_MAX_WRITE_BYTES`
- `MCP_REQUIRE_WRITE_TOKEN`, `MCP_WRITE_TOKEN`

Audit log:
- `logs/mcp_audit.log` (JSONL)

---

## 4) UI routes ที่สำคัญ
- `/chat` — หน้า Chat (streaming + insert image/video)
  - รูปส่งให้ LLM ด้วย OpenAI-compatible `image_url`
  - วิดีโอ: upload แล้วส่ง URL ในข้อความ (ยังไม่ส่ง video input แบบ native)

---

## 5) Relationships to other specs (ทำให้ไม่สับสน)
**003 เป็นเว็บแอปแบบ self-contained** และมี server ของตัวเอง

### 003 ↔ 007 (python-backend-service)
- 003 ไม่ได้เป็น dependency โดยตรงของ 007
- 007/LLM proxy สามารถเรียก 003 ผ่าน `/v1/chat/completions` และ `/mcp/*` ได้ (OpenAI-compatible + MCP)

### 003 ↔ 006 (docker deploy)
- 006 เป็นวิธี run/deploy สำหรับ SmartSpecWeb (รวม env สำหรับ gateway/mcp ตาม `.env.example`)

### 003 ↔ 004 (desktop-app)
- Desktop สามารถ embed/เปิดหน้าเว็บ `/chat` หรือเรียก gateway ผ่าน proxy ตามสถาปัตยกรรม

---

## 6) Definition of Done
- โค้ดของเว็บทั้งหมดอยู่ใน `SmartSpecWeb/`
- เส้นทาง API หลักของเว็บคือ `tRPC (/api/trpc)`
- มี gateway OpenAI-compatible (`/v1/chat/completions`) และ MCP (`/mcp/*`)
- เอกสารความสัมพันธ์ (ข้อ 5) ชัดเจน และสอดคล้องกับโค้ดใน repo
