# spec.md — 003-smartspec-website (Hosting Control Plane + Gateways)

Spec ID: **SSP-WEB-003**  
Spec folder: `specs/feature/003-smartspec-website/`  
Code boundary (MUST): **พัฒนา/แก้ไขโค้ดต้องอยู่ในโฟลเดอร์ `SmartSpecWeb/` เท่านั้น**  
Last updated: 2026-01-04

---

## 1) Purpose
003-smartspec-website คือระบบบน hosting ที่เป็น “ศูนย์กลาง” ของ SmartSpec Platform โดยรวม:
1) **Website UX** (Marketing + pages + Gallery + Admin Gallery) — มีอยู่แล้ว  
2) **Auth** (cookie session สำหรับ web + bearer token สำหรับ desktop/runner) — cookie มีแล้ว / bearer ต้องเพิ่ม  
3) **Control Plane API + Postgres** (authoritative state) — ต้องเพิ่ม  
4) **Artifacts Gateway** (R2 presigned PUT/GET) — ต้องเพิ่ม  
5) **LLM Gateway (OpenAI-compatible) + Cost Accounting** — ต้องเพิ่ม (source of truth)  
6) **MCP Server/Gateway** (optional) — เพิ่มเมื่อพร้อม

> Desktop (004) และ Kilo CLI/Runner ต้องเรียกผ่าน 003 (API/MCP/LLM gateway) เท่านั้น  
> **ห้ามติดตั้ง Postgres/Auth/MCP/LLM gateway ใน local desktop**

---

## 2) Repository & Code Boundary (MUST)
- **Spec**: อยู่ใน `specs/feature/003-smartspec-website/`
- **Code**: แก้ไขได้เฉพาะ `SmartSpecWeb/`
- หากต้องแตะนอก `SmartSpecWeb/` → ต้องมี explicit approval + impact analysis

**CI Guard (Required):** PR ที่แตะไฟล์นอก `SmartSpecWeb/` ต้อง fail.

---

## 3) Current Implementation (Verified against SmartSpecWeb.zip)
> หมวดนี้คือ “สิ่งที่ทำงานแล้วจริง” เพื่อกันเอกสารหลุดจากโค้ด

### 3.1 Stack
- Client: Vite + React + wouter routes
- Server: Express + tRPC (`/api/trpc`) + OAuth callback (`/api/oauth/callback`)
- ORM: Drizzle + MySQL (`dialect: mysql`) ใช้ `DATABASE_URL`
- Body parser limits: JSON/URL-encoded **50mb** (รองรับ upload แบบ base64)

### 3.2 Client routes (existing)
- Public/marketing: `/`, `/pricing`, `/features`, `/docs`, `/contact`, `/blog`, `/terms`, `/privacy`
- Auth pages: `/login`, `/signup`, `/forgot-password`, `/verify-email`, `/auth/callback/:provider`
- App pages: `/dashboard`, `/profile`
- Gallery: `/gallery`
- Admin: `/admin/gallery`
- Not found: `/404`

### 3.3 Auth (existing)
- OAuth callback: `/api/oauth/callback?code=&state=`  
  - Exchange code → get user info (openId) → upsert user → issue session token → set cookie
- Session cookie: JWT (HS256) stored in cookie `COOKIE_NAME`
- tRPC auth procedures exist: `me`, `logout`
- Role model: `user|admin` (admin gate on admin routes)

**Observed security posture (as-is):**
- Cookie options currently set `sameSite: "none"` and `secure` depending on https / x-forwarded-proto.
- ไม่มี explicit CSRF strategy สำหรับ cookie-based endpoints
- ยังไม่พบ helmet/cors/rate-limit middleware

### 3.4 Gallery (existing)
- Public gallery list/detail + counters (views/likes/downloads)
- Admin gallery CRUD + publish/featured/sort
- Upload flow (existing): tRPC mutation uploads base64 to server → `storagePut()` → uses Forge storage proxy env (`BUILT_IN_FORGE_API_URL/KEY`)

### 3.5 System router (existing)
- `system.health` (public)
- `system.notifyOwner` (admin-only) ใช้ notification module

### 3.6 LLM usage (partial / legacy)
- มี `invokeLLM()` ฝั่ง server ที่เรียก Forge endpoint ด้วย `BUILT_IN_FORGE_API_URL/KEY`
- ฝั่ง client มี AIChatBox ที่อ้างถึง `trpc.ai.chat` แต่ **ยังไม่พบ router ฝั่ง server** → ถือเป็น “demo/unwired” และต้องตัดสินใจว่าจะ:
  - (A) implement `ai.chat` ให้ครบ, หรือ
  - (B) เอาออก/ซ่อนหลัง feature flag, หรือ
  - (C) เปลี่ยนให้เรียก LLM Gateway ใหม่ (Phase 3)

---

## 4) Target Architecture (SaaS Factory Alignment)
003 ทำหน้าที่: **State + Gatekeeping + Billing + Gateways** (ไม่ใช่ executor)

- Orchestration/Decision: LangGraph (remote)
- Execution: Kilo CLI (local runner)
- Evidence: `.spec/reports/` bundles + JSON summary
- Artifacts: R2 presigned PUT/GET
- State: Control Plane API + Postgres (authoritative)
- UX: Web + Desktop clients

Compatibility rule: MySQL/Drizzle สำหรับ Gallery ยังต้องอยู่ (ไม่ break) → Postgres/Control Plane เพิ่มเป็น subsystem ใหม่ก่อน (migrate ทีหลัง)

---

## 5) New Subsystems & Requirements (to be implemented)

### 5.1 Bearer Tokens for Desktop/Runner (Additive)
- Issue short-lived JWT (scoped) for:
  - `aud`: `desktop|runner|mcp|llm`
  - `sub`: userId/openId
  - optional scope: project/session
  - `exp`: 15–60 นาที + optional refresh
- Strict server-side validation + role/entitlement enforcement
- Web cookie session remains unchanged

### 5.2 Control Plane API + Postgres (Authoritative)
- Entities: Project, Session, Iteration, TaskRegistry(dedupe_key), Report(gates/status/bundle_key)
- Versioned endpoints (REST `/api/v1/...` หรือ versioned tRPC router)
- Audit logs: create/update/approve/apply
- Runner never talks DB directly (API only)

### 5.3 R2 Presigned URLs (Artifacts/Reports)
- presign PUT: runner only
- presign GET: web/desktop
- key prefix enforcement + TTL + size limit
- artifact metadata in Postgres

### 5.4 LLM Gateway (OpenAI-compatible) + Cost Accounting (REQUIRED)
- OpenAI-compatible surface (minimum): `/v1/chat/completions`
- Provider routing (keys server-side only)
- Rate limit, schema/size validation, abuse prevention
- Persist usage/cost per user/project/session/iteration
- Return usage/cost metadata to client

### 5.5 MCP Server/Gateway (Optional)
- Tool allowlist + audit logs
- Auth reuse (bearer token)
- Desktop/runner call MCP remotely only

---

## 6) Security Requirements (003) — Must be explicit
### 6.1 Production middleware baseline
- `helmet` (+ CSP/HSTS appropriate)
- Request size limits (keep 50mb only where needed; tighten by route)
- Rate limits: auth, presign, llm, admin mutations
- CORS policy (explicit allowlist)
- Structured logging + redaction (tokens/keys)
- Error handling: no stack traces in production responses

### 6.2 Cookie + CSRF
- Define explicit cookie policy:
  - prod: `secure=true`, `httpOnly=true`, `sameSite` chosen intentionally
- CSRF strategy for cookie-based endpoints:
  - Either sameSite+origin checks OR CSRF tokens for state-changing routes

### 6.3 Secret management
- Env validation (fail fast)
- Min-length/entropy for JWT secret
- Key rotation plan (documented)

---

## 7) Known Gaps vs Code (as of 2026-01-04)
These are **not implemented yet** but required by the platform direction:
- Postgres Control Plane + versioned API
- R2 presigned PUT/GET endpoints (AWS SDK deps exist, code not implemented)
- OpenAI-compatible LLM gateway + cost accounting
- Security middleware baseline (helmet/cors/rate limit)
And these are **implemented but not fully productized**:
- AIChatBox references `trpc.ai.chat` but server router missing (demo/unwired)

---

## 8) Definition of Done
1) Existing site unchanged: marketing pages + gallery + admin gallery + cookie auth
2) CI guard enforces changes only in `SmartSpecWeb/`
3) Control Plane + Postgres API works and is versioned
4) R2 presigned service works with strict prefix/TTL/size
5) LLM gateway (OpenAI-compatible) + usage/cost accounting works end-to-end
6) Security baseline enabled in production + tests for permissions/rate/token scopes
