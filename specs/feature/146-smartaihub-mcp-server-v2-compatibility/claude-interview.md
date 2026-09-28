# Feature 146 planning decisions

This transcript records decisions already provided by the user in the preceding
design/specification review. No new clarification was required before planning.

## Scope

**Decision:** Implement the complete MCP compatibility path for Hermes CLI/Agent
and Hermes One on Windows/macOS, while preserving Worker App compatibility.

## User experience

**Decision:** A user who already has Hermes should connect with the fewest safe
steps. Device consent, visible connected-device inventory, expiry, and revoke
must remain under the user's own account. No mockup-only work is acceptable.

## Protocol surface

**Decision:** Implement and verify discovery, `tools/list`, `tools/call`,
`resources/list`, `resources/read`, health/ping, legacy compatibility, and
explicit HTTP method/CORS behavior. Keep `/` as the SmartAIHub web application.

## Files and media

**Decision:** MCP must reach only files and media the authenticated user may
access, including Library, R2-backed files, and Media History. Downloads must
use existing broker/ACL paths and work for images, video, and other permitted
file types.

## Security

**Decision:** Use the existing login/auth/device lineage and tenant isolation.
Tokens must be short-lived/rotatable, device-bound where paired, auditable,
revocable, and never exposed in Redis payloads, logs, URLs, or MCP results.

## Redis and rollout

**Decision:** Redis may hold ephemeral sessions, rate/replay cache, pairing state,
and coordination, but it must not replace durable job, credit, artifact, or
exactly-once idempotency records. Keep the tenant flag off until automated
server gates and real platform evidence pass.
