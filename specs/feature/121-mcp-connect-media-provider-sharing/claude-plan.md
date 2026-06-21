# Implementation Plan: Feature 121 MCP Connect Media Provider Sharing

## 1. Objective

Build MCP Connect as an optional user-account media generation transport for SmartSpecPro. Users can connect approved remote MCP media providers, initially Magnific and Higgsfield, then use those accounts to generate images/videos from selected v1 surfaces. Account owners can optionally share a connection with selected same-tenant groups.

This plan is additive. It must preserve the current `gateway_api` media path as the default and must not regress existing media generation, public REST media APIs, public SmartSpecPro MCP tools, or non-v1 media surfaces.

## 2. Baseline To Preserve

Preserve these behaviors:

- Existing `media.generateImageAsync`, `media.generateVideoAsync`, `media.getTask`, list/poll/history behavior, credit reconciliation, abuse guard, rate limiting, and SSRF/reference validation for `gateway_api`.
- Existing synchronous `media.generateImage` and `media.generateVideo` remain `gateway_api` only.
- Existing public REST media APIs and public SmartSpecPro MCP tools keep omitting `transport` and therefore keep using `gateway_api`.
- Existing Media Studio model/dynamic-field behavior, Marketplace Capture product/evidence metadata, Auto Storyboard Review run/stage behavior, and Storyboard Review draft/task behavior remain intact.
- Existing `user_groups` and `group_members` semantics remain authoritative for group membership.

## 3. High-Level Architecture

Target flow:

```text
Settings/Profile
  -> mcpConnections.startOAuth
  -> provider OAuth/sign-in popup
  -> mcpConnections.completeOAuth
  -> encrypted session reference + tool discovery

Scoped media surface
  -> transport selector/default resolution
  -> media.generateImageAsync/generateVideoAsync
  -> Media Transport Resolver
     -> gateway_api: existing mediaGenerationService path
     -> mcp: connection policy + schema-filtered MCP adapter
  -> media task/history/result metadata
  -> polling/status/fallback/cancel
```

Key principle: transport selection happens at the SmartSpecPro media boundary. Do not create separate MCP-only queues or MCP-only media history.

## 4. Files And Modules

### New Backend Modules

| File | Purpose |
|---|---|
| `apps/web/server/routers/mcpConnections.ts` | Authenticated tRPC router for provider templates, OAuth, connections, defaults, shares, usage |
| `apps/web/server/services/mcpProviderRegistry.ts` | Approved provider templates, endpoint validation, tool hints, feature flag filtering |
| `apps/web/server/services/mcpConnectionService.ts` | Connection lifecycle, safe labels, encrypted session refs, health state, disconnect/reconnect |
| `apps/web/server/services/mcpOAuthBroker.ts` | OAuth state/nonce/PKCE metadata, callback validation, replay protection |
| `apps/web/server/services/mcpToolSchemaCacheService.ts` | `tools/list` cache, schema hashes, TTL refresh, schema mismatch handling |
| `apps/web/server/services/mcpConnectionSharingService.ts` | Owner/group sharing policy, active membership checks, budgets, concurrency, approvals |
| `apps/web/server/services/mediaTransportResolver.ts` | Deterministic `gateway_api`/`mcp` resolution and validation |
| `apps/web/server/services/mcpMediaAdapter.ts` | Normalized request to MCP tool call mapping, async polling/waiting, cancel support |
| `apps/web/server/services/mcpUsageRetentionService.ts` | Retention purge/compaction for summaries, schema snapshots, OAuth state |
| `apps/web/server/jobs/mcpUsageRetentionJob.ts` | Scheduled retention wrapper invoked from server startup or the existing job scheduler pattern |
| `apps/web/shared/mcpToolSchemaProjection.ts` | Shared projection from MCP input schema into safe dynamic-field metadata |

### New Test Fixtures And Helpers

| File | Purpose |
|---|---|
| `apps/web/server/services/__tests__/fixtures/mcpProviderTestHarness.ts` | In-process mocked MCP provider responses for `tools/list`, `tools/call`, status, cancellation, schema changes, quota errors, and expired sessions |
| `apps/web/tests/e2e/fixtures/mcpConnectFixtures.ts` | Playwright fixture/state setup for connected, expired, shared, denied, and fallback MCP accounts without live provider credentials |

Default automated tests must use mocked providers/fixtures. Provider sandbox or live-account checks are optional release evidence only and must never be required for deterministic CI.

### Existing Backend Files To Modify

| File | Change |
|---|---|
| `apps/web/drizzle/schema.ts` | Add MCP tables and exported types |
| `apps/web/server/routers.ts` | Register `mcpConnections` router |
| `apps/web/server/routers/media.ts` | Extend async media inputs and route MCP requests through resolver/adapter |
| `apps/web/server/services/mediaGenerationService.ts` | Modify only after the Section 04 decision checklist proves task metadata/cancel normalization cannot stay in `media.ts` and new MCP services |
| `apps/web/server/routers/marketplaceCapture.ts` | Accept/store scoped transport metadata for marketplace generation defaults |
| `apps/web/server/services/marketplaceAutoReviewService.ts` | Propagate transport metadata through run/stage/media task handoff |
| `apps/web/server/routers/videoEditorProjects.ts` | Preserve Storyboard Review task transport metadata where video generation is submitted |
| `apps/web/shared/featureFlags.ts` | Add tenant flag keys/defaults |
| `apps/web/server/services/tenantFeatureFlagService.ts` | Include MCP flags in tenant flag validation/allowlist so admins cannot persist arbitrary flag keys |

### New Frontend Modules

| File | Purpose |
|---|---|
| `apps/web/client/src/components/settings/McpConnectPanel.tsx` | Settings > Integrations MCP connection management |
| `apps/web/client/src/pages/McpConnectCallback.tsx` | OAuth popup callback page for provider redirects |
| `apps/web/client/src/components/media/McpTransportSelector.tsx` | Reusable transport selector/credit source/connection picker |
| `apps/web/client/src/components/media/McpConnectionPicker.tsx` | Personal/shared connection chooser with health and owner/group labels |
| `apps/web/client/src/components/media/McpCreditSourceBadge.tsx` | Compact label for SmartSpecPro credits vs provider account credits |

### Existing Frontend Files To Modify

| File | Change |
|---|---|
| `apps/web/client/src/pages/Settings.tsx` | Add `McpConnectPanel` under Integrations |
| `apps/web/client/src/pages/AdminSettings.tsx` or existing provider/admin config surface | Add MCP provider configuration panel for platform-managed provider OAuth/client settings |
| `apps/web/client/src/pages/TenantSettings.tsx` or existing tenant feature-flag UI | Expose tenant MCP rollout flags/policy switches through UI |
| `apps/web/client/src/App.tsx` or the current route registry | Register the MCP OAuth callback route |
| `apps/web/client/src/pages/MediaStudio.tsx` | Add transport selector, picker, badges, fallback UI, metadata submission |
| `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx` | Add scoped transport display/defaults for product-context generation and auto review |
| `apps/web/client/src/pages/StoryboardReviewPage.tsx` | Add transport/connection selection for selected video tasks and fallback confirmation |
| `apps/web/client/src/lib/storyboardReviewWorkspace.ts` | Extend draft/task metadata with transport fields while preserving old drafts |

### UI-Managed Configuration Contract

MCP Connect configuration must follow the same UI-managed settings pattern as other SmartSpecPro options. Do not require operators or developers to edit `.env` files for MCP provider configuration, callback origins, timeout/retry values, schema TTLs, provider enablement, or tenant rollout flags.

Configuration ownership:

| Layer | UI owner | Examples |
|---|---|---|
| Platform admin | Existing `/admin/settings`, provider config, or media-provider admin surface | Approved provider templates, Magnific/Higgsfield OAuth/client metadata, masked client secrets, callback base URL/allowed redirects, provider timeout, retry limit, schema TTL, provider readiness test |
| Tenant admin | Existing `/domain-admin/settings` or tenant feature-flag UI | Global MCP enablement for tenant, provider allow/deny, surface flags, image/video flags, group sharing policy |
| User | Existing `/settings` profile/integrations UI | Personal provider account OAuth connection, personal defaults, share settings for owned connections |

Rules:

- no MCP-specific `MCP_CONNECT_*` environment variables are required for rollout or provider setup;
- platform and tenant config writes must be audited and masked/redacted in responses;
- secret values entered through UI are stored through the existing encrypted-secret storage pattern and displayed only as configured/not-configured masks;
- server-side validation must fail closed when UI-managed provider config is missing for an enabled provider;
- disabled provider flags may leave provider-specific UI-managed metadata unset;
- callback base URL and redirect origins must be configured/validated through UI-managed settings or derived from an existing canonical app URL setting, never from user input;
- tests must cover missing UI config, disabled-provider no-op, enabled-provider failure, masked secret reads, and audited config updates.

Existing infrastructure secrets used by the platform, such as the general encryption/signing secret already required by SmartSpecPro, remain infrastructure-owned. MCP implementation must not introduce a new per-feature env-file editing requirement.

### Canonical Cross-Section Contracts

Implement shared TypeScript contracts once and import them from server, shared, and client code instead of redefining literals in each section. Prefer existing shared type locations if the repo already has a media contract module; otherwise add a narrow `apps/web/shared/mcpConnectTypes.ts`.

Required canonical fields:

```ts
type MediaTransport = "gateway_api" | "mcp";
type MediaAssetType = "image" | "video";
type MediaOriginSurface =
  | "media_studio"
  | "auto_storyboard_review"
  | "marketplace_capture"
  | "storyboard_review";
type McpCreditPolicy = "smartspec_credits" | "provider_credits_tracked";
type McpConnectionScope = "personal" | "shared";
```

`MediaTaskTransportMetadata` must be the single persisted metadata shape used by `media.ts`, task polling/listing, UI badges, usage events, and E2E assertions:

```ts
interface MediaTaskTransportMetadata {
  transport: MediaTransport;
  originSurface: MediaOriginSurface;
  provider: string;
  model?: string;
  assetType: MediaAssetType;
  mcpConnectionId?: string;
  connectionScope?: McpConnectionScope;
  connectionOwnerUserId?: number;
  actorUserId: number;
  sharedGroupId?: number;
  mcpToolName?: string;
  mcpSchemaHash?: string;
  providerJobId?: string;
  fallbackFromTransport?: "mcp";
  fallbackReason?: string;
  creditPolicy: McpCreditPolicy;
}
```

Compatibility requirements:

- missing metadata on legacy tasks is treated as `transport=gateway_api`;
- UI and logs must render safe labels derived from IDs, not raw provider account data;
- section 04 owns resolver/router persistence tests for this shape;
- sections 06-08 must consume this shape without creating surface-specific variants;
- section 09 E2E must assert the same fields appear in status/history evidence.

## 5. Data Model And Migration

Add Drizzle schema definitions and migration snapshots for:

### `mcp_provider_templates`

Approved provider templates. Seed Magnific and Higgsfield.

Important fields:

- `id`
- `providerKey`
- `displayName`
- `mcpUrl`
- `authType`
- `allowedAssetTypes`
- `expectedToolHints`
- `isEnabled`
- timestamps

Indexes/constraints:

- unique `providerKey`;
- unique `mcpUrl`;
- index `isEnabled`.

### `user_mcp_connections`

User-owned connection records.

Important fields:

- tenant and owner IDs;
- provider template FK;
- display name and safe provider account label/hash;
- status: `connected`, `requires_reauth`, `disabled`, `revoked`, `error`;
- encrypted token/session reference;
- encryption key/version metadata for decrypt/reencrypt support;
- token expiry/scopes/last error/health/tool discovery timestamps;
- per-owner image/video defaults;
- lifecycle timestamps.

Indexes/constraints:

- `(tenantId, ownerUserId, status)`;
- `(tenantId, providerTemplateId, status)`;
- `(tenantId, providerTemplateId, providerAccountHash)`;
- `tokenExpiresAt`;
- one active default image/video connection per owner/provider.

### `mcp_connection_group_shares`

Explicit group share policy.

Important fields:

- tenant, connection, group;
- enabled state;
- allowed asset types, tools, models;
- daily use limit, concurrency limit, video approval requirement, timezone;
- creator and lifecycle timestamps.

Indexes/constraints:

- FK `groupId` to existing integer `user_groups.id`;
- unique active share per `(tenantId, connectionId, groupId)`;
- indexes by group and connection enabled state.

### `mcp_tool_schema_cache`

Cached provider `tools/list` schemas by provider/connection/tool/schema hash with expiry.

### `mcp_connection_usage_events`

Redacted audit/usage trail. Do not store raw prompts, raw reference URLs, provider sessions, tokens, or full provider responses.

### `mcp_shared_video_approvals`

One-time owner approval for shared video jobs. Approval consumption must be atomic with media job creation.

### Migration Strategy

1. Add schema and migrations first.
2. Seed provider templates with disabled-by-default state unless rollout flags are on.
3. Add migration/schema tests before service code.
4. No existing data backfill is required because missing transport means `gateway_api`.
5. Migration rollback must be data-safe after production use: do not drop MCP connection, share, usage, approval, or schema-cache tables containing customer/audit data without an explicit operator backup/export and data-destruction approval.
6. Rollback for runtime launch should prefer disabling feature flags over reverting schema once connection records may exist.

### Secret And Data Lifecycle

- Store provider OAuth/session material only through the existing encrypted-secret storage pattern.
- Persist an encryption key/version identifier or equivalent metadata with each encrypted session reference so future re-encryption can be audited.
- Do not rotate the underlying DB encryption key by simply changing an environment value; rotation requires a deliberate decrypt/reencrypt migration or forced provider reconnect plan.
- `disconnect`/`revoked` blocks new use immediately, removes or invalidates decryptable session material where the storage pattern supports it, and keeps only safe labels/hashes/audit metadata.
- `disabled` preserves reconnectable session material only when the user/admin expects temporary disable; UI/API responses still never expose token refs.
- Provider account hashes must use a tenant-scoped keyed hash or equivalent non-reversible duplicate-detection value, never a raw provider user ID.
- Retention may compact redacted summaries but must keep audit rows required by tenant policy and must not orphan usage events from connection/share records needed for audit.

## 6. Feature Flags

Add tenant feature flags to `apps/web/shared/featureFlags.ts`:

| Spec flag | TypeScript key |
|---|---|
| `mcp_connect_enabled` | `mcpConnectEnabled` |
| `mcp_connect_magnific_enabled` | `mcpConnectMagnificEnabled` |
| `mcp_connect_higgsfield_enabled` | `mcpConnectHiggsfieldEnabled` |
| `mcp_connect_group_sharing_enabled` | `mcpConnectGroupSharingEnabled` |
| `mcp_media_studio_enabled` | `mcpMediaStudioEnabled` |
| `mcp_auto_storyboard_review_enabled` | `mcpAutoStoryboardReviewEnabled` |
| `mcp_marketplace_capture_enabled` | `mcpMarketplaceCaptureEnabled` |
| `mcp_storyboard_review_enabled` | `mcpStoryboardReviewEnabled` |
| `mcp_media_image_enabled` | `mcpMediaImageEnabled` |
| `mcp_media_video_enabled` | `mcpMediaVideoEnabled` |
| `mcp_tool_schema_cache_enabled` | `mcpToolSchemaCacheEnabled` |
| `mcp_auto_fallback_to_gateway_api_enabled` | `mcpAutoFallbackToGatewayApiEnabled` |
| `mcp_provider_credits_tracked_enabled` | `mcpProviderCreditsTrackedEnabled` |

The exported TypeScript keys are the only keys the client and server should use. When logs/audit events need spec names, map through the same shared mapping table rather than duplicating string literals.

Default all new flags to false except non-user-facing internal schema cache behavior if the service can safely no-op.

Server enforcement is required. UI gates are helpful but not sufficient.

### Admin/Ops Rollout Control

V1 uses existing admin/tenant settings UI surfaces for rollout and provider setup. Do not require direct env-file edits for MCP configuration.

Requirements:

- server-side checks must read current flags for every connect/share/generate operation, not rely on UI visibility;
- platform admins configure provider OAuth/client metadata, callback origins, timeout/retry limits, and schema TTL through existing admin/provider settings UI with masked secret fields;
- tenant admins configure tenant rollout flags and group-sharing policy through existing tenant settings/feature-flag UI;
- disabling `mcpConnectEnabled` blocks new OAuth starts, new MCP jobs, and shared MCP use while preserving stored connections and audit history;
- disabling provider flags blocks only that provider;
- disabling surface flags forces that surface back to omitted transport/`gateway_api`;
- disabling group sharing blocks new shared jobs while owner personal use can remain enabled;
- already-running MCP jobs may finish/fail according to normal task rules, but no new polling or fallback should change credit source silently.

## 7. Connection Service And OAuth Broker

### MCP Client Dependency Policy

Before adding a new dependency, inspect whether the existing repo already contains an MCP client/runtime package. Current package inspection did not show `@modelcontextprotocol/*`.

V1 implementation options, in priority order:

1. Use the official MCP TypeScript SDK only if it is required for correct Streamable HTTP/OAuth behavior and passes dependency review.
2. If provider calls can be safely implemented with a small internal Streamable HTTP JSON-RPC client, keep it inside `mcpMediaAdapter` or a helper module and do not generalize arbitrary MCP support.
3. Do not build a broad user-configurable MCP client. V1 supports approved provider templates only.

Any new dependency must be justified in the implementation section that introduces it and must not be added until schema/service tests define the expected behavior.

### Connection Lifecycle

States:

- `not_connected`: no connection record;
- `connected`: usable;
- `requires_reauth`: provider token expired/revoked or refresh failed;
- `disabled`: local admin/user disabled;
- `revoked`: disconnected and blocked;
- `error`: health check/tool discovery failed but reconnect may recover.

### OAuth Flow

1. `mcpConnections.startOAuth` validates provider template and feature flags.
2. Server creates signed state, nonce, optional PKCE verifier/challenge, tenant/user/provider binding, short expiry.
3. UI opens provider authorization URL in popup.
4. The app route registry exposes a callback route such as `/auth/callback/mcp-connect`; `McpConnectCallback` receives `code`/`state`.
5. `mcpConnections.completeOAuth` validates state/nonce/provider/user/tenant and exchanges tokens/session as needed.
6. Store encrypted token/session reference, safe account label/hash, scopes, expiry, and health metadata.
7. Trigger initial `tools/list` discovery.

Replay, mismatched tenant/user/provider, expired state, and duplicate callback must fail closed.

### Router Responses

All `mcpConnections` responses return safe labels only:

- provider key/display name;
- connection ID;
- owner display label;
- group label;
- health/status;
- supported asset types/tools/models;
- policy flags;
- usage summaries.

Never return token refs, raw tokens, raw sessions, raw `tools/list`, provider account IDs, or raw provider payloads.

## 8. Transport Resolver And MCP Media Adapter

### Resolver Responsibilities

Inputs:

- authenticated actor;
- tenant;
- surface;
- provider/model/asset type;
- optional transport;
- optional connection and group IDs;
- user defaults and surface defaults.

Outputs:

- resolved transport;
- resolved provider;
- resolved connection/share policy when MCP;
- credit policy;
- normalized metadata for job/task/history.

Rules:

- omitted transport resolves to `gateway_api`;
- explicit MCP requires eligible connection;
- `ask_each_time` prevents automatic MCP submission;
- shared connection never overrides personal default silently;
- non-v1 surfaces are forced to `gateway_api`;
- public REST/public SmartSpecPro MCP tools are forced to `gateway_api` in v1.

### MCP Adapter Responsibilities

- Initialize/reuse provider session from encrypted reference.
- Refresh `tools/list` when cache stale or schema mismatch.
- Select image/video tool from discovered tools and provider template hints.
- Filter normalized request fields and `extraParams` through input schema.
- Submit MCP `tools/call`.
- Record provider job ID/status when available.
- Poll/wait through provider status tools.
- Redact provider summary.
- Attempt provider-side cancel when supported.

### MCP Schema Projection

`apps/web/shared/mcpToolSchemaProjection.ts` owns the mapping from provider MCP `inputSchema` into SmartSpecPro-safe dynamic field metadata.

Projection rules:

- allow only supported primitive/control types used by current media dynamic fields;
- mark unsupported fields as hidden with a warning rather than rendering raw JSON;
- preserve provider schema hash and tool name;
- never allow schema-provided text to override transport, connection, group, owner, credit, or output destination fields;
- use the same projection in Media Studio and scoped workflow surfaces.

Initial tool preference:

- image: `images_generate` when present;
- video: `video_generate` when present;
- status: `creation_status` or `creations_wait` when present.

Provider capability degradation:

| Capability | Required behavior |
|---|---|
| Missing image/video generation tool | Mark the connection unusable for that asset type and return `tool_unavailable` before provider execution |
| Missing status/wait tool | Allow only if provider `tools/call` returns terminal output or a provider job URL that can be safely stored; otherwise return `async_status_unavailable` |
| Missing cancel tool | Local cancel still succeeds and records `provider_cancel_unsupported` |
| Schema changes while queued | Revalidate against latest schema before execution; if incompatible, fail with `schema_changed` and offer explicit fallback |
| Provider-specific unsupported normalized field | Reject before execution unless the field has a documented safe provider default |
| Provider 401/expired session | Mark connection `requires_reauth`, stop pending MCP jobs, and expose reconnect/fallback choices |
| Provider 429/quota/credit exhausted | Keep task failed or paused according to existing task conventions, record safe error code, and never silently fallback to `gateway_api` |

## 9. Media Router Changes

Extend async media input schemas with:

- `transport?: "gateway_api" | "mcp"`;
- `mcpConnectionId?: string`;
- `sharedGroupId?: number`;
- `idempotencyKey?: string`;

### `mediaGenerationService.ts` Decision Checklist

Before modifying `apps/web/server/services/mediaGenerationService.ts`, inspect and document:

1. whether existing task `parameters`/`resultData` can persist `MediaTaskTransportMetadata`;
2. whether `media.ts` can own MCP task creation while keeping `mediaGenerationService` as the gateway adapter;
3. whether existing cancel/list/get behavior can read MCP metadata without service changes;
4. whether credit reconciliation can skip MCP provider-credit jobs from router-level metadata alone.

If all four are true, leave `mediaGenerationService.ts` unchanged and implement MCP routing in `media.ts` plus new MCP services. Modify `mediaGenerationService.ts` only for shared metadata/cancel normalization that cannot be cleanly localized.

For `gateway_api`:

- keep current code path and credit behavior.

For `mcp`:

- validate flags and connection/share policy;
- create/persist task metadata;
- persist `MediaTaskTransportMetadata` in existing task JSON fields only if tests prove it survives create, poll, list, reload, cancel, and retry; otherwise add a migration before MCP routing ships;
- apply the same server-side abuse guard, prompt hashing, SSRF/reference validation, and media rate limiting style used by the existing async media boundary before provider execution;
- do not deduct SmartSpecPro media generation credits by default;
- track provider-credit usage events;
- expose credit source as provider account credits;
- fallback to `gateway_api` only through explicit user/policy approval.

### MCP Job Recovery And Idempotency

Reuse existing async media task and polling safety-net patterns rather than introducing a separate MCP-only queue.

Requirements:

- persist provider job ID, tool name, schema hash, attempt count, next poll hint, and idempotency key in `MediaTaskTransportMetadata` or task result metadata;
- if SmartSpecPro restarts after `tools/call` returns a provider job ID, resume status polling from persisted metadata;
- if restart happens before provider execution starts, retry only within the same local idempotency scope;
- never call provider generation twice for the same idempotency key once a provider job ID is known;
- if provider status cannot be recovered after bounded retries, mark the task with a safe `provider_status_unknown` failure and preserve audit/usage records;
- recovery must release local shared concurrency reservations on terminal states and must not double-count budgets.

Cancel behavior:

- local cancel happens immediately for authorized actor;
- provider cancel attempted when tool exists;
- unsupported/failed provider cancel remains locally cancelled and audited;
- queued cancel releases usage/concurrency reservation;
- processing cancel releases local concurrency but may still consume provider credits.

## 10. Group Sharing, Budgets, And Approvals

### Share Policy

To use a shared connection, actor must:

- be in same tenant;
- be active member of shared group;
- request allowed asset type/tool/model;
- fit daily budget and concurrency constraints;
- have owner approval for video jobs in v1.

### Budget Semantics

- Count SmartSpecPro-tracked generation starts by share.
- Daily window uses share timezone, tenant timezone, owner timezone, then UTC.
- Reserve budget atomically with job creation.
- Failed jobs count unless provider execution never started.
- Queued cancel releases reservation.
- Processing cancel remains counted.

### Shared Video Approval

Shared video jobs create or require a pending approval:

```ts
type SharedVideoApprovalStatus = "pending" | "approved" | "denied" | "expired" | "used";
```

Approval binds to connection, share, group, owner, actor, asset type, prompt/request hash, and expiry. One approval can be consumed once.

## 11. UI/UX Contract

### Target User / JTBD

- Role: creative user generating images/videos, account owner sharing provider credits, group member using shared account, tenant admin controlling rollout.
- Goal: select API or connected provider account without leaving the generation workflow.
- Entry points: Settings > Integrations, Media Studio, Marketplace Capture Product Detail, Storyboard Review.
- Success outcome: user understands which account/credit source is used, can generate successfully, and can recover from expired/denied/fallback states.

### Surface Inventory

| Surface | File/route | Change |
|---|---|---|
| Settings > Integrations | `Settings.tsx`, `McpConnectPanel.tsx` | Provider connection, defaults, sharing, usage |
| OAuth callback | `McpConnectCallback.tsx` | Popup callback status and close |
| Media Studio | `MediaStudio.tsx` | Transport selector, connection picker, credit badge, task metadata |
| Marketplace Capture Product Detail | `MarketplaceCaptureProductDetail.tsx` | Product-context transport defaults and labels |
| Storyboard Review | `StoryboardReviewPage.tsx` | Task transport selection, batch fallback confirmation |

### Component Map

| Component | Owns | Consumes |
|---|---|---|
| `McpConnectPanel` | provider cards, tabs, share editor, usage summary | `trpc.mcpConnections.*`, `trpc.groups.list` |
| `McpTransportSelector` | transport segmented control and credit label | resolved connection list and generation form state |
| `McpConnectionPicker` | personal/shared connection selection | safe connection metadata |
| `McpCreditSourceBadge` | provider vs SmartSpecPro credit label | transport metadata |

### State Matrix

Must cover: loading provider templates, empty provider list, not connected, popup blocked, connected, expired/reconnect required, provider credit exhausted/unknown, group share denied, no eligible connection, schema discovery loading/error, fallback available/unavailable, disabled by feature flag/tenant policy, owner approval pending/denied/expired.

### Responsive Matrix

Verify:

- mobile 390x844: stacked controls, no clipped provider labels, primary action visible;
- tablet 768x1024: picker/dropdown does not overflow;
- desktop 1440x900: controls align with existing model/provider area;
- small-mobile 360x800 for Settings and Media Studio because labels can be long;
- laptop 1024x768 for dense Storyboard Review/Marketplace layouts;
- wide-desktop 1280x800 for history/task badge layouts.

### Accessibility Acceptance

- All picker/segmented controls keyboard accessible.
- Icon buttons have accessible names/tooltips.
- Focus order follows surface workflow.
- Error/denied states are announced through visible text and ARIA semantics where appropriate.
- Provider credit warnings use readable contrast.
- No motion-only status communication; respect reduced motion.

### Visual Direction

Use existing shadcn/Radix/local UI primitives. Keep operational density consistent with Settings/Media Studio. Avoid nested card piles; use compact rows, badges, tabs, and dialogs. Use existing semantic status colors for connected, warning, error, disabled, and selected.

### Copy Contract

Tone: direct, practical, localized where the surface already supports Thai/English.

Required labels:

- `Gateway API`
- `MCP Connect`
- `SmartSpecPro credits`
- `{Provider} account credits`
- `Shared by {owner}`
- `Reconnect required`
- `Owner approval required`
- `Retry with Gateway API`

Do not expose provider secrets or raw provider IDs in copy.

### Browser Evidence Required

Deep implementation must record UI evidence under `<planning_dir>/implementation/ui-browser-evidence.md` or section-local evidence. Required checks: mobile/tablet/desktop screenshots, no console errors, keyboard path, loading/empty/error/disabled/success states, no overlap/overflow, accessible labels.

## 12. Scoped Workflow Integration

### Media Studio

Media Studio is the first vertical slice.

Plan:

1. Add MCP connection queries behind feature flags.
2. Add transport selector near model/provider controls.
3. Preserve current dynamic fields for `gateway_api`.
4. For MCP, adapt discovered input schema into existing dynamic fields only where practical; hide raw schema by default.
5. Submit metadata through async media procedures.
6. Show task/history badges and credit source.

Section 06 owns the shared media transport components (`McpTransportSelector`, `McpConnectionPicker`, and `McpCreditSourceBadge`). Settings/Profile UI from Section 05 owns connection management only, not the media generation picker components.

### Auto Storyboard Review

Plan:

- store selected/default transport metadata on run/stage context;
- pass transport metadata to generated image/video media tasks;
- stop scheduling pending jobs when MCP becomes unavailable;
- offer reconnect or explicit fallback for remaining jobs;
- preserve completed jobs and per-task transport metadata.

### Marketplace Capture

Plan:

- keep product truth/evidence immutable;
- preserve product context in `extraParams`;
- prevent scraped product content from changing transport/share/budget;
- show transport/provider account on generated assets;
- keep product sharing settings separate from MCP sharing.

### Storyboard Review

Plan:

- extend draft/task metadata with optional transport fields;
- preserve old drafts by treating missing transport as `gateway_api`;
- allow selected tasks to use MCP;
- show batch summary and per-item transport badges;
- require explicit fallback confirmation.

## 13. Observability And Retention

Metrics:

- connection success/reauth rate;
- generation success/failure/latency by provider and surface;
- provider 429/error rate;
- schema change events;
- shared usage/policy denied count;
- fallback count;
- provider credit exhausted count.

Structured logs:

- provider, transport, origin surface, connection ID, owner, actor, group, tool, schema hash, asset type, job IDs, attempts, error class, latency, credit policy.

Do not log raw prompts, raw reference URLs, raw provider responses, OAuth/session references, or provider account identifiers. Use request hashes, safe account labels, and redacted error codes.

Retention:

- usage events follow tenant audit retention with 180-day beta minimum;
- redacted summaries 30 days then compact/purge;
- schema snapshots 90 days or latest 10 hashes;
- OAuth state/nonce 10 minutes and one-time use.

Implementation notes:

- Add retention service tests before scheduling the job.
- Register the retention job through the existing server/job startup pattern only after it is idempotent.
- Retention deletes or compacts redacted summaries only; it must not delete media tasks, provider output files, or audit events required by tenant retention policy.

## 14. Security And Privacy Gates

Security-critical acceptance:

- no raw tokens/session IDs in browser, logs, audit metadata, or usage events;
- cross-tenant connection IDs cannot be enumerated or used;
- direct connection ID submission cannot bypass share policy;
- prompt/tool content cannot mutate transport or sharing policy;
- SSRF validation applies before provider MCP call;
- OAuth state/nonce replay fails;
- provider callback mismatch fails;
- fallback cannot silently change credit source.

Run a focused security review before group sharing beta.

## 15. TDD And Verification Strategy

Test order:

1. Schema/migration tests.
2. Provider registry/connection service/OAuth tests.
3. Sharing policy/budget/approval tests.
4. Transport resolver and MCP adapter unit tests with mocked MCP client.
5. Media router integration tests for default `gateway_api`, explicit MCP, rejects, metadata, cancel.
6. Settings UI component tests.
7. Media Studio component/integration tests.
8. Scoped workflow tests for Marketplace Capture and Storyboard Review.
9. Security tests.
10. Playwright E2E release gates.

Primary commands:

- `cd apps/web && npm run check`
- `cd apps/web && npm test -- <focused paths>`
- `cd apps/web && npm run e2e:marketplace-hyperframes` only where shared Marketplace UI changes overlap existing browser gates
- new Playwright spec for MCP Connect flows when implementation creates it

Focused test file targets:

- schema/flags: `apps/web/server/services/__tests__/mcpProviderRegistry.test.ts`, `apps/web/server/services/__tests__/mcpFeatureFlags.test.ts`
- connection/OAuth/router: `apps/web/server/routers/__tests__/mcpConnections.test.ts`, `apps/web/server/services/__tests__/mcpConnectionService.test.ts`, `apps/web/server/services/__tests__/mcpOAuthBroker.test.ts`, `apps/web/server/services/__tests__/mcpToolSchemaCacheService.test.ts`
- Admin/Tenant config UI: `apps/web/client/src/pages/__tests__/AdminSettings.mcpProviderConfig.test.tsx`, `apps/web/client/src/pages/__tests__/TenantSettings.mcpFeatureFlags.test.tsx`
- sharing/retention: `apps/web/server/services/__tests__/mcpConnectionSharingService.test.ts`, `apps/web/server/services/__tests__/mcpUsageRetentionService.test.ts`
- resolver/adapter/media: `apps/web/server/services/__tests__/mediaTransportResolver.test.ts`, `apps/web/server/services/__tests__/mcpMediaAdapter.test.ts`, `apps/web/server/routers/__tests__/media.mcpTransport.test.ts`, `apps/web/shared/__tests__/mcpToolSchemaProjection.test.ts`
- MCP test fixtures/helpers: `apps/web/server/services/__tests__/fixtures/mcpProviderTestHarness.ts`, `apps/web/tests/e2e/fixtures/mcpConnectFixtures.ts`
- Settings UI: `apps/web/client/src/components/settings/__tests__/McpConnectPanel.test.tsx`, `apps/web/client/src/pages/__tests__/McpConnectCallback.test.tsx`
- Media Studio UI: `apps/web/client/src/pages/__tests__/MediaStudio.mcpConnect.test.tsx`
- Marketplace/Auto Review: extend `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts` and add/extend Product Detail UI tests under `apps/web/client/src/pages/__tests__/`
- Storyboard Review: `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`, `apps/web/client/src/pages/__tests__/StoryboardReviewPage.mcpConnect.test.tsx`, and relevant `videoEditorProjects` router tests
- E2E: `apps/web/tests/e2e/mcp-connect-media.spec.ts`

Minimum command matrix:

| Scope | Command |
|---|---|
| Typecheck after TS changes | `cd apps/web && npm run check` |
| Focused unit/integration tests | `cd apps/web && npm test -- <test paths>` |
| Full focused MCP backend suite | `cd apps/web && npm test -- server/services/__tests__/mcpProviderRegistry.test.ts server/services/__tests__/mcpFeatureFlags.test.ts server/routers/__tests__/mcpConnections.test.ts server/services/__tests__/mcpConnectionService.test.ts server/services/__tests__/mcpOAuthBroker.test.ts server/services/__tests__/mcpToolSchemaCacheService.test.ts server/services/__tests__/mcpConnectionSharingService.test.ts server/services/__tests__/mcpUsageRetentionService.test.ts server/services/__tests__/mediaTransportResolver.test.ts server/services/__tests__/mcpMediaAdapter.test.ts server/routers/__tests__/media.mcpTransport.test.ts shared/__tests__/mcpToolSchemaProjection.test.ts` |
| Admin/Tenant config UI | `cd apps/web && npm test -- client/src/pages/__tests__/AdminSettings.mcpProviderConfig.test.tsx client/src/pages/__tests__/TenantSettings.mcpFeatureFlags.test.tsx` |
| Full web test fallback | `cd apps/web && npm test` |
| UI E2E evidence | `cd apps/web && npx playwright test tests/e2e/mcp-connect-media.spec.ts --project=chromium` |
| Existing Marketplace regression when Section 07 changes Product Detail/Auto Review | `cd apps/web && npm run e2e:marketplace-hyperframes` |

Implementation evidence artifacts:

- section 04 must record the `mediaGenerationService.ts` decision checklist outcome in the implementation notes or PR description;
- section 09 must create/update `<planning_dir>/implementation/release-evidence.md` with commands, pass/fail results, known blockers, rollout flags tested, and rollback verification;
- UI browser screenshots/traces should be referenced from `<planning_dir>/implementation/ui-browser-evidence.md` or the section-local evidence file;
- release evidence must explicitly state whether all MCP provider calls used mocks, provider sandboxes, or live accounts.

## 16. Rollout And Rollback

Rollout:

1. Internal schema/service alpha with all UI hidden.
2. Media Studio Magnific image generation only, no sharing.
3. Media Studio image/video with Magnific and Higgsfield, no sharing.
4. Scoped workflow beta.
5. Group sharing beta with strict owner approval and budgets.
6. Limited customer production.

Rollback:

- disable global `mcpConnectEnabled` to hide UI and reject new MCP jobs;
- provider flags disable specific providers;
- surface flags revert specific surfaces to omitted transport/`gateway_api`;
- group sharing flag blocks new shared jobs without deleting connection data;
- running jobs may finish or fail according to normal task rules;
- audit and usage records remain retained.

## 17. Implementation Sequence

Implement in these sections:

1. Schema, provider templates, feature flags, and seed data.
2. Connection service, OAuth broker, and connection-management router.
3. Sharing policy, budgets, owner approvals, and usage/audit/retention services.
4. Transport resolver, MCP adapter, and media router integration.
5. Settings/Profile MCP Connect UI.
6. Media Studio vertical slice.
7. Auto Storyboard Review and Marketplace Capture integration.
8. Storyboard Review integration.
9. Observability, release gates, E2E, and final security review.

Each section must keep `gateway_api` tests passing before moving to the next.
