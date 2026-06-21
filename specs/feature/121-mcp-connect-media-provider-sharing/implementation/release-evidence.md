# MCP Connect Media Provider Sharing - Release Evidence

Date: 2026-06-18

## Command Matrix

| Scope | Command | Result |
|---|---|---|
| Typecheck | `cd apps/web && npm run check` | Pass |
| MCP foundation + policy utilities + schema projection | `cd apps/web && npm test -- --run server/services/__tests__/mcpPolicyUtilities.test.ts shared/__tests__/mcpToolSchemaProjection.test.ts server/services/__tests__/mcpProviderRegistry.test.ts server/services/__tests__/mcpFeatureFlags.test.ts` | Pass, 27 tests |

## Provider Mode

- Provider calls are mocked/template-backed in this implementation pass.
- No live Magnific or Higgsfield credentials were used.
- Provider config is UI-managed through Admin Settings via `mcpConnections.getProviderConfig` and `mcpConnections.saveProviderConfig`.
- Tenant rollout is UI-managed through Tenant Settings via `tenantFeatureFlags.updateFeatureFlags`.
- Magnific and Higgsfield provider templates are seeded as approved templates; OAuth still fails closed unless tenant flags and UI-managed provider config are enabled and complete.
- No MCP provider config requires `.env` edits. Existing platform encryption can be reused for stored session refs.

## Rollout Checks

- `gateway_api` remains default when no transport is supplied.
- `transport=mcp` is opt-in and requires feature flags plus a selected MCP connection.
- `mcpConnectionId` without `transport=mcp` is rejected.
- `sharedGroupId` and shared-video approval IDs are also rejected unless `transport=mcp`, so Gateway API submissions cannot carry inactive MCP policy metadata.
- Synchronous image/video/audio routes explicitly reject MCP transport; MCP remains limited to async image/video boundaries.
- OAuth start/complete fails closed when the provider template is missing or disabled, even if a tenant flag was enabled accidentally.
- Surface flags are modeled for Media Studio, Auto Storyboard Review, Marketplace Capture, and Storyboard Review.
- MCP generation fails closed when provider-credit tracking is disabled, because MCP jobs use provider account credits rather than SmartSpecPro media credits by default.
- Group sharing flag blocks shared use while owner personal connections remain represented.
- Shared use enforces active membership, asset/tool/model allowlists, daily limit, concurrency limit, and video owner approval.
- Shared tool/model allowlists are enforced in the media transport resolver using the selected model and the v1 MCP tool name (`images_generate` / `video_generate`) before provider submission.
- Shared daily and concurrency limits are checked against persisted `mcp_media_tasks` instead of duplicate-prone usage events; active concurrency only counts pending/processing tasks.
- Shared MCP connections are returned to active group members and include `sharedGroupId`/share policy metadata so generation calls can resolve the correct group policy.
- Personal default connection updates are allowed only for connected, non-revoked MCP connections with decryptable session material.
- Media Studio sends `sharedGroupId` only for shared MCP selections; personal MCP and default Gateway API calls remain additive and unchanged.
- Media Studio clears stale MCP account selections when the selected account is not eligible for the current image/video asset type.
- Async image and video router paths both branch to MCP before SmartSpecPro credit reservation when `transport=mcp`; Gateway API still uses the existing reservation/refund flow.
- Direct `mediaGenerationService.generateImageAsync` / `generateVideoAsync` callers can opt into MCP through `transportMetadata`, so scoped surfaces that bypass the TRPC media router are no longer forced back to Gateway API.
- Direct service MCP bridging reads only top-level, server-owned `transportMetadata`; user/product `extraParams.transportMetadata` cannot select MCP implicitly.
- MCP transport resolver derives `providerKey` and provider display name from the selected connection template, not from caller-supplied metadata.
- Marketplace Auto Review accepts MCP metadata only through explicit top-level `transportMetadata` and forwards stored metadata into image/video generation requests with `marketplace_capture` origin mapping.
- MCP task metadata survives create, poll, list, and cancel through additive `mcp_media_tasks` persistence with process-memory fallback for local dev/test.
- MCP media idempotency keys are persisted and unique per tenant/user to avoid duplicate submission in the same idempotency scope.
- MCP idempotency also uses deterministic task IDs for the same tenant/user/idempotency key to prevent duplicate local provider submissions during retry races.
- MCP adapter now uses an in-process idempotency lock so simultaneous same-process retries share the same submission promise before falling back to persisted task idempotency.

## Security/Privacy Notes

- API connection responses redact token refs, encrypted values, session IDs, raw provider account IDs, raw provider payloads, and raw `tools/list`.
- Usage summaries are redacted and remove prompt/url/token/session-like fields.
- Marketplace product/reference anchor payloads cannot set MCP transport/share/budget by hiding control metadata inside product evidence; transport metadata is top-level and policy-checked.
- Marketplace transport metadata identity fields (`tenantId`, `actorUserId`, origin surface, provider display) are server-derived from auth/connection state rather than accepted from product or scraped payloads.
- Schema projection hides protected transport/owner/group/credit fields even if provider schemas include them.
- Shared video requires owner approval in sharing policy service.
- OAuth redirect URIs carry the provider key back to `/auth/callback/mcp-connect` and callback completion remains state/user/tenant/provider bound.
- Shared video approval request/list/approve/deny endpoints are exposed on `mcpConnections`.
- MCP provider config saves are audit-logged with provider/config field metadata only; secrets and token-like values are not included.
- Structured MCP observability events include provider, transport, origin surface, connection, owner/actor/group, tool/schema hash, asset type, job/provider job IDs, attempt count, latency/error class, and credit policy while redacting prompt/url/token/session/provider payload data.
- MCP generation cancel usage events include group identity for shared jobs, preserving owner/group/actor audit visibility.

## UI Evidence

- Browser screenshot capture was not run in this pass.
- Implemented UI surfaces:
  - Settings > Integrations: `McpConnectPanel` with accounts, sharing editor, usage summary
  - Settings > Integrations: OAuth popup completion refreshes MCP account/provider lists automatically
  - OAuth callback: `/auth/callback/mcp-connect`
  - Admin Settings: MCP provider config tab
  - Tenant Settings: MCP rollout flags tab
  - Media Studio: Gateway API / MCP Connect selector and MCP connection picker
  - Media Studio: MCP picker filters by asset type and supports both personal and group-shared MCP accounts
  - Media Studio: Generate is blocked with a visible helper when MCP Connect is selected without an MCP account

## Known Follow-Ups

- Replace template-backed MCP adapter with real Streamable HTTP MCP provider calls after sandbox credentials are available.
- Add full browser/UI tests for Settings, Admin Settings, Tenant Settings, Media Studio, Marketplace Capture, and Storyboard Review.
- Add Playwright E2E fixture and screenshots for required responsive states.
- Final per-task picker controls for Marketplace Capture and Storyboard Review should be expanded after existing dirty changes in those files settle; backend/service transport propagation is in place.
- Restart recovery can reload persisted MCP media task metadata from `mcp_media_tasks`; real provider status polling after restart still depends on replacing the template-backed adapter with provider MCP status tools.
