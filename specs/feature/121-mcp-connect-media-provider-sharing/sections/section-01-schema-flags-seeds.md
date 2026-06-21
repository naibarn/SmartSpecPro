# Section 01: Schema, Feature Flags, and Provider Seeds

## Goal

Create the database and feature-flag foundation for MCP Connect without changing any runtime media behavior. After this section, all new tables, types, and flags exist, but user-facing MCP UI and MCP generation remain disabled.

## Scope

Create/modify:

- `apps/web/drizzle/schema.ts`
- generated Drizzle migration/snapshot files
- `apps/web/shared/featureFlags.ts`
- `apps/web/server/services/tenantFeatureFlagService.ts`
- `apps/web/scripts/seed-mcp-provider-templates.ts` or an existing seed script pattern
- `apps/web/server/services/__tests__/mcpProviderRegistry.test.ts`
- `apps/web/server/services/__tests__/mcpFeatureFlags.test.ts`

Do not modify media generation routing in this section.

## Data Model

Add Drizzle tables:

- `mcpProviderTemplates`
- `userMcpConnections`
- `mcpConnectionGroupShares`
- `mcpToolSchemaCache`
- `mcpConnectionUsageEvents`
- `mcpSharedVideoApprovals`

Use existing naming conventions from `apps/web/drizzle/schema.ts`: camelCase exports, snake_case database columns where existing local style does so, typed `jsonb/json` fields, tenant FK to `tenants.id`, user FK to `users.id`, integer `groupId` FK to `userGroups.id`, and indexes in the `pgTable` callback.

## Required Constraints

- Provider templates: unique `providerKey`, unique `mcpUrl`, index enabled state.
- Connections: indexes by tenant/owner/status, tenant/provider/status, tenant/provider/account hash, token expiry; one active image default and one active video default per owner/provider.
- Connections: include encryption key/version metadata or equivalent decrypt/reencrypt metadata for encrypted session references.
- Group shares: unique active share by tenant/connection/group with soft-delete, indexes by group and connection enabled state.
- Schema cache: lookup by provider/tool, connection/tool, expiry, current schema hash.
- Usage events: indexes for tenant/connection/date, owner/date, actor/date, group/date, media job.
- Shared video approvals: one approval can be consumed by one job only; index pending/expiry lookups.

## Provider Seeds

Seed provider templates:

- `magnific` with MCP URL `https://mcp.magnific.com`
- `higgsfield` with MCP URL `https://mcp.higgsfield.ai/mcp`

Seeds must be idempotent. Keep provider template `isEnabled` compatible with feature flags and safe to run repeatedly.

## Migration Rollback And Data Safety

- Before production use, generated rollback can remove newly added empty tables according to local migration conventions.
- After any customer connection/share/usage data exists, rollback must prefer disabling MCP feature flags over dropping tables.
- Destructive rollback of MCP tables requires explicit operator backup/export and data-destruction approval.
- Foreign-key behavior must preserve auditability: deleting/disabling connections must not orphan usage events, approvals, or share history required for tenant audit retention.

## UI/UX Contract

### Target User / JTBD
N/A for this section. It is schema/flag foundation only.

### Surface Inventory
N/A. No browser-visible surfaces are modified.

### Component Map
N/A. No frontend components are created or modified.

### State Matrix
N/A. Runtime UI states are covered in Sections 05-08.

### Responsive Matrix
N/A. No browser layout changes.

### Accessibility Acceptance
N/A. No interactive UI changes.

### Copy Contract
N/A. No user-facing copy changes.

### Browser Evidence Required
Skipped for this section because it has no browser-visible behavior.

## Feature Flags

Add exported TypeScript keys and defaults:

| Spec flag | TypeScript key | Default |
|---|---|---|
| `mcp_connect_enabled` | `mcpConnectEnabled` | false |
| `mcp_connect_magnific_enabled` | `mcpConnectMagnificEnabled` | false |
| `mcp_connect_higgsfield_enabled` | `mcpConnectHiggsfieldEnabled` | false |
| `mcp_connect_group_sharing_enabled` | `mcpConnectGroupSharingEnabled` | false |
| `mcp_media_studio_enabled` | `mcpMediaStudioEnabled` | false |
| `mcp_auto_storyboard_review_enabled` | `mcpAutoStoryboardReviewEnabled` | false |
| `mcp_marketplace_capture_enabled` | `mcpMarketplaceCaptureEnabled` | false |
| `mcp_storyboard_review_enabled` | `mcpStoryboardReviewEnabled` | false |
| `mcp_media_image_enabled` | `mcpMediaImageEnabled` | false |
| `mcp_media_video_enabled` | `mcpMediaVideoEnabled` | false |
| `mcp_tool_schema_cache_enabled` | `mcpToolSchemaCacheEnabled` | false |
| `mcp_auto_fallback_to_gateway_api_enabled` | `mcpAutoFallbackToGatewayApiEnabled` | false |
| `mcp_provider_credits_tracked_enabled` | `mcpProviderCreditsTrackedEnabled` | false |

The shared exported TypeScript keys are the canonical runtime keys. Logs/audit may include spec snake_case names only through a shared mapping helper.

## Tests First

Write tests before implementation:

- Test: all new tables are represented in Drizzle schema and migration.
- Test: provider template uniqueness constraints exist.
- Test: connection default uniqueness is enforced.
- Test: connection schema includes encryption key/version metadata or equivalent encrypted-reference metadata.
- Test: group share uses integer `groupId` compatible with `user_groups.id`.
- Test: usage event indexes cover owner, actor, group, connection, and media job.
- Test: shared video approval can be consumed once only.
- Test: all MCP flags default to disabled.
- Test: tenant flag validation rejects arbitrary MCP-like keys not in allowlist.
- Test: provider seed is idempotent and does not duplicate rows.
- Test: migration rollback guidance is documented as flag rollback after production data exists.

Test file targets:

- `apps/web/server/services/__tests__/mcpProviderRegistry.test.ts`
- `apps/web/server/services/__tests__/mcpFeatureFlags.test.ts`

Verification commands:

- `cd apps/web && npm test -- server/services/__tests__/mcpProviderRegistry.test.ts server/services/__tests__/mcpFeatureFlags.test.ts`
- `cd apps/web && npm run check`

## Acceptance Criteria

- `gateway_api` runtime behavior is untouched.
- New schema compiles with TypeScript.
- Migration files are generated and reviewable.
- Feature flags are typed and default false.
- Seed script can be run more than once safely.
- Focused schema/flag tests pass.
