# plan.md

Plan ID: **SSP-DESKTOP-APP-001-PLAN**  
Linked Spec: **SSP-DESKTOP-APP-001**  
Principle: **Non-breaking** (additive only; feature flags default OFF)  
Repository Boundary: changes only in `desktop-app/`

This plan assumes website (spec 003) owns Postgres/Auth/MCP/LLM Gateway/Costing. Desktop only consumes API/MCP. fileciteturn5file0L239-L251

---

## Phase 0 — Lock Baseline (As‑Is) + Guardrails
- Freeze as-is contracts + regression checklist
- Repo boundary CI/path guard

Deliverable: “No regressions” safety net

---

## Phase 1 — SqliteSaver Memory (Local-first, additive)
- Introduce SqliteSaver as checkpoint/memory store (local)
- UI hooks: optional Memory view (read-only)
- Retention + redaction rules

Deliverable: crash-resume + durable memory without changing existing workflow runs

---

## Phase 2 — Remote Mode Scaffolding (Read-only, flag OFF)
- `remoteModeEnabled=false` default
- API client + auth token session handling
- Read-only browsing of remote state + report downloads via presigned GET

Deliverable: remote shell without affecting local mode

---

## Phase 3 — LLM Proxy Scaffolding (flag OFF)
- `llmProxyEnabled=false` default
- Local OpenAI-compatible proxy start/stop (ephemeral)
- Forward to website LLM gateway using auth token
- UI shows usage/cost returned from server (read-only)

Deliverable: Kilo can call LLM via proxy without putting keys/billing in desktop

---

## Phase 4 — Security Hardening (compatible-first)
- Redaction tests: tokens, prompt logs, memory payloads
- Process hardening: proxy/runner timeouts, backpressure, safe args
- Path sandbox warn-first; enforce later behind flag

Deliverable: safer desktop while preserving dev experience

---

## Phase 5 — Optional Approval UX (Remote governed write)
- Approve `--apply` UX (preview-first)
- Audit trail display (server truth)

Deliverable: remote approvals without business logic in desktop

