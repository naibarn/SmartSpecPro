# Section 03 — Runner Foundation and Local Journal

## Goal

Create the independent Rust Runner package and safe local lifecycle primitives
that both local execution and the shared Container profile can use without
depending on Tauri or Worker App state.

## Ownership and file boundary

Create apps/runner-app/Cargo.toml, src/main.rs, src/config.rs,
src/identity.rs, src/journal.rs and src/diagnostics.rs, plus focused tests.
The package must have its own name, binary name, configuration root, data root,
version and release metadata. It must not import apps/worker-app modules or
reuse Worker App tokens/configuration.

Keep the core headless. The CLI commands doctor, status, capabilities,
connect, reconnect and safe shutdown/drain must call the same lifecycle
services used by the daemon/foreground process, not implement parallel logic.

## Required design

Configuration must select exactly one profile and validate required settings:
local profile requires enrollment/control settings; shared profile requires a
validated Job assignment and must reject persistent device enrollment. Secrets
must be injected through the approved credential mechanism and excluded from
serialized configuration and diagnostics.

Local identity storage uses an OS-protected key or the safest platform
equivalent, with a testable fallback policy that never silently writes a
plaintext long-lived credential. The identity model supports rotation,
revocation, offboarding and unknown state.

The local journal stores bounded control/event metadata and artifact
references only. It has byte/event limits, sequence ordering, idempotency,
replay markers, corruption detection, overflow behavior and redacted
inspection. It must never store provider API keys, refresh tokens, raw prompt
context or arbitrary MCP payloads. Shared Container mode may use an
in-process buffer but must not rely on this journal across replacement.

Lifecycle states must distinguish starting, ready, draining, disconnected,
reconciling, unknown, failed and stopped. Shutdown must stop claims before
terminating process scopes.

## TDD tasks

Write Rust tests before implementation for:

1. Profile config accepts local/shared modes and rejects conflicting settings.
2. Identity serialization excludes secret material and differentiates local
   device from managed Container node.
3. Journal capacity, overflow, sequence, idempotent replay and corruption
   behavior are deterministic.
4. Incomplete replay transitions to unknown and blocks unsafe completion.
5. Diagnostics are redacted and bounded.
6. Shutdown/drain prevents new claims and completes bounded cleanup.

Run only cargo tests for apps/runner-app; no repository-wide compiler command.

## Implementation steps

1. Add the manifest and minimal binary that can parse config and report a
   redacted status.
2. Add lifecycle/profile config and identity interfaces.
3. Add journal storage and replay state machine with bounded limits.
4. Add CLI diagnostics and safe shutdown/drain.
5. Add protocol fixture loading hooks for section 01 without coupling to Web
   build output.

## Acceptance

The package builds and its focused tests prove independent package/config/
token boundaries, deterministic journal recovery and safe lifecycle states.
The local Runner can report redacted health without requiring a webview or
Worker App installation.

## Dependencies and handoff

Depends on section 01. Can run in parallel with section 02 after contracts
are frozen. Blocks local control, execution and Container entrypoint work.

## UI/UX Contract

### Target User / JTBD

N/A for this section: it implements a non-visual contract/runtime boundary.
The user-facing projection is specified in section 07.

### Surface Inventory

N/A; no browser surface is created or changed here.

### Component Map

N/A; this section exposes protocol/runtime contracts consumed by section 07.

### State Matrix

N/A for direct UI. Runtime states are exposed as typed status data to section 07.

### Responsive Matrix

N/A; no layout or viewport behavior is implemented here.

### Accessibility Acceptance

N/A for the non-visual layer. Any status exposed to UI must remain semantic and
localized by section 07.

### Copy Contract

N/A; no user-facing copy is introduced in this section.

### Browser Evidence Required

N/A for direct implementation. Section 07 must prove the corresponding
projection and redaction behavior.
