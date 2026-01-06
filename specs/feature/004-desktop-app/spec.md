# spec.md

Spec ID: **SSP-DESKTOP-APP-001**  
Name: **SmartSpec Desktop App (Tauri + React)**  
Status: **Active / Implemented (production-ready path)**  
Last updated: 2026-01-06

## 0) Scope Snapshot
This spec covers Desktop App under `desktop-app/`:
- PTY Terminal UX + multi-tab sessions (local)
- Kilo CLI compatibility mode (local)
- **LLM Chat (OpenAI-compatible) + Multi‑modal (image/video) via Artifact Storage**
- Control Plane access **via python-backend proxy** (never embed CP secrets in client)
- Optional remote shell behavior that calls SmartSpecWeb services (Spec003)

---

## 1) Runtime Dependencies
Desktop depends on:
- **python-backend** (Spec007) running on localhost for:
  - OpenAI-compatible surface: `POST /v1/chat/completions` (SSE streaming supported), `GET /v1/models`
  - Control Plane proxy: `/api/v1/control-plane/api/v1/...`
- **SmartSpecWeb** (Spec003) reachable by python-backend for:
  - LLM Gateway + MCP + policy/audit/cost (source of truth)
  - Artifact storage presign flows (through Control Plane)

---

## 2) Key Flows

### 2.1 LLM Chat (text + streaming)
Desktop → python-backend `POST /v1/chat/completions` (stream=true)  
python-backend → SmartSpecWeb `/v1/chat/completions` → upstream provider  
Desktop renders SSE deltas as real-time tokens.

### 2.2 Multi-modal (image/video) using Artifact Storage (R2/S3)
Desktop:
1) `presign PUT` via python-backend control-plane proxy
2) Upload file to presigned URL (PUT)
3) `presign GET` via control-plane proxy
4) Send to LLM as `image_url` / `file_url` in OpenAI-compatible messages  
LLM/tools can fetch the presigned GET URL.

---

## 3) Security Requirements
- Desktop must not embed Control Plane API keys or provider keys in the bundle.
- Optional local protection:
  - Desktop sends `Authorization: Bearer <VITE_PY_PROXY_TOKEN>` to python-backend
  - python-backend enforces `SMARTSPEC_PROXY_TOKEN`
- Workspace path + file upload limits enforced in UI (max size) + server-side validation (Spec007/003).

---

## 4) Required ENV (Desktop)
- `VITE_PY_BACKEND_URL` (default `http://localhost:8000`)
- `VITE_PY_PROXY_TOKEN` (optional)
- `VITE_WORKSPACE_PATH` (optional default)
- `VITE_ORCHESTRATOR_KEY` (legacy optional)

---

## 5) Definition of Done
- Desktop “LLM Chat” works with streaming token output
- Insert Picture / Insert Video uploads through presign and sends to LLM successfully
- Desktop never ships CP secrets; all CP calls go via localhost python-backend proxy
