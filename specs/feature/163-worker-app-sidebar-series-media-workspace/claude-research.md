# Deep-plan research — Feature 163

## Research decision

- Codebase research: required. Existing Worker App, Express control-plane
  routes, Drizzle schema, connected-device pairing, and Vertical Drama router
  must be extended without broad staging or ownership regressions.
- Web research: required only for the ComfyUI/MiniMax facts inherited by the
  mounted Media Workspace; Feature 163 itself is primarily an internal REST,
  Tauri, and UI architecture change.
- Testing: Vitest for server/shared/UI contracts; Rust `cargo test` for Tauri
  native root/credential behavior; Worker app typecheck/build for the shell.
- SocratiCode: unavailable in the current transport; targeted shell discovery
  was used and recorded here.

## Codebase findings

- The current Worker UI is concentrated in `apps/worker-app/src/main.tsx`
  with four legacy tabs (`connection`, `render`, `hermes`, `settings`) and
  styling in `apps/worker-app/src/styles.css`. Feature 163 should extract a
  route registry/shell while retaining aliases and background execution.
- `apps/worker-app/src-tauri/src/control_plane.rs` is the correct native
  authenticated client seam. `credentials.rs` owns device proof/private-key
  persistence and `settings.rs` owns safe local settings validation.
- `apps/web/server/routes/workerRuntime.ts` is registered by
  `apps/web/server/_core/index.ts`; it already has Worker token/device-proof
  middleware, rate limiting, claim/report, and artifact routes. New Series
  Control Plane endpoints should be added there or a focused companion route
  with shared auth helpers.
- `apps/web/shared/workerRuntime.ts` currently exposes execution scopes while
  `apps/web/shared/workerAccessKeys.ts` exposes registration/key permission
  scopes. Feature 163 needs one canonical scope registry and derived views,
  including a media-operator preset, rather than adding strings to one list.
- `apps/web/server/routers/verticalDramaSeries.ts` currently implements an
  owner-scoped list (`tenantId + ctx.user.id`). Worker shared/group/tenant
  access must use a neutral server-side access service and must not call the
  browser tRPC procedure directly or broaden its predicate implicitly.
- Existing UI patterns include the web dashboard sidebar/layout components,
  but the Worker App is a Tauri desktop surface. Reuse the information
  architecture and accessibility conventions while keeping native folder
  picker/path disclosure inside Rust commands.

## Architecture decisions

1. REST Worker Control Plane, not browser tRPC, for Series discovery/binding.
2. Server-derived principal from Worker/connected-device records; no client
   `userId`, tenant, or owner authority.
3. Native coordinator is single-owner per Worker identity; multiple windows
   subscribe to state and cannot duplicate heartbeat/claim/upload loops.
4. Local roots use opaque IDs and device-keyed HMAC fingerprints; raw paths and
   source bytes remain local until verified derived publication.
5. Binding revision plus `If-Match` protects concurrent windows/reconnects.
6. Feature flags and additive migration are operationally reversible without
   deleting source, artifacts, history, or audit evidence.

## Web research references

- https://github.com/Comfy-Org/comfy-mcp
- https://github.com/Comfy-Org/comfy-mcp/blob/main/server.json
- https://www.minimax.io/blog/minimax-h3
- https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_api_nodes/nodes_minimax.py

## Testing approach

- Shared scope/access schemas: focused Vitest tests.
- REST route auth/idempotency/cursor/error contracts: route tests with mocked
  service dependencies and explicit tenant/Worker fixtures.
- Native root safety, HMAC, cache invalidation, and recovery: Rust unit tests
  in the Tauri crate.
- Worker shell/context/route/Quick Action behavior: TypeScript tests where
  existing harness permits; build/typecheck is mandatory.
- Browser/native screenshots and real GPU/MCP/provider execution are separate
  verification gates, not replaced by unit tests.
