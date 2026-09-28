# Decision Log

## Depth

Standard quick plan. The fix crosses two shared backend services plus targeted
tests, but requires no schema or public API change.

## Decisions

1. Always call `listMcpConnections` for MCP resolution, even when the request
   contains an ID.
2. De-duplicate eligible results by physical connection ID.
3. Select in this order:
   - sole eligible physical connection;
   - fresh eligible caller-selected connection;
   - personal default;
   - otherwise require selection.
4. Pass the selected connection to the existing share-policy service; use the
   share returned by that service as authoritative group metadata.
5. Remove generic `403` and `forbidden` matching from auth invalidation while
   retaining explicit invalid/expired-token, unauthorized, 401, and
   reauthentication signals.

## Stabilization Reviews

1. Completeness: added group-shared connection acceptance and stale group-ID
   handling.
2. Contradiction check: preserved multi-account selection instead of always
   choosing an arbitrary row.
3. Security check: retained tenant, active membership, and share-policy
   validation after fresh selection.
4. Failure-mode check: DB failure remains fail-closed; no browser fallback.
5. Final improvement check: de-duplicated multiple group shares for one physical
   connection so it remains an unambiguous single account.

Rounds 4 and 5 produced no further meaningful plan changes.
