# User-Connected MCP Model Filter Design

## Goal

Hide Higgsfield and Magnific MCP media models from user-facing selectors unless
the current user has an active personal connection or an active shared
connection in the current tenant. A disconnected, revoked, or otherwise
non-connected connection must not make its provider models selectable.

## Architecture

- Keep the global model registry provider-agnostic and cacheable.
- Add a user/tenant-scoped MCP availability query based on
  `user_mcp_connections`, `mcp_connection_group_shares`, `group_members`, and
  `mcp_provider_templates`.
- Treat a provider as available when the connection is `connected`,
  `revokedAt` is null, the template is enabled, and the user is either the
  connection owner or an active member of an enabled share.
- Apply this filter at user-facing catalog boundaries, including
  `mediaModels.list` and the Vertical Drama special tie-in model endpoint.
- Keep backend generation validation as the final guard for stale selections.

## Failure and consistency behavior

- No eligible MCP connection means all MCP models are omitted; non-MCP models
  remain unchanged.
- Personal and shared access use the same eligibility rule.
- Disconnect/revoke changes take effect on the next catalog request and must
  not be hidden by a global model cache.
- Existing admin catalogs remain able to inspect configured model/provider rows.

## Verification

- Unit-test personal, shared, disconnected, revoked, and non-MCP cases.
- Test the public model catalog and Vertical Drama special tie-in catalog.
- Run focused server/client tests and `git diff --check`.
- Browser, live database, provider OAuth, and deployment verification remain
  environment-specific and are not claimed by local tests.
