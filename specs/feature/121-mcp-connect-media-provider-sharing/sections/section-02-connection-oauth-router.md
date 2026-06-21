# Section 02: Connection Service, OAuth Broker, and tRPC Router

## Goal

Implement authenticated MCP connection management for Settings/Profile. This section lets users connect, test, reconnect, disconnect, list, and safely inspect MCP provider accounts, but does not yet route media generation through MCP.

## Depends On

- Section 01 schema, provider templates, and feature flags.

## Files

Create:

- `apps/web/server/routers/mcpConnections.ts`
- `apps/web/server/services/mcpProviderConfigService.ts` or reuse an existing admin/provider settings service for UI-managed MCP provider config
- `apps/web/server/services/mcpProviderRegistry.ts`
- `apps/web/server/services/mcpConnectionService.ts`
- `apps/web/server/services/mcpOAuthBroker.ts`
- `apps/web/server/services/mcpToolSchemaCacheService.ts`
- `apps/web/server/routers/__tests__/mcpConnections.test.ts`
- `apps/web/server/services/__tests__/mcpConnectionService.test.ts`
- `apps/web/server/services/__tests__/mcpOAuthBroker.test.ts`
- `apps/web/server/services/__tests__/mcpToolSchemaCacheService.test.ts`
- `apps/web/client/src/pages/__tests__/AdminSettings.mcpProviderConfig.test.tsx` or equivalent existing provider config UI test
- `apps/web/client/src/pages/__tests__/TenantSettings.mcpFeatureFlags.test.tsx` or equivalent tenant feature flag UI test

Modify:

- `apps/web/server/routers.ts` to register `mcpConnections`
- existing admin/provider settings router to expose masked MCP provider config and readiness checks
- `apps/web/client/src/pages/AdminSettings.tsx` or existing provider/admin config page for platform-managed MCP provider settings
- `apps/web/client/src/pages/TenantSettings.tsx` or existing tenant feature-flag UI for tenant MCP rollout flags
- route registry later consumed by UI callback in Section 05

## Router Contract

Expose authenticated tRPC procedures:

- `listProviderTemplates`
- `listConnections`
- `startOAuth`
- `completeOAuth`
- `testConnection`
- `reconnect`
- `disconnect`
- `updateDefaults`
- `listShares`
- `updateShare`
- `listUsage`

Sharing procedures may call placeholder policy helpers until Section 03 implements full budgets/approvals, but they must fail closed when group sharing is disabled.

## OAuth Requirements

## UI-Managed Config Contract

Use existing settings/admin UI patterns. Do not hardcode provider secrets or callback origins, and do not require operators to edit `.env` files for MCP provider setup.

Required UI-managed config/settings:

- callback base URL and allowlisted redirect origins, or a pointer to the existing canonical app URL setting
- provider timeout and retry settings
- schema cache TTL
- Magnific provider OAuth/client metadata when Magnific flag is enabled
- Higgsfield provider OAuth/client metadata when Higgsfield flag is enabled
- masked provider client secret fields with write-only update behavior

Infrastructure-only secrets:

- existing platform signing/encryption secrets may be reused by backend services;
- MCP must not introduce new feature-specific env-file edits for provider config;
- encryption key changes must not be treated as ordinary config rotation; session refs need key/version metadata and any rotation requires planned decrypt/reencrypt or forced reconnect.

Rules:

- platform admin config updates must be saved through UI and audited;
- tenant admin rollout flags must be saved through tenant settings/feature flag UI;
- read APIs return masked configured/not-configured values only;
- enabled provider flags require complete UI-managed provider config;
- disabled provider flags may leave provider-specific metadata unset;
- callback base URL must match allowlisted redirect origins;
- config validation failures must fail closed before OAuth starts.

`startOAuth` must:

- require `mcpConnectEnabled`;
- require provider-specific flag;
- validate provider template URL against approved templates;
- create state, nonce, optional PKCE data, tenant/user/provider binding, expiry;
- return only an authorization URL and state handle safe for browser use.

`completeOAuth` must:

- validate state, nonce, expiry, user, tenant, provider;
- reject replay;
- exchange provider credentials/session through the selected MCP provider flow;
- store only encrypted session/token reference plus encryption key/version metadata or equivalent decrypt/reencrypt metadata;
- store safe provider account label/hash, scopes, expiry, status;
- trigger initial tool discovery where possible.

`disconnect` must:

- mark connection `revoked` or `disabled` before provider-side revocation;
- remove or invalidate decryptable session material where the existing encrypted-secret storage pattern supports it;
- preserve safe label/hash and audit metadata for historical usage;
- disable shares for revoked connections so group members cannot submit new jobs.

## Safe Response Shape

Responses may include:

- connection ID;
- provider key/display name;
- safe provider account label;
- status/health;
- owner display label;
- shared group label;
- allowed asset types/tools/models;
- timestamps and redacted errors.

Responses must never include raw tokens, refresh tokens, encrypted token refs, provider session IDs, raw provider account IDs, raw `tools/list`, or raw provider payloads.

## UI/UX Contract

### Target User / JTBD
- Role: platform admin configuring provider settings; tenant admin controlling rollout flags.
- Goal: configure MCP provider readiness through UI without editing env files.
- Entry point: existing Admin Settings/provider config and Tenant Settings/feature flag surfaces.
- Success outcome: enabled providers have validated masked config; disabled providers can remain unconfigured; tenant rollout state is visible and auditable.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Platform Admin Settings/provider config | `AdminSettings.tsx` or existing provider config page | MCP provider OAuth/client metadata, callback/redirect allowlist, timeout/retry/schema TTL, readiness test |
| Tenant Settings/feature flags | `TenantSettings.tsx` or existing tenant feature flag UI | MCP global/provider/surface/group-sharing toggles |

### Component Map
| Component | Owns | Consumes |
|---|---|---|
| MCP provider config panel | masked provider config fields and readiness action | admin/provider settings router |
| MCP tenant rollout controls | feature flag toggles and effective policy labels | tenant feature flag router |

### State Matrix
Cover: loading config, disabled provider unconfigured, enabled provider missing config, configured masked secret, readiness pass/fail, save pending, validation error, tenant flag disabled/enabled.

### Responsive Matrix
Use existing admin/settings responsive patterns; fields must not overflow on 390x844 mobile and 768x1024 tablet.

### Accessibility Acceptance
Masked secret fields, toggles, readiness buttons, and validation errors must have labels and keyboard focus states.

### Copy Contract
Use existing admin settings tone. Required labels: `Configured`, `Not configured`, `Test provider connection`, `Callback URL`, `Redirect allowlist`, `Save provider settings`.

### Browser Evidence Required
Record screenshots or section evidence for provider config missing, configured masked secret, readiness failure, and tenant flag disabled/enabled states.

## MCP Client Dependency Policy

Before implementation, check whether a suitable MCP client already exists. If not:

- use the official MCP TypeScript SDK only when dependency review proves the provider Streamable HTTP/OAuth behavior cannot be implemented safely with the internal provider-template-only helper;
- otherwise implement a small provider-template-only Streamable HTTP JSON-RPC helper;
- do not add arbitrary custom MCP server support.

Any new dependency must be justified and tested in this section.

## Tests First

- Test: unauthenticated router calls are rejected.
- Test: disabled global flag rejects `startOAuth`.
- Test: disabled provider flag rejects provider connect.
- Test: `startOAuth` creates signed state/nonce with tenant/user/provider/expiry.
- Test: expired/replayed/mismatched callback fails.
- Test: successful callback stores encrypted session reference and safe label.
- Test: successful callback stores encryption key/version metadata without exposing it to clients.
- Test: `listConnections` redacts all secret fields.
- Test: `disconnect` blocks new use before attempting provider revocation.
- Test: `disconnect` invalidates/removes decryptable session material while preserving safe audit labels.
- Test: `testConnection` moves invalid/expired session to `requires_reauth`.
- Test: `updateDefaults` enforces one default image/video connection per owner/provider.
- Test: enabled provider with missing config fails closed.
- Test: disabled provider permits missing provider-specific metadata.
- Test: provider config can be saved only through authenticated admin UI/router path, not env-file-dependent code.
- Test: config read responses return masked secret state only.
- Test: tenant rollout flags can be changed through tenant settings/feature flag UI.

Test file targets:

- `apps/web/server/routers/__tests__/mcpConnections.test.ts`
- `apps/web/server/services/__tests__/mcpConnectionService.test.ts`
- `apps/web/server/services/__tests__/mcpOAuthBroker.test.ts`
- `apps/web/server/services/__tests__/mcpToolSchemaCacheService.test.ts`
- `apps/web/client/src/pages/__tests__/AdminSettings.mcpProviderConfig.test.tsx`
- `apps/web/client/src/pages/__tests__/TenantSettings.mcpFeatureFlags.test.tsx`

Verification commands:

- `cd apps/web && npm test -- server/routers/__tests__/mcpConnections.test.ts server/services/__tests__/mcpConnectionService.test.ts server/services/__tests__/mcpOAuthBroker.test.ts server/services/__tests__/mcpToolSchemaCacheService.test.ts`
- `cd apps/web && npm test -- client/src/pages/__tests__/AdminSettings.mcpProviderConfig.test.tsx client/src/pages/__tests__/TenantSettings.mcpFeatureFlags.test.tsx`
- `cd apps/web && npm run check`

## Acceptance Criteria

- `mcpConnections` router is registered and type-safe.
- OAuth state is one-time-use and tenant/user bound.
- No secret fields reach API responses or logs.
- Connection lifecycle can be tested without media generation.
