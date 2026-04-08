# Section 07: Legacy MCP Migration and Browser Gating

## Goal

Move the useful real legacy MCP behavior into the canonical public MCP truth model and keep browser MCP gated until its full policy posture can be preserved.

## Why this section exists

Legacy MCP already contains real value for workspace, drive, and orchestrator actions. At the same time, browser automation is one of the highest-risk surfaces in the platform. This section handles both truths: migrate what is real, and gate what is not yet safe to expose.

## Scope

1. Migrate or absorb real legacy behavior for:
   - workspace read/write/list tools
   - drive search/read/list/info tools
   - orchestrator room/work-item actions
2. Reuse safe Python proxy posture for drive-like tools where necessary.
3. Define the compatibility posture of legacy `/api/mcp/*` routes after migration.
4. Keep browser MCP hidden or feature-flagged until current browser policy, reservation, and billing controls are fully preserved.

## Suggested files

- `apps/web/server/_core/mcpRoutes.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- `apps/web/server/routes/browserTool.ts`
- `apps/web/server/services/browserPolicy*`

## Migration posture

The goal is not to keep two public truths forever. This section should decide, per migrated legacy capability, whether legacy routes become:

- internal compatibility only
- admin/internal only
- explicitly deprecated once parity is verified

## Browser posture

Browser MCP should stay fail-closed unless this section can preserve:

- tenant feature-flag checks
- domain allowlists
- reservation and refund behavior
- concurrency semaphores
- release and approval controls

## Design rules

- Do not rewrite proven legacy behavior if a migration adapter is simpler and safer.
- Do not expose browser MCP merely because the route exists elsewhere in the platform.
- Preserve owner and tenant context through Python proxies.
- Keep the post-migration product story simple: canonical public MCP first, legacy compatibility second.

## Testing first

- workspace migration tests
- drive proxy safety tests
- orchestrator migration tests
- legacy compatibility tests
- browser hidden-or-gated tests
- browser policy parity tests if the browser family is enabled

## Handoff to later sections

- Section 08 documents what remains gated, deprecated, or compatibility-only after migration.

## Implementation notes

- Canonical public MCP now exposes migrated workspace, drive, and orchestrator families through `apps/web/server/_core/mcpRegistry.ts`.
- Legacy compatibility surface `apps/web/server/_core/mcpRoutes.ts` was hardened:
  - removed `/mcp/*` aliases
  - stopped trusting tenant/user headers for orchestrator actions
  - isolated Python-tool caching by tenant and user
  - sanitized trace IDs
  - tightened file-extension rules
- Browser MCP remains gated in the registry.

## Verification

- `npm --prefix apps/web test -- server/_core/__tests__/mcpSecurityFixes.test.ts server/_core/__tests__/mcpGatewaySecurityFixes.test.ts`
