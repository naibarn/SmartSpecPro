# Section 02 — native profiles and MCP transports

## Objective

Implement one transport-neutral native Rust Comfy adapter with multiple saved
profiles. New Feature 165 jobs must use MCP; the old direct REST executor remains
only as an explicit legacy adapter.

## Owned files

- `apps/worker-app/src-tauri/src/comfy_mcp_client.rs`
- `apps/worker-app/src-tauri/src/comfy_profiles.rs`
- `apps/worker-app/src-tauri/src/comfy_mcp_transport.rs`
- `apps/worker-app/src-tauri/src/comfy_ssh_tunnel.rs`
- `apps/worker-app/src-tauri/src/comfy_execution_ledger.rs`
- `apps/worker-app/src-tauri/src/settings.rs`
- `apps/worker-app/src-tauri/src/commands.rs`
- `apps/worker-app/src-tauri/src/lib.rs`
- `apps/worker-app/src-tauri/src/credentials.rs`

## Required implementation

1. Define typed profile records with local stdio, approved remote stdio bridge,
   self-hosted Streamable HTTP, fixed/allowlisted Comfy Cloud, and SSH tunnel
   modes; support many saved profiles and one active profile.
2. Implement MCP initialize, protocol negotiation, tool/schema discovery,
   typed invocation, session/reconnect, deadlines, execution references, and
   redacted diagnostics.
3. Validate HTTP protocol/session headers, auth on every request, Origin/host
   allowlist, no query credentials, Cloud endpoint allowlist, and SSRF rules.
4. Validate SSH host key, keychain reference, forwarding target, owned local
   port, duplicate tunnel prevention, timeout, and cleanup.
5. Store secrets only through the OS secure store. React/server projections are
   redacted and include profile/permission/policy/projection revisions only.
6. Import legacy local Comfy settings once as an unverified legacy profile.
   Never remove or mutate the legacy settings during import.
7. Register native commands for CRUD, test, activate, revoke, probe, and safe
   status. Every command returns a typed result and stable error code.

## TDD sequence

- Profile validation on Windows/macOS, HTTPS/Cloud, and SSH.
- Secret redaction, expiry/refresh/revoke, and no secret in JSON/logs.
- Fake stdio initialize/discovery/call/reconnect/child cleanup.
- Fake HTTP session headers, 401/403/404, Origin/SSRF rejection, timeout and
  reconnect.
- SSH host-key/forwarding/cleanup and duplicate tunnel tests.
- Once-only legacy settings import.

## UI/UX Contract

### Target User / JTBD

Worker owner needs to add/test/select a Comfy connection without exposing a
credential or confusing local and remote paths.

### Surface Inventory

The native commands are consumed by the canonical Worker Comfy Connections
screen and the existing Sidebar route; no browser-to-Comfy connection is added.

### Existing Pattern Reference

- Searched `apps/worker-app/src` for settings, credentials, route shell, and
  native command patterns; found `settings.rs`, `credentials.rs`, `commands.rs`,
  `WorkerAppShell`, and `WorkerTopbar`.
- Decision: reuse existing keychain/settings/command and shell patterns; add
  only typed multi-profile state and MCP transport adapters.

### Visual Direction / Token Strategy

Reuse existing Worker cards, semantic status colors, spacing, typography, focus
rings, and reduced-motion behavior. Add no raw color or global reset.

### Component Map

Profile list, transport form, secure credential status, Test connection,
Activate, Revoke, expiry/last-probe status, and redacted capability summary.

### State Matrix

Loading disables mutations; empty state offers Add connection; stale/offline is
read-only with last observed time; invalid profile points to the field; revoked
or expired credentials explain recovery; test failure shows stable code and
correlation ID.

### Responsive Matrix

Desktop uses list/detail; tablet stacks cards; mobile uses one-column cards and a
drawer for advanced transport settings without horizontal scrolling.

### Accessibility Acceptance

All fields have labels and errors, keyboard focus is visible, status changes use
a throttled live region, and state is not conveyed by color alone.

### Copy Contract

Thai and English keys cover transport, expiry, revoke, reconnect, and redacted
credential states; raw profile ID remains copyable.

### Browser Evidence Required

Prove add/test/activate/revoke/expiry and reconnect guidance in the actual
Worker WebView with fake MCP endpoints; real Cloud credentials are release-only.

## Exit criteria

Typed adapters can open/test/close fake stdio and HTTP MCP sessions, all profile
mutations are revisioned, and new execution code cannot select direct REST.
