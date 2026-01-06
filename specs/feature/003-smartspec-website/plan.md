# plan.md — 003-smartspec-website

Plan ID: **SSP-WEB-003-PLAN**  
Linked Spec: **SSP-WEB-003**  
Code boundary (MUST): changes only in `SmartSpecWeb/`  
Last updated: 2026-01-06

## Strategy
- Freeze & protect current site features first (non-breaking)
- Add platform subsystems additively (Control Plane/Postgres, R2, LLM gateway, bearer tokens)
- Publish contracts early so Desktop/Runner integrate without guesswork

---

## Phase 0 — Baseline stability + Security guardrails (DONE)
- ✅ Basic security headers + disable x-powered-by
- ✅ LLM/MCP rate limiting (in-memory)
- ✅ LLM max body size + MCP size limits
- ✅ MCP audit log (JSONL)

Deliverable: “เว็บไม่พัง + ปลอดภัยพื้นฐาน” + “gateway/mcp ใช้งานจริง”

---

## Phase 1 — OpenAI-compatible LLM Gateway (DONE)
- ✅ `/v1/chat/completions` (SSE passthrough)
- ✅ `/v1/models` minimal
- ✅ UI wrappers `/api/llm/chat`, `/api/llm/stream`

---

## Phase 2 — MCP server (DONE)
- ✅ `/api/mcp/*` + `/mcp/*`
- ✅ tool allowlist + workspace guard + optional write token
- ✅ unit tests for auth + traversal blocking

---

## Phase 3 — Token issuance + scope (NEXT)
- Add bearer token issuance (short-lived JWT) + scopes (read/write/tools)
- Align with control-plane policy model (approval/write gates)

---

## Phase 4 — Cost accounting (NEXT)
- Extract usage + cost (persist) + budgets/quotas

---

## Phase 5 — Postgres Control Plane (NEXT)
- Add DB + schema + versioned endpoints
