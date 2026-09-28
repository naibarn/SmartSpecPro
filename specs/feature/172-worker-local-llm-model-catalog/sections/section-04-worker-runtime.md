# Section 04 — Worker Runtime and Local Adapters

## Scope

Add a local multi-provider/model registry and execute Worker-backed LLM jobs through the
existing Tauri Worker control plane.

## Files and ownership

- Modify `apps/worker-app/src-tauri/src/settings.rs` for atomic non-secret provider/model
  metadata and stable local IDs.
- Add focused runtime modules `local_llm_registry.rs` and `local_llm_adapter.rs` for
  provider/model state, capability probing, URL policy, and normalized inference.
- Reuse `comfy_profiles.rs`/`comfy_credentials.rs` patterns for local metadata and OS keyring;
  use a namespaced key per tenant/Worker/provider and session-only fallback when unavailable.
- Modify `worker_control_plane.rs` for inventory publish, mapping response, cancel polling,
  and typed LLM events.
- Modify `worker_loop.rs`/`worker_executor.rs` for canonical `llm_invoke` dispatch while
  preserving legacy `local_ai_task` and other executor paths.
- Extend `apps/web/shared/workerRuntime.ts` contracts as defined by Section 01.

## Runtime behavior

Support many provider profiles and many model records. OpenAI-compatible HTTP is the baseline
for Ollama, vLLM, LM Studio, llama.cpp, and LocalAI; native Ollama discovery is optional.
Probe or explicitly override capabilities; do not infer tools/vision/structured output from
names. Validate URL scheme, TLS, redirects, auth, timeout, and endpoint scope. Default cloud
relay and local-only toggles are off. Do not send secrets, local paths, or prompts during
inventory publication.

On accepted inventory, persist the Cloud mapping. On claim, verify lease, protocol, Worker
identity, `modelRef -> localModelId -> provider/model`, inventory revision, provider enabled,
and `allowCloudJobs` for `worker_relay`. Use a bounded local queue and concurrency limit.
Cancellation before provider send must not invoke the model. After send, abort when supported
and report terminal cancellation. Tool calls are data only; the Worker never executes tools.

Use current job states/events (`claimed`, `preparing`, `running`, `completed`, `failed`,
`canceled`, `expired`) and assignment-scoped sequence deduplication backed by database
uniqueness. Retry at most once only before provider acceptance or when local dedup proves no
request was sent; never blindly repeat an accepted inference after lease expiry.

## Tests first

Rust tests cover profiles/models, discovery/manual add, keyring redaction, URL/TLS/redirect
validation, capability gating, mapping/revision, queue/cancel, normalized completion/stream,
lease/tenant/model binding, event replay, and no-double-inference retry. Focused Rust tests
only; no build/restart.

## Done when

The Worker can call at least one compatible local runtime, report a normalized result/stream,
and reject all stale, unauthorized, unsupported, secret-bearing, or duplicate executions.

## UI/UX Contract

### Target User / JTBD
N/A — this section is the local runtime/data-plane implementation; Worker UI is in Section 05.

### Existing Pattern Reference
N/A — no browser UI is changed here.

### Surface Inventory
N/A — Tauri runtime and control-plane transport only.

### Component Map
N/A — no UI components are owned here.

### State Matrix
N/A — runtime states are normalized for the Section 05 UI.

### Responsive Matrix
N/A — no layout changes.

### Accessibility Acceptance
N/A — no rendered controls in this implementation section.

### Copy Contract
N/A — runtime errors are machine-safe/sanitized; UI copy is in Section 05.

### Browser Evidence Required
N/A — Rust/runtime tests cover this section; browser evidence is required by Section 05.

## Implementation record

- Added atomic Worker registry persistence with explicit provider/model binding,
  inventory revision, CRUD Tauri commands, and OS keyring-only credential APIs.
- Added OpenAI-compatible local adapter with loopback HTTP / HTTPS validation, no
  redirects, bounded parameters, cancellation checks, and normalized results.
- Worker loop publishes a secret-free inventory after heartbeat and dispatches
  `llm_invoke` through the local adapter. Rust focused proof passed 4/4.
