# spec.md

Spec ID: **SSP-DESKTOP-APP-001**  
Name: **SmartSpec Desktop App (Tauri + React)**  
Status: **Active / Implemented (baseline) + Extensible (remote-mode optional)**  
Last updated: 2026-01-04

## 0) Scope Snapshot (What this spec covers)
This spec covers **only the Desktop App implementation under `desktop-app/`**:
- Local-first UX + local runner (Python bridge + Kilo Code CLI)
- Local persistence (SQLite) for workflows/executions/configs + local memory/checkpoints
- Optional Remote Mode **as a client shell** that calls website services (spec 003) via API/MCP

This spec does **NOT** cover implementing Postgres/Auth/MCP/LLM Gateway/Costing services (those belong to **spec 003-smartspec-website**).  
Desktop must **call** those services remotely when Remote Mode is enabled. fileciteturn5file0L239-L251

---

## 1) Repository Boundary (MUST)
**All code changes MUST stay inside `desktop-app/`** to avoid impacting other programs/services.

---

## 2) Compatibility Rules (Non‑breaking)
- Default behavior of existing Local Mode must remain unchanged.
- Anything new that could affect behavior must be:
  - **feature-flagged** (default OFF), and/or
  - **warn-first** before strict enforcement.
- Existing “as-is” contracts remain canonical until a migration is explicitly declared.

---

## 3) High-Level Architecture (Aligned with blueprint)
Blueprint separation (Decision/Execution/State/UX) is enforced:  
- **Orchestration/Decision**: LangGraph (REMOTE, website) fileciteturn5file0L115-L143  
- **Execution**: Kilo Code CLI (LOCAL) fileciteturn5file0L64-L84  
- **Evidence**: `.spec/reports/` + structured JSON summaries (LOCAL output contract) fileciteturn5file0L80-L84  
- **State**: Control Plane API + Postgres (REMOTE, website) fileciteturn5file0L239-L257  
- **UX**: Desktop UI (THIS spec) fileciteturn5file0L232-L235

Desktop remains a **client shell** in remote mode (no business logic in Rust; same backend API). fileciteturn5file0L315-L325

---

## 4) Modes
### 4.1 Local Mode (Default)
- Uses local SQLite for workflows/executions/configs
- Runs workflows via Python runner → Kilo CLI
- Shows streaming output and local history
- Works offline

### 4.2 Remote Mode (Optional, feature flag OFF)
Flag: `remoteModeEnabled=false` (default)  
When enabled, desktop:
- Logs in via website auth
- Browses Project/Session/Iteration/TaskRegistry/Reports from Control Plane API
- Downloads report bundles via presigned URLs
- Supports approval UX (approve `--apply`) as governed write (optional phase)

Remote mode does **not** change Local Mode; it adds an alternative “remote shell” path.

---

## 5) Local Persistence & Memory
### 5.1 Local SQLite (As‑Is)
- Stores workflows/executions/configs metadata (authoritative in Local Mode)

### 5.2 SqliteSaver (Memory / Checkpoint Store) — NEW
SqliteSaver is used to provide **durable local memory/checkpoints** for long-running sessions and “gather-all-data-then-decide” flows.

**Role (Desktop Local Mode):**
- Store conversation/workflow context snapshots
- Store step-by-step checkpoints (e.g., runner stage, last successful node, partial outputs)
- Allow resume after crash/restart
- Provide local “Memory” view in UI (optional)

**Role (Remote Mode):**
- Acts as **cache + offline buffer only**.
- **Authoritative canonical state stays on website Postgres** (Control Plane). fileciteturn5file0L239-L251
- Any future sync must be explicit and conflict-safe; default behavior is read-only remote + local cache.

**Non-goals:**
- SqliteSaver is not a replacement for Postgres.
- SqliteSaver must not become a hidden “second source of truth” in remote mode.

**Data model (minimum):**
- `memory_sessions` (id, mode=local|remote, created_at, updated_at, tags)
- `memory_checkpoints` (session_id, checkpoint_id, created_at, payload_json, summary, size_bytes)
- `memory_artifacts_index` (session_id, path, hash, kind, created_at)  *(optional)*

**Retention (compatible-first):**
- Default: keep last N days or last N checkpoints per session (configurable).
- Redact secrets before persistence.

---

## 6) LLM Integration via Website Gateway (OpenAI-compatible) — NEW
Constraint: Kilo CLI uses an **OpenAI-compatible** endpoint.
But the real LLM routing + policy + costing must live on website (spec 003).

### 6.1 Website responsibilities (Spec 003)
- LLM Gateway (API or MCP gateway)
- Provider routing (OpenAI/others)
- Policy enforcement (rate limit, entitlement)
- **Cost accounting** (source of truth)

### 6.2 Desktop/Kilo responsibilities (THIS spec)
Feature flag: `llmProxyEnabled=false` (default)

When enabled:
1) Desktop/runner starts a **local lightweight OpenAI-compatible proxy** on `127.0.0.1:<ephemeral_port>`  
   - No DB, no billing, no provider keys stored.
2) Runner injects env/config for Kilo to point to proxy (e.g., `OPENAI_BASE_URL=http://127.0.0.1:<port>/v1`)
3) Proxy forwards requests to **website LLM gateway** using the website auth token
4) Website returns completion plus usage/cost metadata
5) Desktop displays usage/cost (read-only)

**Non-breaking guarantee:** if `llmProxyEnabled=false`, Kilo behaves exactly as today.

---

## 7) Security Requirements (Desktop)
- Secrets redaction in UI + logs + memory store (SqliteSaver)
- Path sandboxing (warn-first → enforce later)
- Process hardening for runner/proxy (timeouts, throttling, safe args)
- Remote mode: token handling (session/in-memory default; secure storage opt-in)

---

## 8) Definition of Done
- Local Mode unchanged (regression suite passes)
- Remote Mode + LLM proxy + SqliteSaver are additive and gated by feature flags (default OFF)
- Clear “source of truth” rules: Local=SQLite; Remote=Postgres; SqliteSaver=caching/checkpoints only in remote
- Contracts documented: event schema, API touchpoints, error mapping

