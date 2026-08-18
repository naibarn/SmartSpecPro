# Section 05 — Runtime Readiness and Process Safety

## Goal

Prevent late dependency failures and make managed Remotion/FFmpeg/ComfyUI/Local
AI processes safe and recoverable on supported Windows/macOS workers.

## Ownership

Modify signed runtime profile/doctor/install/update code, worker readiness
schemas, runtime-pack serving/release checks, process-manager adapters, and
focused Rust/TypeScript tests. Preserve current runtime IDs and old workers.

## Contract

Runtime profiles are signed/versioned and declare platform/architecture,
components, hashes/signatures, provenance/license, dependencies, install scope,
admin/reboot needs, health checks, model/custom-node bindings, and manual
command ids. Install is staged, verified, atomically activated, rollbackable,
drain-aware, and single-flight per device/component.

Required readiness states are `ready`, `installing`, `needs_user_action`,
`blocked`, `failed`, `outdated`, and `repairing`. Claim admission is blocked
until required components pass health checks. Manual prerequisite commands are
profile-generated and contain no credentials/untrusted input.

Process manager profiles are allowlisted for ComfyUI, Remotion, FFmpeg, and
Local AI. They enforce owned process identity, bounded output, graceful stop,
lease-aware drain, cancellation, cleanup, and no arbitrary PID termination.
Windows native/WSL2 and macOS arm64 claims must match actual signed manifests;
unsupported macOS Intel/Remotion states remain explicit.

## Tests-first requirements

- Signed profile hash/signature/expiry/platform/architecture/license checks.
- Install, verify, repair, update, rollback, cancel, reboot/admin, and partial
  archive recovery.
- Dependency-specific readiness and claim-blocking tests.
- Process ownership, argument/env injection, log bounds, graceful drain,
  cancellation, restart recovery, and arbitrary PID denial.
- Worker App Cargo tests and web route/schema tests for runtime catalog claims.

## Acceptance evidence

Package availability is not a clean-machine proof. Windows 11 native/WSL2,
Hermes Windows, Apple-Silicon Hermes, and any Remotion macOS pack require real
release artifacts and machine evidence before a production gate is closed.

## UI/UX Contract

### Target User / JTBD

User needs to know exactly why a worker cannot run and how to Install, Repair,
Verify, or complete a manual prerequisite.

### Surface Inventory

Existing Worker App doctor/runtime setup, readiness cards, install/update logs,
and server worker status projection.

### Component Map

Reuse Worker App runtime/readiness components and server status projection; do
not add a second runtime catalog UI.

### State Matrix

Unknown, checking, ready, installing, needs user action, blocked, failed,
outdated, repairing, rolling back, and drain/maintenance.

### Responsive Matrix

N/A for desktop Worker App layout changes; server status cards must stack on
small screens and expose full remediation on desktop.

### Accessibility Acceptance

Every blocker has text, component name, next action, privilege/reboot note, and
keyboard-accessible Check again; logs are not the only explanation.

### Copy Contract

Thai/English copy distinguishes managed install from OS/vendor prerequisite and
never prints secrets, private URLs, or arbitrary commands.

### Browser Evidence Required

Verify server readiness/blocked status projection in browser; Worker App native
evidence is recorded separately from browser tests.

## Implementation status

Implemented Worker App ComfyUI settings, exact loopback service matching,
readiness-gated claim hints, live ComfyUI readiness projection in worker
heartbeat capabilities, runtime-pack ffprobe selection for Windows/macOS/
managed WSL, and a separate Comfy execution slot sharing the existing safe
worker loop. ComfyUI itself, model files, custom nodes, GPU drivers, and signed
release packaging are intentionally not silently installed by this patch and
require machine-specific setup evidence; the remaining process-manager and
clean-machine install gates are therefore explicitly external rather than
treated as complete.
