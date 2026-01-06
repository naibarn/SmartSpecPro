# spec.md — 007-python-backend-service (LLM Proxy)

Spec ID: **SSP-PY-007**  
Spec folder: `specs/feature/007-python-backend-service/`  
Code boundary: `python-backend/`  
Last updated: 2026-01-06

---

## Purpose
Python backend ทำหน้าที่เป็น **LLM proxy** และ **orchestration backend** ของระบบ โดยเพิ่มโหมดสำหรับ:
- เปิด **OpenAI-compatible endpoint**: `POST /v1/chat/completions` และ `GET /v1/models`
- เมื่อเปิดโหมด `SMARTSPEC_USE_WEB_GATEWAY=1` จะ **forward ไปยัง SmartSpecWeb** (Spec003) เพื่อรวม policy/auth/audit/logs

---

## Public interface (OpenAI-compatible)
- `POST /v1/chat/completions`
  - รองรับ `stream: true` (SSE passthrough)
  - รองรับ Multi‑modal payload ตาม OpenAI schema (เช่น `image_url`) เนื่องจากเป็นการส่งต่อ
- `GET /v1/models`

Optional protection:
- ถ้าตั้ง `SMARTSPEC_PROXY_TOKEN` → ต้องส่ง `Authorization: Bearer <token>` หรือ `x-proxy-token`

---

## Upstream routing (สำคัญ: ทำให้สอดคล้องทั้งระบบ)
- Forward to SmartSpecWeb:
  - `POST {SMARTSPEC_WEB_GATEWAY_URL}/v1/chat/completions`
  - `GET {SMARTSPEC_WEB_GATEWAY_URL}/v1/models`
- MCP tools ผ่าน SmartSpecWeb:
  - `GET {SMARTSPEC_MCP_BASE_URL}/mcp/tools`
  - `POST {SMARTSPEC_MCP_BASE_URL}/mcp/call`

Headers:
- ส่ง `Authorization: Bearer <SMARTSPEC_WEB_GATEWAY_TOKEN>`
- propagate `x-trace-id` เพื่อให้ audit/usage correlation ทำงาน end‑to‑end

---

## Required ENV
- `SMARTSPEC_USE_WEB_GATEWAY=1`
- `SMARTSPEC_WEB_GATEWAY_URL=http(s)://<SmartSpecWeb>`
- `SMARTSPEC_WEB_GATEWAY_TOKEN=...`
- `SMARTSPEC_MCP_BASE_URL=...` (optional; default = WEB_GATEWAY_URL)
- `SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS=600`
- `SMARTSPEC_WEB_GATEWAY_RETRIES=2`

---

## Relationship
- 007 depends on 003 at runtime (HTTP): ใช้ 003 เป็น gateway + MCP server
- 003 ไม่ได้ import โค้ดของ 007 (ไม่มี dependency แบบ code)
