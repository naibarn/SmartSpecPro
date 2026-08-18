# Section 02 — Client Onboarding and Browserless Credentials

## Goal

Give Hermes One, Hermes CLI/Agent, Claude/Claude Code, Codex CLI, and generic
MCP clients one UI-driven setup with OAuth/device authorization first and a
scoped API-key fallback for machines without a browser.

## Ownership

Modify `mcpClientOnboarding.ts`, the shared onboarding surface in
`ConnectedDevicesPanel.tsx`, required existing integration-panel adapters,
API-key/device-auth router/service seams, and Thai/English settings copy.
Do not delete or merge `McpConnectPanel`, `HermesConnectPanel`, or
`McpServersSettingsPanel`.

## Contract

Create a versioned descriptor containing client family/version, endpoint,
transport, OAuth/device/key modes, required scopes, quota/expiry preview,
verification calls, and fallback reason. Keep secrets out of the descriptor.

Browserless behavior reuses `/auth/device/*` if supported. Otherwise the UI
links to API Keys creation with purpose, scopes, five-hour/day/seven-day quota,
expiry, one-time reveal, and revoke. The key cannot be a Worker/provider/
refresh token. Generated CLI/config examples must not require server `.env`.

## UI/UX Contract

### Target User / JTBD

A non-expert user connects an existing AI client with minimal configuration and
clear recovery.

### Surface Inventory

Settings MCP/devices, API Keys creation, existing MCP/Hermes panels, and
generated `/v1/docs` instructions.

### Component Map

Descriptor hook/helper, client selector, auth-mode selector, scope/quota/expiry
summary, device-code card, one-time reveal card, verification card, and device
revoke card. Existing integration panels remain owners of their own flows.

### State Matrix

Loading; OAuth ready/unavailable; device pending/approved/expired/replayed; key
reveal/hidden; connected/expired/revoked; runtime unavailable; verification
failure/success.

### Responsive Matrix

Mobile uses stacked cards; tablet uses two-column setup; desktop shows detail
panels. Command blocks wrap or scroll without page overflow.

### Accessibility Acceptance

Semantic headings/statuses, keyboard focus/order, labelled controls, non-color
status, revoke confirmation, and reduced-motion-safe polling.

### Copy Contract

Use existing DashboardCard/Badge/Button tokens. Thai and English copy must use
human descriptions rather than only `mcp:*` codes and must explain fallback,
expiry, quota, and one-time secret handling.

### Browser Evidence Required

Settings setup, fallback, one-time reveal, verification, and revoke through the
supported browser test harness.

## Tests-first requirements

- Extend onboarding helper tests for all client families, public-only deep
  links, descriptor version, and no-secret output.
- Extend Connected Devices component tests for descriptor states, named scopes,
  quota/expiry, device-code fallback, key reveal, and revoke behavior.
- Test API-key/device-code expiry/replay and secure response shape.
- Run focused jsdom tests and a browser smoke test if the environment supports
  it.

## Acceptance evidence

The UI must distinguish MCP connection, Hermes device, and local runtime
readiness. A browserless client can complete setup using another browser or a
UI-created key, and revoked cached credentials fail on the next request.

## Implementation status

Implemented the shared public onboarding descriptor for Hermes One, Hermes CLI,
Claude, Codex, and generic clients; connected it to Settings and MCP resources.
The existing API-key UI remains the explicit browserless fallback. Real-client
OAuth/device-code tests on Windows/macOS/Linux are still external evidence.
