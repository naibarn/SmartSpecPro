# Research Notes

- `mediaTransportResolver.ts` currently calls `listMcpConnections` only when
  `input.mcpConnectionId` is absent. A caller-supplied stale ID bypasses fresh
  selection.
- `listMcpConnections` queries personal rows by tenant and owner, and shared
  rows through enabled non-deleted shares joined to active group membership.
- `assertMcpSharePolicyAllowed` re-reads the chosen connection and share, checks
  tenant/status/membership, then enforces asset/tool/model/approval/budget.
- One physical connection can appear more than once when shared through
  multiple eligible groups, so selection must compare unique connection IDs.
- `getMcpConnectionRuntime` already queries the tenant-scoped connection and
  provider template and decrypts the current token immediately before each MCP
  call. It has no credential cache.
- `isMcpProviderAuthError` currently treats every `403` and every occurrence of
  `forbidden` as authentication invalidation.
- Production evidence on 2026-07-19:
  - reconnect updated connection
    `b4f89074-4579-4d73-8c84-07abbd9af579`;
  - its token expires at 2026-07-20 06:55:55 UTC;
  - a provider `403 grace_daily_limit_reached` at 2026-07-19 07:24 UTC caused
    the database status to become `requires_reauth`;
  - group 2 has an enabled image/video share for this connection.
- SocratiCode status lookup failed because its transport was closed, so
  discovery used targeted `rg`, file reads, logs, and metadata-only DB queries.
