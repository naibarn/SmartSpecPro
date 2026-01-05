# tasks.md — 003-smartspec-website

Tasks ID: **SSP-WEB-003-TASKS**  
Linked Spec: **SSP-WEB-003**  
Code boundary (MUST): changes only in `SmartSpecWeb/`  
Last updated: 2026-01-04

P0 = required for integration, P1 = important, P2 = nice-to-have

---

## A) Guardrails & Baseline Security (P0)
- ⬜ **SSP-WEB-003-TASK-001 [P0]**: CI path-guard: fail if PR touches files outside `SmartSpecWeb/`
- ⬜ **SSP-WEB-003-TASK-002 [P0]**: Env validation module (required vars; min secret length; no empty JWT secret)
- ⬜ **SSP-WEB-003-TASK-003 [P0]**: Add `helmet` + safe defaults (CSP/HSTS as appropriate)
- ⬜ **SSP-WEB-003-TASK-004 [P0]**: Add request size limits per route (tight default; keep 50mb only for upload endpoints)
- ⬜ **SSP-WEB-003-TASK-005 [P0]**: Add rate limiting (auth endpoints, presign endpoints, LLM endpoints, admin mutations)
- ⬜ **SSP-WEB-003-TASK-006 [P0]**: Structured logging + redaction (cookie/JWT/bearer/api keys)

## B) Auth expansion (Bearer tokens) (P0)
- ⬜ **SSP-WEB-003-TASK-007 [P0]**: Bearer token issuance endpoint for desktop/runner (short-lived, scoped)
- ⬜ **SSP-WEB-003-TASK-008 [P0]**: Token validation middleware + scope checks (aud, exp, role, optional project/session scope)
- ⬜ **SSP-WEB-003-TASK-009 [P1]**: Define CSRF strategy for cookie endpoints + implement if needed
- ⬜ **SSP-WEB-003-TASK-010 [P1]**: Audit log auth events (login/logout/token issue)

## C) Control Plane + Postgres (P0)
- ⬜ **SSP-WEB-003-TASK-011 [P0]**: Add Postgres connection + migration tooling (keep MySQL/Drizzle for gallery)
- ⬜ **SSP-WEB-003-TASK-012 [P0]**: Define schema: Project/Session/Iteration/TaskRegistry/Report
- ⬜ **SSP-WEB-003-TASK-013 [P0]**: Implement versioned API endpoints (CRUD minimal + TaskRegistry upsert/list with dedupe_key)
- ⬜ **SSP-WEB-003-TASK-014 [P0]**: Permission tests: anon/user/admin/runner
- ⬜ **SSP-WEB-003-TASK-015 [P1]**: Gate/DoD fields + status transitions + audit logs

## D) R2 Presigned URLs (P0)
- ⬜ **SSP-WEB-003-TASK-016 [P0]**: Implement presign PUT (runner) + presign GET (web/desktop)
- ⬜ **SSP-WEB-003-TASK-017 [P0]**: Enforce key prefix + TTL + max size + content-type allowlist
- ⬜ **SSP-WEB-003-TASK-018 [P1]**: Store artifact metadata (hash/size/uploader) in Postgres
- ⬜ **SSP-WEB-003-TASK-019 [P2]**: Purge job for expired artifacts

## E) LLM Gateway (OpenAI-compatible) + Cost Accounting (P0 REQUIRED)
- ⬜ **SSP-WEB-003-TASK-020 [P0]**: Define OpenAI-compatible subset contract (chat completions minimum)
- ⬜ **SSP-WEB-003-TASK-021 [P0]**: Implement `/v1/chat/completions` gateway with schema validation + rate limits
- ⬜ **SSP-WEB-003-TASK-022 [P0]**: Provider routing module (server-side keys only)
- ⬜ **SSP-WEB-003-TASK-023 [P0]**: Usage extraction + pricing table + persist cost in Postgres
- ⬜ **SSP-WEB-003-TASK-024 [P1]**: Return usage/cost metadata (headers/meta) + UI endpoint for summaries
- ⬜ **SSP-WEB-003-TASK-025 [P1]**: Abuse protection: quotas per user/project + alert hooks
- ⬜ **SSP-WEB-003-TASK-026 [P2]**: Align legacy `invokeLLM()` to call internal gateway (deprecate Forge direct)

## F) MCP Gateway (Optional)
- ⬜ **SSP-WEB-003-TASK-027 [P1]**: MCP gateway behind bearer token
- ⬜ **SSP-WEB-003-TASK-028 [P1]**: Tool allowlist + audit logs
- ⬜ **SSP-WEB-003-TASK-029 [P2]**: Contract tests for desktop/runner integration

## G) Product consistency / Cleanup
- ⬜ **SSP-WEB-003-TASK-030 [P1]**: Decide fate of AIChatBox (`trpc.ai.chat`) — implement server router OR hide/remove behind flag (currently unwired)
- ⬜ **SSP-WEB-003-TASK-031 [P2]**: Document all routes + policies (upload sizes, admin access, public endpoints)
