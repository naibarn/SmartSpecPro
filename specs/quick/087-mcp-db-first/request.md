# Request

Permanently fix recurring MCP media-generation failures by resolving the
connection from the database for every invocation rather than trusting cached
browser state. When one eligible connection exists, use it without requiring a
selection. Active group-shared connections must work under their existing
tenant, membership, asset, tool, model, approval, and usage policies.

Also prevent non-authentication provider failures such as
`403 grace_daily_limit_reached` from demoting a valid connection to
`requires_reauth`.

## Constraints

- No new dependency or schema migration.
- No token or connection cache.
- Preserve multi-tenant and group-share isolation.
- Preserve async provider-job account affinity.
- Make focused changes in the shared resolver/adapter so all media surfaces
  receive the fix.

## Non-goals

- Removing multi-account support globally.
- Changing provider quota policy.
- Reworking the MCP OAuth flow.
