# Section 05: Agency Swarm and Connector Runtime

## Ownership

This section owns desktop-local complex orchestration and managed local connector execution.

## Target files and modules

- `apps/tauri-shell/src-tauri/src/agency_swarm_runtime.rs`
- `apps/tauri-shell/src-tauri/src/connector_runtime.rs`
- `apps/tauri-shell/src-tauri/src/package_materializer.rs`
- `apps/tauri-shell/src-tauri/src/secret_store.rs`
- `apps/web/server/services/desktopPackageRegistryService.ts`
- `apps/web/server/services/desktopPolicyService.ts`
- `apps/web/client/src/features/desktop-host/agencies/*`
- `apps/web/server/services/__tests__/desktopAgencyMaterializer.test.ts`
- `apps/tauri-shell/src-tauri/tests/agency_swarm_runtime_tests.rs`

## Scope

- materialize server-authored agencies into local Agency Swarm runtime bundles
- run Agency Swarm inside a managed desktop-local runtime
- expose connector capabilities through a managed local connector runtime
- support hybrid flows where Pi performs discovery or preparation before Agency Swarm orchestration takes over

## Implementation notes

- default Agency Swarm enterprise packaging should prefer managed Docker runtime unless a stronger platform-specific reason exists
- managed Agency Swarm startup must use Desktop Host-injected gateway-only provider configuration and fail closed when only unmanaged provider keys are available
- connector runtime should expose host-managed actions instead of arbitrary SDK usage in managed mode
- secrets should be injected only to the connector/runtime that needs them and only for the duration required
- Desktop Host should own thread persistence and recovery callbacks for Agency Swarm rather than relying on hidden server-managed thread state
- Agency Swarm bundles should carry:
  - topology
  - prompts/instructions
  - capability manifest
  - policy descriptor
  - local adapter configuration

## TDD expectations

- add agency-pack materialization tests before runtime execution
- add gateway-only provider-injection tests before Agency Swarm execution is enabled in managed mode
- add connector action authorization tests before outbound calls
- add hybrid flow tests for Pi-to-Agency handoff
- add secret scoping and cleanup tests before connector-runtime happy paths

## Acceptance checks

- desktop can materialize and run approved Agency Swarm bundles
- managed Agency Swarm runs reject unmanaged provider configuration
- connector actions are policy-controlled and auditable
- long-running multi-agent runs remain visible in unified run history
- hybrid routing between Pi and Agency Swarm is explicit and inspectable

## Risks and coordination notes

- avoid giving Agency Swarm unconstrained host access just because it is desktop-local
- keep connector policy distinct from general network policy so chat/bot channels do not become hidden exfiltration paths

## Implementation status

- Implemented Agency Swarm runtime planning and connector authorization in:
  - `apps/tauri-shell/src-tauri/src/agency_swarm_runtime.rs`
  - `apps/tauri-shell/src-tauri/src/connector_runtime.rs`
  - `apps/tauri-shell/src-tauri/src/secret_store.rs`
- Implemented server-side agency pack materialization, hybrid handoff, and trust enforcement in:
  - `apps/web/server/services/desktopPackageRegistryService.ts`
  - `apps/web/server/services/desktopPolicyService.ts`
- Added user-facing handoff controls in:
  - `apps/web/client/src/features/desktop-host/agencies/DesktopAgencyHandoffLinks.tsx`
  - `apps/web/client/src/pages/Chat.tsx`
- Added TDD coverage in:
  - `apps/web/server/services/__tests__/desktopAgencyMaterializer.test.ts`
  - `apps/tauri-shell/src-tauri/tests/agency_swarm_runtime_tests.rs`

## Final status

- Section 05 is implemented for managed Agency Swarm startup, connector authorization, and Pi-to-Agency handoff surfacing.
