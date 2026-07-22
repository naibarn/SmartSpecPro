# Implementation Plan

## Objective

Make database state authoritative for MCP media connection selection on every
new invocation, including active group-shared connections, and prevent quota
errors from invalidating authentication state.

## Changes

### Fresh selection

Update `mediaTransportResolver.ts` so the MCP branch always calls
`listMcpConnections`. Filter the fresh rows by connected status, requested
provider, and asset type. Group rows by physical connection ID.

If exactly one physical connection remains, choose it regardless of a stale
caller ID. If several remain, accept the caller ID only when present in the
fresh eligible set, otherwise use a personal default when available. Reject
ambiguous selection.

Continue calling `assertMcpSharePolicyAllowed` after selection. Do not trust a
client group ID: the policy service already prefers it only when currently
eligible and otherwise chooses an enabled share backed by active membership.

### Authentication classification

Update `mcpMediaAdapter.ts` so only definitive authentication errors demote a
connection. A generic `403`, `forbidden`, quota, rate-limit, or entitlement
failure must leave status unchanged.

## Security Boundaries

- Every fresh list query is tenant- and actor-scoped.
- Shared rows require enabled, non-deleted shares and active group membership.
- The policy check revalidates connection status and all share restrictions.
- Runtime token loading remains tenant-scoped and DB-backed.
- No decrypted token is logged or persisted outside the existing runtime.

## Acceptance Criteria

- Stale client IDs cannot override the sole fresh eligible DB connection.
- A sole active group-shared connection is auto-selected and records the policy
  service's actual share/group.
- Multiple physical connections remain non-ambiguous and safe.
- Quota `403` does not cause `requires_reauth`.
- 401 and explicit expired-token failures still cause reauthentication.
- Targeted tests and web type checking pass.

## Rollout

After verification, repair only the identified production connection row when
its token is still unexpired, then restart/deploy through the existing service
workflow and run a production smoke check.
