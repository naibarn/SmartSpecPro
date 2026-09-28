# Section 03 — Native MCP and Local Analysis

## Goal

Make MCP capability advertisement truthful and improve local media evidence and
batch planning while preserving source privacy.

## Owned files

- `apps/worker-app/src-tauri/src/comfy_mcp_client.rs`
- `apps/worker-app/src-tauri/src/worker_loop.rs`
- `apps/worker-app/src-tauri/src/media_pipeline.rs`
- native tests and shared media contracts as needed

## Implementation

Add adaptive MCP negotiation for current/stateless and legacy initialize
servers, validate `tools/list` pagination and required input schema, extract
workflow IDs/capabilities, and publish only a live validated manifest. Store
remote execution IDs and reconcile output after timeout/restart. Extend local
analysis with bounded FFprobe/FFmpeg evidence for silence, black/frozen/blur,
scene candidates, subject-focus candidates, and deterministic batch plans.

## TDD acceptance

Schema mismatch, unavailable workflow, invalid output, timeout/cancel/recovery,
analysis bounds, source immutability, and batch determinism tests pass.

## UI/UX Contract

### Target User / JTBD

Worker operator needs to know whether ComfyUI/MCP and local analysis are ready
before starting a GPU job, without seeing protocol details.

### Surface Inventory

Connection/AI Workflows screen: capability status, last manifest refresh,
selected workflow, and actionable failure/retry state.

### Component Map

Use the canonical Worker sidebar route and a focused capability card. The card
reads the shared projection and never starts a second polling loop.

### State Matrix

Loading, ready, unavailable, stale manifest, incompatible workflow, revoked
access, and retrying states are distinct and preserve the last safe state.

### Responsive Matrix

Desktop shows status and workflow columns; narrow layouts stack them and keep
the primary retry/action control visible.

### Accessibility Acceptance

Status is exposed as text, errors are announced, controls have accessible names,
and no state depends on color alone.

### Copy Contract

Use operator-facing Thai labels for ready/unavailable/stale/retry; expose the
technical error as expandable diagnostic detail.

### Browser Evidence Required

Capture or test ready, unavailable, stale, and retry states on the canonical
AI/Workflows route.
