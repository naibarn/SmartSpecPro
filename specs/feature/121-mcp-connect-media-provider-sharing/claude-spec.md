# Synthesized Specification: Feature 121 MCP Connect Media Provider Sharing

## Objective

Add user-managed remote MCP media-provider connections as an optional image/video generation transport beside the existing SmartSpecPro `gateway_api` path.

The feature is additive. `gateway_api` remains the default for existing jobs, public API calls, existing provider API keys, synchronous generation, and non-v1 surfaces. MCP Connect is introduced only for user-connected provider accounts and selected v1 media surfaces.

## V1 Scope

Implement MCP Connect only for:

1. Media Studio manual image/video generation.
2. Auto Storyboard Review generated image/video jobs that originate from scoped Media Studio/Marketplace production flows.
3. Marketplace Capture product-context image/video generation.
4. Storyboard Review video generation/regeneration.

Keep these out of v1 MCP transport:

- Presentation canvas regeneration.
- Video Editor direct generation.
- Presentation Article Generator media generation.
- Generic workflow nodes.
- Work automation outside Auto Storyboard Review.
- Public REST media API transport selection.
- Public SmartSpecPro MCP tool transport selection.
- Rich admin queue/audit filtering beyond minimal metadata display.

## Providers

Initial provider templates:

- Magnific MCP: `https://mcp.magnific.com`
- Higgsfield MCP: `https://mcp.higgsfield.ai/mcp`

Both are treated as remote MCP providers using provider account credits. SmartSpecPro must discover available tools through MCP `tools/list` and must not hardcode provider schemas beyond approved provider-template hints.

## Product Requirements

### Profile/Settings Connections

Users can:

- view approved MCP media provider templates;
- connect a provider through OAuth/sign-in;
- test health and refresh/reconnect;
- disconnect/revoke local access;
- set default transport preference: `gateway_api`, `mcp`, or `ask_each_time`;
- set default image/video MCP connection;
- view safe account labels, health, tool capability, usage, and credit-source status.

### Transport Resolution

Omitted transport always resolves to `gateway_api`.

MCP connection priority:

1. Explicit per-job UI selection.
2. Surface-scoped batch/default connection saved on the current storyboard/review/marketplace run.
3. User personal default for provider and asset type.
4. Single eligible shared connection only when the surface allows shared defaults.
5. `ask_each_time` forces picker display and blocks automatic MCP submission.
6. If no eligible MCP connection exists, return `connection_required` for MCP requests or use `gateway_api` only when transport was omitted.

Shared connections never silently override personal defaults.

### Group Sharing

Connection owners may share an MCP connection with selected same-tenant groups. Sharing is explicit and revocable.

Rules:

- owner can always use own connected account;
- non-owner use requires same tenant, connected status, active group membership, enabled share, allowed asset type/tool/model, and available budget/concurrency;
- owner or tenant admin may create/update/disable shares;
- shared users never see secrets or provider sessions;
- every shared use records owner, actor, group, connection, provider, asset type, tool, and job;
- tenant admins can force-disable MCP Connect or group sharing;
- shared video requires owner approval per job by default in v1.

## Architecture Requirements

Core components:

- MCP provider registry.
- MCP connection service.
- MCP OAuth broker.
- encrypted session/token store.
- MCP tool discovery/schema cache.
- media transport resolver.
- MCP media adapter.
- shared connection policy service.
- media job worker/status poller integration.
- audit/usage logger.
- Settings/Profile connection-management router.

## API Contracts

### Media Router

Extend async media procedures used by scoped surfaces:

- `media.generateImageAsync`
- `media.generateVideoAsync`
- `media.getTask`
- `media.listTasks`
- `media.cancelTask`

Add optional fields:

```ts
transport?: "gateway_api" | "mcp";
mcpConnectionId?: string;
sharedGroupId?: number;
idempotencyKey?: string;
```

Validation:

- default omitted `transport` to `gateway_api`;
- reject `mcpConnectionId` unless `transport === "mcp"`;
- reject `sharedGroupId` unless share policy allows it;
- keep `apiConfig`/`extraParams` behavior valid for `gateway_api`;
- for MCP, normalize fields and filter provider-specific arguments through discovered schema.

### Settings/Profile MCP Connection Router

Add authenticated tRPC connection-management procedures:

- `mcpConnections.listProviderTemplates`
- `mcpConnections.listConnections`
- `mcpConnections.startOAuth`
- `mcpConnections.completeOAuth`
- `mcpConnections.testConnection`
- `mcpConnections.reconnect`
- `mcpConnections.disconnect`
- `mcpConnections.updateDefaults`
- `mcpConnections.listShares`
- `mcpConnections.updateShare`
- `mcpConnections.listUsage`

All responses must be tenant-isolated and must include only safe labels/metadata, never token/session material.

## Data Model Requirements

Add Drizzle tables following local schema conventions:

- `mcp_provider_templates`
- `user_mcp_connections`
- `mcp_connection_group_shares`
- `mcp_tool_schema_cache`
- `mcp_connection_usage_events`
- `mcp_shared_video_approvals`

Important fields:

- connection lifecycle: `status`, `encryptedTokenRef`, `providerAccountLabel`, `providerAccountHash`, `tokenExpiresAt`, `scopes`, `lastErrorCode`, `lastErrorAt`, health/tool timestamps, defaults, lifecycle timestamps;
- share policy: asset types, allowed tools/models, daily limit, concurrency limit, video approval flag, timezone, lifecycle timestamps;
- usage events: owner, actor, group, provider, tool, media job, redacted metadata;
- shared video approvals: owner, actor, group, share, prompt/request hash, redacted summary, status, expiry, consumed media job.

Budget/concurrency:

- reserve atomically with job creation;
- release queued cancels;
- count processing cancels because provider credits may be consumed;
- daily window resolves tenant timezone, owner timezone, then UTC;
- concurrency counts queued and processing jobs.

## Security Requirements

- Encrypt tokens, refresh tokens, provider sessions, and MCP session identifiers.
- Use OAuth `state`, nonce, short TTL, replay protection, tenant/user/provider binding, and provider redirect allowlists.
- Support PKCE/client metadata where required by provider MCP auth.
- Never send raw provider session data or tokens to the browser.
- Redact provider responses before persistence.
- Treat MCP tool descriptions, schemas, and outputs as untrusted.
- SSRF-validate reference image/video URLs before provider call.
- Prevent prompt/tool injection from changing transport, connection, share, owner, budget, or destination.
- Rate limit connection creation, OAuth callbacks, health checks, and generation.
- Retain usage events according to tenant audit policy, redacted summaries for 30 days by default, schema snapshots for 90 days/latest 10 hashes, and OAuth state for 10 minutes.

## UI/UX Requirements

Add `MCP Connect` under Settings > Integrations, following current Google/OneDrive patterns.

Media Studio must show:

- transport selector;
- credit-source label;
- connection picker only for MCP;
- personal/shared badges;
- connect/reconnect CTA;
- task badges and history filters;
- explicit fallback/retry controls.

Auto Storyboard Review, Marketplace Capture, and Storyboard Review must show transport/provider account/credit-source metadata without disrupting current product/review workflows.

Future surfaces must not show MCP controls in v1.

## Rollout

Feature flags:

- `mcp_connect_enabled`
- provider flags for Magnific/Higgsfield
- group sharing flag
- per-surface flags for Media Studio, Auto Storyboard Review, Marketplace Capture, Storyboard Review
- asset flags for image/video
- schema cache, fallback, and provider-credit tracking flags

Rollout order:

1. schema/service alpha;
2. Media Studio Magnific image only;
3. Media Studio image/video for Magnific/Higgsfield;
4. scoped workflow beta;
5. group sharing beta;
6. limited production.

## Testing Requirements

Use TDD across:

- schema/migration tests;
- connection service/OAuth tests;
- transport resolver and MCP adapter unit tests;
- media router integration tests;
- group sharing and approval policy tests;
- Settings/Profile component tests;
- Media Studio and scoped workflow tests;
- Playwright E2E for connect/share/generate/fallback/revoke flows;
- security tests for secret redaction, cross-tenant denial, OAuth replay, SSRF validation, and prompt/tool-injection boundaries.

## Codebase Constraints

- Use `apps/web` TypeScript/tRPC/React/Drizzle conventions.
- Use existing `user_groups`/`group_members` tables and active-membership semantics.
- Follow Settings integration UI patterns from OneDrive/Google Drive.
- Keep `gateway_api` behavior green after every implementation section.
- Avoid unrelated dirty worktree files and unrelated refactors.
