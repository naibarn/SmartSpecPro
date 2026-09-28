# MCP DB-First Connection Resolution Design

Date: 2026-07-19
Status: Approved for implementation

## Problem

MCP media generation can receive a connection ID restored from browser
`localStorage`. The server currently resolves a connection from the database
only when the caller supplies no ID. A stale caller ID can therefore survive a
provider reconnect.

Separately, the MCP media adapter classifies every provider `403` response as an
authentication failure. Provider quota errors such as
`grace_daily_limit_reached` consequently demote a valid, freshly reconnected
database row to `requires_reauth`. Later requests then report that no connected
account exists even though its token has not expired.

## Approved Behavior

1. Every new MCP media invocation must query eligible connections from the
   database. Browser state is a UI preference only and is never authoritative.
2. Eligibility remains tenant- and actor-scoped:
   - a personal connection must belong to the actor;
   - a shared connection must have an enabled share for a group in which the
     actor has active membership;
   - provider, asset type, tool, model, approval, and share limits remain
     enforced by the existing policy service.
3. When exactly one eligible connected account exists, the server selects it
   even if the caller submitted a stale connection ID or group ID.
4. When multiple eligible accounts exist, a caller selection may disambiguate
   them only if that ID appears in the freshly queried eligible set. Otherwise
   the server requires a valid selection rather than using stale state.
5. Runtime credentials continue to be loaded and decrypted directly from the
   selected database row for each provider invocation. No credential cache is
   introduced.
6. A connection is demoted to `requires_reauth` only for definitive
   authentication signals, including HTTP 401, explicit invalid/expired token
   messages, or explicit reauthentication requirements. A generic HTTP 403,
   quota limit, rate limit, or entitlement error must not change connection
   authentication state.

## Data Flow

1. A generation route calls the shared media transport resolver.
2. The resolver queries the actor's personal and actively shared MCP
   connections from the database.
3. It filters the fresh result by connected status, provider, and asset type.
4. It selects the sole eligible row, a fresh matching caller selection, or a
   personal default when multiple rows exist.
5. The existing share-policy service re-reads and validates the selected
   connection/share against tenant, active group membership, tool, model,
   approval, and usage limits.
6. The adapter reads the selected connection and encrypted token from the
   database immediately before calling the MCP provider.

Async job polling remains tied to the account that created the provider job.
This preserves provider-job ownership while still re-reading that account's
current credentials from the database.

## Failure Handling

- No eligible connection: return a clear connected-account requirement.
- Several eligible connections without a valid selection/default: require a
  selection.
- Stale selection with one eligible connection: transparently use the fresh
  eligible row.
- Expired/revoked credential: mark `requires_reauth`.
- Quota, rate-limit, or entitlement failure: preserve `connected` status and
  return the provider error.
- Database failure: fail closed; do not fall back to browser state or memory.

## Tests

- A stale caller connection ID is replaced by the only fresh eligible personal
  connection.
- A stale caller connection ID is replaced by the only fresh eligible shared
  connection, and the resolved group/share metadata is retained.
- Multiple eligible connections accept only a selection present in the fresh
  database result.
- A bare or quota-related `403` is not classified as an authentication failure.
- HTTP 401 and explicit expired-token errors remain authentication failures.
- Runtime connection loading continues to require tenant match, connected
  status, and a non-expired token.

## Deployment

After tests and type checks pass, the currently valid production Higgsfield
connection may be restored from `requires_reauth` to `connected` only after
verifying its token expiry is still in the future. The repair must update only
the identified tenant-scoped connection row and must not expose token material.
