# Section 04: Execution Router and Pi Runtime Host

## Ownership

This section owns the runtime router and the Pi integration path for desktop-local interactive agent work.

## Target files and modules

- `apps/web/server/services/desktopRunRouter.ts`
- `apps/web/shared/desktopHost.ts`
- `apps/tauri-shell/src-tauri/src/pi_runtime.rs`
- `apps/tauri-shell/src-tauri/src/policy_bridge.rs`
- `apps/tauri-shell/src-tauri/src/package_materializer.rs`
- `apps/tauri-shell/src-tauri/src/local_file_service.rs`
- `apps/web/client/src/features/desktop-host/runs/*`
- `apps/web/server/services/__tests__/desktopRunRouter.test.ts`
- `apps/tauri-shell/src-tauri/tests/pi_runtime_tests.rs`

## Scope

- define deterministic routing rules for Platform Skill vs Pi vs Agency Swarm vs OpenClaw vs Cloud Agent
- integrate Pi as the primary desktop-local interactive runtime
- inject gateway-only provider configuration and Desktop Host tools into Pi sessions
- persist runtime rationale and run labels for UI and audit
- define the HTTP-first / MCP-second server access rule for Desktop Host adapters

## Implementation notes

- managed Pi integration should default to a sidecar/RPC boundary so Desktop Host retains stronger crash isolation, policy boundaries, and cleaner secret injection
- embedded Pi integration is a later optimization only if it reaches parity on isolation, policy enforcement, and operability across supported platforms
- Pi tool exposure should be Desktop Host controlled:
  - local file search/retrieval
  - staged workspace attachments
  - connector actions
  - server API access
  - guarded shell operations
- locality labels must inherit Feature 070 truthfulness rules so desktop-mediated flows are not over-labeled as `Local`
- router inputs should include:
  - task metadata
  - package trust class
  - local file scope need
  - connector need
  - runtime availability
  - offline/degraded state

## TDD expectations

- write route-selection tests before runtime execution integration
- write sidecar-default startup tests before any embedded optimization path is considered
- write gateway-only enforcement tests before provider injection
- write run-label persistence tests before UI integration
- write capability-denial tests for Pi tool usage before happy-path execution tests
- write locality truthfulness tests for `Local` vs `Hybrid`

## Acceptance checks

- the system can explain why Pi was selected or rejected
- managed Pi startup fails closed if the sidecar/runtime boundary cannot be brought up with valid gateway policy and credentials
- Pi receives only gateway-managed provider config in managed mode
- Pi tool access is Desktop Host governed and auditable
- run cards can show stable router labels and rationale

## Risks and coordination notes

- avoid duplicating local AI Feature 070 routing logic; integrate with it where lightweight local-model assistance is useful
- keep router reasons stable and machine-readable so UI and audit systems do not drift

## Implementation status

- Implemented deterministic desktop runtime routing in:
  - `apps/web/server/services/desktopRunRouter.ts`
- Implemented managed Pi session planning and policy-bridge validation in:
  - `apps/tauri-shell/src-tauri/src/pi_runtime.rs`
  - `apps/tauri-shell/src-tauri/src/policy_bridge.rs`
  - `apps/tauri-shell/src-tauri/src/package_materializer.rs`
- Added user-visible run-label rendering in:
  - `apps/web/client/src/features/desktop-host/runs/DesktopRunBadgeRow.tsx`
- Added TDD coverage in:
  - `apps/web/server/services/__tests__/desktopRunRouter.test.ts`
  - `apps/tauri-shell/src-tauri/tests/pi_runtime_tests.rs`

## Final status

- Section 04 is implemented for sidecar-first Pi planning, truthful locality labels, and HTTP-first/MCP-second policy bridging.
