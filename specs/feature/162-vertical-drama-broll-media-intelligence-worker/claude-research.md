# Deep-plan research — Feature 162

## Research decision

- Codebase research: required. This is an existing git repository with a
  TypeScript/React web app, a Rust/Tauri Worker App, Drizzle schema, Express
  routes, Vitest, and existing Worker/Vertical Drama contracts.
- Web research: required for ComfyUI MCP and MiniMax H3 because both are
  version-sensitive integrations. The implementation must remain capability
  and workflow-registry driven rather than assuming every Worker has H3.
- Testing: use the repository's Vitest tests for shared/server contracts and
  Rust `cargo test` for Tauri/native behavior. Worker TypeScript uses
  `npm --workspace apps/worker-app run typecheck` and `build`.
- SocratiCode: unavailable in the current transport; targeted `rg` and
  line-range reads were used as the documented fallback.

## Codebase findings

### Existing Worker/runtime seam

- `apps/web/shared/workerRuntime.ts` owns Worker scopes, job status/stage
  values, registration/claim/artifact schemas, and existing local-folder/video
  assembly concepts. New Feature 162 job families should extend these shared
  contracts instead of creating an unrelated queue protocol.
- `apps/web/server/routes/workerRuntime.ts` is already registered from
  `apps/web/server/_core/index.ts` and provides device-proof/token validation,
  claim, job-event, artifact-init, and artifact-complete routes. Derived media
  publication should reuse this authenticated Worker boundary.
- `apps/web/server/services/workerAuthService.ts` and
  `apps/web/server/services/connectedDeviceService.ts` are the authority
  boundary. Worker requests cannot supply a user identity as authorization.
- `apps/worker-app/src-tauri/src/control_plane.rs`, `credentials.rs`,
  `settings.rs`, and the Rust executor tests are the native extension points.
  Existing credentials protect device proof/private material; new root and
  local-job state must use the same native boundary rather than webview-only
  storage.

### Existing media/Vertical Drama seam

- `apps/web/server/services/verticalDramaBrollService.ts` and
  `apps/web/server/services/verticalDramaMediaAssetService.ts` already contain
  media/asset conventions to reuse for Series linkage, artifact provenance,
  and B-roll selection.
- The Vertical Drama shared modules under
  `apps/web/shared/verticalDramaSeries/` provide typed shot, visual source,
  continuity, quality, and asset contracts. Feature 162 must add media
  intelligence contracts in shared modules and keep the storyboard layer
  consuming verified derived artifacts/manifests.
- Existing server tests live beside services/routes under `__tests__` and use
  Vitest. Focused tests are preferred over a baseline-wide typecheck when the
  dirty worktree makes unrelated failures noisy.

## Web research findings

### ComfyUI MCP

- Official Comfy-Org publishes `comfy-mcp` as a local MCP server that drives a
  local ComfyUI installation; the repository's `server.json` identifies it as
  `io.github.Comfy-Org/comfy-mcp` and publishes a versioned package.
- Official documentation/repository distinguishes local MCP from Comfy Cloud
  MCP. The adapter must therefore record route type, MCP server/tool manifest,
  compatibility version, and whether the execution is local or remote.
- Implementation decision: MCP is the Worker production control contract;
  direct ComfyUI HTTP is only an adapter-internal fallback/diagnostic path and
  is never exposed as a browser contract. Capability probing must precede job
  admission, and workflow JSON must come from an allowlisted registry.

Sources:

- https://github.com/Comfy-Org/comfy-mcp
- https://github.com/Comfy-Org/comfy-mcp/blob/main/server.json
- https://docs.comfy.org/agent-tools/mcp

### MiniMax H3

- MiniMax describes H3 as a multimodal video model supporting text, image,
  video, and audio context. Official ComfyUI source includes MiniMax H3
  partner/API nodes, while official/community model packaging has materially
  different hardware and licensing requirements depending on the route.
- The implementation must not hardcode H3 as universally available. Use a
  capability/workflow registry with explicit T2V, I2V/first-last-frame, and
  reference-to-video input contracts, model/license readiness, VRAM/resource
  requirements, and a probe result.
- Start frame, ordered reference frames, and optional reference video/audio are
  represented as typed manifests and resolved into the selected workflow; raw
  paths and arbitrary graphs never cross the server/UI contract.

Sources:

- https://www.minimax.io/blog/minimax-h3
- https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_minimax.py
- https://huggingface.co/MiniMaxAI/MiniMax-H3
- https://design.minimax.io/tools/minimax-h3-comfyui

## Planning implications

1. Build shared schemas and deterministic media algorithms first.
2. Add Worker-local native processing and resumable job state before R2
   publication.
3. Put server admission, tenant/Series policy, workflow resolution, artifact
   verification, and vector-index publication behind existing Worker auth.
4. Implement the storyboard UI only against typed projections and verified
   artifact states.
5. Treat live GPU, MCP, provider, migration, browser, and deployment proof as
   separate gates after focused unit/integration tests pass.
