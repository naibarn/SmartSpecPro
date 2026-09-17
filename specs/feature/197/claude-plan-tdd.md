# Feature 197 TDD Plan

Use focused Cargo tests for Rust Runner behavior and Web Vitest for server/UI; tests precede implementation; no whole-repository typecheck.

## section-01-runner-contracts

Test protocol serialization/versioning, correlation, ACK idempotency, desired/observed/unknown state and stale fences.

## section-02-identity-and-discovery

Test registration/auth, revocation, snapshot expiry/revision, privacy redaction, path confinement and claims vs authorization.

## section-03-claims-and-leasing

Test competing claims, lease expiry, stale snapshot, resource wait, user-owned tools, high-impact enablement and local selector.

## section-04-control-and-recovery

Test disconnect/reconnect, duplicate/out-of-order events, restart, process recovery, cancellation cascade, handoff and deadlock guards.

## section-05-ui-and-mcp-boundary

Test Runner connection/device/capability/task state matrices, keyboard/responsive states and distinct MCP topology boundaries.

## section-06-migration-and-acceptance

Test staged migration, legacy compatibility, evidence weighting, learning safety, SLO and full cross-spec acceptance matrix.

