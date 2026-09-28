# Feature 165 deep-implement section status

This implementation was completed in the existing protected, dirty `main`
worktree without staging or resetting unrelated changes. The implementation
state is file-based because no task/sub-agent backend is available in this
environment.

| Section | Status | Evidence |
|---|---|---|
| 01 contracts and safe migration | complete | shared schemas, scope contract, focused Vitest |
| 02 native profiles and MCP transports | complete | profiles, stdio, HTTP, Cloud allowlist, keyring, SSH lifecycle, Cargo tests |
| 03 capability and workflow resolution | complete | MCP discovery, workflow pinning, capability heartbeat metadata |
| 04 server policy and Comfy jobs | complete | authenticated summary route, MCP admission, typed job families, progress validation |
| 05 worker execution and recovery | complete | native execution, confined outputs, artifact upload, execution ledger |
| 06 shared job projection | complete | Worker summary projection with Series/workflow/time/progress fields |
| 07 Worker Comfy UI and Overview | complete | Sidebar route, CRUD/probe/credential controls, direct ComfyUI Workbench with schema-driven arguments, prompt/file upload, lifecycle status, cancellation, and realtime overview polling |
| 08 Series/shot Web integration | complete | existing shot MCP payload seam and server-side frame reconstruction retained |
| 09 integration and packaging | complete | version 0.1.194 source, plan/UI checkers, focused regression suite; installer/browser/provider evidence remains environment-bound |

Known environment-bound proof is intentionally separate: real Comfy Cloud or
remote SSH credentials, actual WebView click-through, signed installer
publication, and production deployment were not performed in this local
implementation pass.

## Audit round 8 — interactive Workbench closure

- Verified the Workbench route is registered in the Tauri command handler and
  rendered from the Worker sidebar.
- Closed direct-run cancellation: each run has a validated local run ID,
  cancellation state is owned by the Worker process, and the MCP lifecycle
  invokes an advertised cancellation tool when available.
- Closed workflow-field drift: the UI and Worker accept camelCase and
  snake_case workflow/template identifiers and select the advertised schema
  field rather than assuming `workflowId`.
- Restricted the Workbench run selector and backend requested-tool path to the
  workflow submission allowlist; upload tools remain a separate allowlist.
- Re-ran TypeScript typecheck, Vite production build, Rust check, Rust unit and
  integration tests, and five wiring audits. All passed locally.

## Audit rounds 9–10 — schema inspection and preflight closure

- Added a real Worker command and Workbench action for per-workflow schema
  inspection through the MCP-advertised schema tool, with bounded response
  size and localized missing-tool feedback.
- Added required-field preflight for the discovered MCP input schema before a
  direct run; advanced JSON remains available for nested/provider-specific
  contracts.
- Revalidated command registration, workflow-tool allowlists, cancellation
  registry, output persistence, credential redaction checks, and five static
  wiring passes after the changes.

## Audit rounds 11–17 — Worker Workbench completeness convergence

1. **UI/state isolation:** passed after clearing stale probe/schema state when
   changing profile or workflow, ignoring out-of-order probe responses, and
   adding a manual workflow/template field when a remote MCP does not publish a
   workflow list.
2. **UI language parity:** passed after replacing hardcoded schema headings and
   synchronous-response text with the existing Thai/English locale contract.
3. **Tauri contract:** passed; schema inspection, direct run, cancellation, and
   MCP upload commands are registered and their response fields match the UI.
4. **MCP lifecycle:** passed; local stdio and HTTP transports negotiate MCP,
   discover schemas, submit through an allowlist, poll status, fetch outputs,
   and include the official `cancel_job` alias for Cloud/HTTP cancellation.
5. **Input/output safety:** passed; request sizes, file types, output count,
   local regular-file/media extension, output size, and result-file collision
   boundaries are enforced without logging credentials.
6. **Spec/runtime parity:** passed; all supported transport families, standard
   `comfy-mcp` command, schema/upload/frame terminology, and direct Workbench
   route are represented in the implementation.
7. **Quality gates and convergence:** TypeScript typecheck, Vite production
   build, Rust tests (198 unit + 10 runtime-manifest + 21 executor), and
   targeted diff checks passed. Crate-wide `cargo fmt --check` remains noisy
   because the protected dirty crate contains pre-existing unformatted changes;
   no formatting rewrite was applied to unrelated files.

Rounds 18–19 then performed post-fix convergence: the inspected workflow
schema now drives the editable input form when it provides properties, and a
cancel request raised during MCP negotiation is checked before submission for
both stdio and HTTP transports. Both rounds passed with the full gate suite
rerun; no additional safe in-scope implementation gap remained after round 19.
