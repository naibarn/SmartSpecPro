# plan.md — 003-smartspec-website

Plan ID: **SSP-WEB-003-PLAN**  
Linked Spec: **SSP-WEB-003**  
Code boundary (MUST): changes only in `SmartSpecWeb/`  
Last updated: 2026-01-04

## Strategy
- Freeze & protect current site features first (non-breaking)
- Add platform subsystems additively (Control Plane/Postgres, R2, LLM gateway, bearer tokens)
- Publish contracts early so Desktop/Runner integrate without guesswork

---

## Phase 0 — Baseline stability + Security guardrails
- Add CI path-guard for `SmartSpecWeb/`
- Add env validation (required vars, min secret length)
- Add production security middleware baseline (helmet, size limits, rate limit)
- Confirm admin guards and auth pages behavior

Deliverable: “เว็บเดิมไม่พัง + ปลอดภัยพื้นฐาน”

---

## Phase 1 — Auth expansion for Desktop/Runner (Bearer tokens)
- Add token issuance endpoint for desktop/runner
- Add token validation middleware + scopes/roles
- Document CSRF policy for cookie endpoints (and implement if needed)

Deliverable: shared auth usable by desktop/runner without changing web cookie sessions

---

## Phase 2 — Control Plane API + Postgres foundation
- Add Postgres connection + migration tooling (keep MySQL for gallery)
- Implement versioned endpoints for Project/Session/Iteration/TaskRegistry/Report
- Add audit logs for mutations

Deliverable: authoritative state surface (API-first)

---

## Phase 3 — R2 Presigned Artifacts/Reports
- Implement presign PUT/GET endpoints + strict key prefix policy
- Store artifact metadata in Postgres + retention policy

Deliverable: runner uploads bundles, UI/desktop download bundles

---

## Phase 4 — LLM Gateway (OpenAI-compatible) + Costing (REQUIRED)
- Implement `/v1/chat/completions` compatible gateway
- Provider routing + policy enforcement + rate limiting
- Usage extraction + pricing table + persist cost
- Return usage/cost metadata to clients

Deliverable: Kilo proxy can call LLM via website and billing is authoritative

---

## Phase 5 — MCP Gateway (optional)
- Expose selected tools behind auth (allowlist)
- Audit logs + contract tests

Deliverable: unified tool gateway

---

## Phase 6 — LangGraph integration
- LangGraph uses Control Plane API only (no DB direct)
- Persist gates/DoD status in iteration/report so UI/desktop can read

Deliverable: observable orchestration loop
