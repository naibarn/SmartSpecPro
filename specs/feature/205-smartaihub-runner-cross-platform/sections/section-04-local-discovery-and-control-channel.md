# Section 04 — Local Discovery and Control Channel

## Goal

Implement local Runner capability discovery and the single authenticated
outbound control channel with reconnect, durable fallback and reconciliation.

## Ownership and file boundary

Create or extend apps/runner-app/src/discovery.rs and
src/control_channel.rs, with focused Rust tests. Extend the backend gateway
from section 02 only for the handshake and reconciliation contract; do not
change legacy Worker routes. Use the Feature 197/200 control semantics and
section 01 envelopes.

## Required design

Discovery is a bounded, repeatable scan of the known tool catalog, not a
blind execution of every binary on the host. The initial catalog includes
Claude Code/Claude CLI, Codex CLI, DeepSeek Harness, Google Antigravity,
Hermes CLI/Agents and OpenClaw-compatible runtimes, plus approved media,
browser, desktop, local-AI and local-MCP tools. It may inspect PATH, approved
known locations, application bundles/package metadata, manifests and approved
MCP configuration, then invoke only adapter/manifest-approved version or
health probes with time and output limits. A PATH name alone is never ready;
an unknown candidate is metadata-only until an adapter or approved generic CLI
profile exists.

For every candidate, normalize separate tool-inventory and capability-inventory
records: tool ID/kind/version, adapter or manifest identity, discovery source,
install/configuration/auth/health/availability state, control profile,
resource/concurrency requirements, fingerprint, reason codes, observed time
and expiry. Keep absolute paths, credentials, raw configuration and account
secrets local or opaque. Register all recognized tools in one idempotent
Runner capability snapshot/revision; a tool is not a separate Runner/device.
Missing or revoked tools become stale/unavailable and server policy remains the
final authority for selection.

Use the trust states `discovered`, `probed`, `verified`, `ready`, `busy`,
`degraded`, `auth_required`, `unsupported` and `disabled` consistently. A
`ready` claim requires an approved adapter/manifest and successful bounded
probe; policy `allowed` is evaluated separately by SmartAIHub and is required
for selection.

Scan on first start, upgrade, periodic refresh, explicit rescan, relevant
PATH/config changes and a stale-capability execution failure. Shared Container
mode scans only allowlisted tools/manifests from its immutable image and
reports image/runtime readiness; it never scans or exposes a user's local
tools.

The control client opens one authenticated WSS fast path with HTTPS durable
fallback. It negotiates protocol version, authenticates node/profile identity,
tracks command/event ACK states, enforces sequence/idempotency, uses bounded
backoff and sends a reconciliation report after backend or Runner restart.
The client must preserve safe active processes across transient network loss
but block unsafe new work while ownership is unknown.

Use server-derived authorization, capability revision, lease and fence
validation for every offer. Reject stale offers, revoked trust, expired
snapshots, missing capabilities and mismatched profile.

## TDD tasks

1. Discovery recognizes all six initial external-agent families, distinguishes
   install/configuration/auth/health/availability/policy dimensions, and
   rejects PATH-only false positives.
2. Tool and capability inventories are separated, bounded and redacted; one
   Runner snapshot registers recognized tools idempotently and tombstones
   missing/revoked entries.
3. Snapshot revision/expiry affects offer acceptance.
4. Handshake/version negotiation succeeds and malformed messages fail closed.
5. ACK transitions for accepted/applied/rejected/unknown/duplicate/
   out-of-order are deterministic.
6. WSS loss uses HTTPS durable fallback and reconnect replay is idempotent.
7. Backend restart, Runner restart and device sleep yield a reconciliation
   report rather than silent success.
8. Revoked identity cannot reconnect or accept a Job.
9. Shared Container discovery is image/allowlist-bound and does not expose
   local-user tools or per-user device capabilities.

Use fake transport and clock injection for unit tests. Add an integration
fixture only for the selected gateway contract; never require a live device
for all tests.

## Implementation steps

1. Define discovery probe interfaces and bounded snapshot normalization.
2. Implement the authenticated handshake and envelope sequence state.
3. Add durable fallback and reconnect backoff.
4. Connect journal replay/reconciliation from section 03.
5. Integrate offer validation from sections 01–02 and publish capability
   changes with revision/expiry.

## Acceptance

Focused tests demonstrate honest readiness, authenticated reconnect, bounded
replay, stale/fence rejection and explicit unknown/reconciling state. No
second WebSocket is created for MCP or External Agent features.

## Dependencies and handoff

Depends on sections 01, 02 and 03. Blocks execution/adapters and the local
connection UI.

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
