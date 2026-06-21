# TDD Plan: Feature 121 MCP Connect Media Provider Sharing

## 1. Objective

Test-first goal: prove MCP transport is additive and cannot regress `gateway_api`.

Baseline regression tests:

- Test: existing async image generation with omitted `transport` still routes through `gateway_api`.
- Test: existing async video generation with omitted `transport` still routes through `gateway_api`.
- Test: public REST media generation cannot select MCP in v1.
- Test: synchronous media generation rejects or ignores MCP according to plan and remains `gateway_api`.

## 2. Baseline To Preserve

Tests before implementation:

- Test: Media Studio submission without MCP flags produces the same payload shape as before.
- Test: Marketplace Capture product context metadata is unchanged when transport is omitted.
- Test: Storyboard Review draft without transport metadata loads as `gateway_api`.
- Test: non-v1 surfaces do not render MCP controls when MCP flags are off.

## 3. High-Level Architecture

Tests before implementation:

- Test: resolver returns `gateway_api` for omitted transport.
- Test: resolver returns MCP only when surface, provider, asset type, and connection are eligible.
- Test: resolver rejects cross-tenant connection IDs without revealing connection existence.
- Test: task metadata persists resolved transport, provider, surface, credit policy, and actor.

## 4. Files And Modules

Tests before implementation:

- Test: `mcpConnections` router is registered in `appRouter` and rejects unauthenticated calls.
- Test: feature flag keys are exported and accepted by tenant feature flag validation.
- Test: `mcpToolSchemaProjection` projects supported schema fields and hides unsupported fields.

## 5. Data Model And Migration

Tests before implementation:

- Test: migration creates MCP provider template, connection, share, schema cache, usage event, and shared video approval tables.
- Test: `mcp_provider_templates.providerKey` and `mcpUrl` are unique.
- Test: connection indexes exist for tenant/owner/status, provider/status, account hash, and token expiry.
- Test: connection schema stores encryption key/version metadata or equivalent encrypted-reference metadata.
- Test: only one active default image connection per owner/provider is allowed.
- Test: only one active default video connection per owner/provider is allowed.
- Test: active share uniqueness uses `(tenantId, connectionId, groupId)` with soft-delete behavior.
- Test: group share uses integer `groupId` compatible with `user_groups.id`.
- Test: usage events can be queried by owner, actor, group, connection, and media job.
- Test: shared video approval can be atomically consumed once.
- Test: migration rollback guidance prefers feature-flag rollback over dropping MCP tables after production data exists.

## 6. Feature Flags

Tests before implementation:

- Test: all MCP flags default to disabled.
- Test: server rejects MCP connection creation when global flag is disabled.
- Test: provider-specific disabled flag blocks connection and generation.
- Test: surface flag disabled forces that surface to omit/ignore MCP and use `gateway_api`.
- Test: group sharing flag disabled blocks shared use but not owner use.
- Test: shared mapping converts spec snake_case names to TypeScript keys consistently.

## 7. Connection Service And OAuth Broker

Tests before implementation:

- Test: `startOAuth` creates signed state/nonce with tenant, user, provider, expiry.
- Test: expired state is rejected.
- Test: replayed state is rejected.
- Test: callback for different tenant/user/provider is rejected.
- Test: successful callback stores encrypted session reference and safe account label only.
- Test: successful callback stores encryption key/version metadata for decrypt/reencrypt support without exposing it to clients.
- Test: `listConnections` never returns token/session fields.
- Test: `disconnect` marks connection blocked before provider-side revocation attempt.
- Test: `disconnect` invalidates/removes decryptable session material while preserving safe audit labels and disabling revoked shares.
- Test: health check moves invalid grant/expired OAuth to `requires_reauth`.
- Test: duplicate provider account hash shows safe warning and does not leak provider ID.

## 8. Transport Resolver And MCP Media Adapter

Tests before implementation:

- Test: explicit per-job selection outranks surface default.
- Test: surface default outranks personal default.
- Test: personal default outranks eligible shared default.
- Test: `ask_each_time` blocks automatic MCP submission.
- Test: shared connection requires active group membership.
- Test: pending/removed group member is denied.
- Test: adapter chooses image/video tool from discovered schema and template hints.
- Test: adapter filters unsupported args before provider call.
- Test: adapter stores schema hash with task metadata.
- Test: adapter redacts raw provider response.
- Test: provider cancel supported path records provider cancellation.
- Test: provider cancel unsupported path records local cancel and audit metadata.

## 9. Media Router Changes

Tests before implementation:

- Test: `media.generateImageAsync` defaults omitted `transport` to `gateway_api`.
- Test: `media.generateVideoAsync` defaults omitted `transport` to `gateway_api`.
- Test: `mcpConnectionId` is rejected unless `transport === "mcp"`.
- Test: `sharedGroupId` is rejected when share is absent or actor inactive.
- Test: MCP image job creates provider-credit usage event and does not deduct SmartSpecPro credits by default.
- Test: MCP video job preserves provider credit warning metadata.
- Test: fallback from MCP to API requires explicit approval.
- Test: `media.cancelTask` releases queued MCP budget/concurrency reservation.
- Test: processing cancel remains counted and shows provider-credit risk.

## 10. Group Sharing, Budgets, And Approvals

Tests before implementation:

- Test: owner can use own connection without share.
- Test: non-owner cannot use unshared connection.
- Test: active group member can use enabled share within policy.
- Test: cross-tenant group/share is denied.
- Test: daily budget reservation is atomic under concurrent requests.
- Test: daily budget reset uses configured timezone fallback order.
- Test: concurrency limit counts queued and processing jobs.
- Test: shared video job requires owner approval.
- Test: denied/expired approval blocks generation.
- Test: approved approval can be consumed once only.
- Test: tenant admin force-disable blocks new shared jobs immediately.

## 11. UI/UX Contract

Tests before implementation:

- Test: Settings integration tab renders MCP Connect panel only when flag is enabled.
- Test: panel renders loading, empty, disconnected, connected, expired, error, and disabled states.
- Test: connect button opens popup and handles popup-blocked state.
- Test: group sharing editor lists only same-tenant visible groups.
- Test: owner acknowledgement is required before enabling share or video access.
- Test: usage summary shows actor/group/date/status without secrets.
- Test: keyboard navigation reaches provider cards, tabs, picker, toggles, and dialogs.
- Test: icon-only actions have accessible names.
- Browser evidence: mobile/tablet/desktop screenshots for Settings, Media Studio, Marketplace Capture, and Storyboard Review.

## 12. Scoped Workflow Integration

### Media Studio

Tests before implementation:

- Test: transport selector defaults to Gateway API.
- Test: selecting MCP shows connection picker and credit-source badge.
- Test: no eligible connection shows connect/reconnect CTA.
- Test: generation payload includes transport metadata when MCP selected.
- Test: task/history cards show API vs MCP badges.
- Test: fallback retry action shows credit-source change before submit.

### Auto Storyboard Review

Tests before implementation:

- Test: scoped batch stores transport metadata on run/stage context.
- Test: generated image/video tasks receive transport metadata.
- Test: connection loss stops scheduling pending tasks.
- Test: explicit fallback approval retries only remaining tasks.
- Test: completed items keep original transport metadata.

### Marketplace Capture

Tests before implementation:

- Test: product context remains in `extraParams`.
- Test: scraped evidence cannot set transport, connection, group, or budget.
- Test: generated assets display provider account and transport.
- Test: product sharing settings remain separate from MCP sharing.

### Storyboard Review

Tests before implementation:

- Test: old drafts without transport metadata load as `gateway_api`.
- Test: selected tasks can set MCP transport/connection metadata.
- Test: batch summary shows mixed transport counts after approved fallback.
- Test: provider account/credit source appears in progress state.

## 13. Observability And Retention

Tests before implementation:

- Test: generation logs include provider, transport, origin surface, owner, actor, group, tool, schema hash, job, error class, latency, and credit policy.
- Test: usage metrics include origin surface label.
- Test: retention compacts redacted summaries after 30 days.
- Test: retention removes consumed/expired OAuth state records after TTL.
- Test: retention keeps audit events required by tenant policy.
- Test: retention does not delete media tasks or output files.
- Test: retention does not orphan usage events from connection/share audit records.

## 14. Security And Privacy Gates

Tests before implementation:

- Test: API responses and logs contain no raw OAuth tokens/session IDs.
- Test: connection IDs cannot be enumerated across tenants.
- Test: prompt/tool injection cannot modify transport or share policy.
- Test: reference image/video URLs are SSRF validated before MCP call.
- Test: schema-provided field labels cannot override protected fields.
- Test: provider errors are sanitized before UI display.

## 15. TDD And Verification Strategy

Command plan:

- Run focused Vitest files after each section.
- Run `cd apps/web && npm run check` after backend/frontend type changes.
- Run Playwright evidence for UI sections after dev server setup.
- Run security-focused tests before enabling group sharing.

Canonical test file map:

| Area | Test files |
|---|---|
| Schema/flags | `apps/web/server/services/__tests__/mcpProviderRegistry.test.ts`, `apps/web/server/services/__tests__/mcpFeatureFlags.test.ts` |
| Connection/OAuth | `apps/web/server/routers/__tests__/mcpConnections.test.ts`, `apps/web/server/services/__tests__/mcpConnectionService.test.ts`, `apps/web/server/services/__tests__/mcpOAuthBroker.test.ts`, `apps/web/server/services/__tests__/mcpToolSchemaCacheService.test.ts` |
| Admin/Tenant config UI | `apps/web/client/src/pages/__tests__/AdminSettings.mcpProviderConfig.test.tsx`, `apps/web/client/src/pages/__tests__/TenantSettings.mcpFeatureFlags.test.tsx` |
| Sharing/retention | `apps/web/server/services/__tests__/mcpConnectionSharingService.test.ts`, `apps/web/server/services/__tests__/mcpUsageRetentionService.test.ts` |
| Transport/media | `apps/web/server/services/__tests__/mediaTransportResolver.test.ts`, `apps/web/server/services/__tests__/mcpMediaAdapter.test.ts`, `apps/web/server/routers/__tests__/media.mcpTransport.test.ts`, `apps/web/shared/__tests__/mcpToolSchemaProjection.test.ts` |
| MCP fixtures/helpers | `apps/web/server/services/__tests__/fixtures/mcpProviderTestHarness.ts`, `apps/web/tests/e2e/fixtures/mcpConnectFixtures.ts` |
| Settings UI | `apps/web/client/src/components/settings/__tests__/McpConnectPanel.test.tsx`, `apps/web/client/src/pages/__tests__/McpConnectCallback.test.tsx` |
| Media Studio | `apps/web/client/src/pages/__tests__/MediaStudio.mcpConnect.test.tsx` |
| Marketplace/Auto Review | `apps/web/server/services/__tests__/marketplaceAutoReviewService.test.ts`, `apps/web/client/src/pages/__tests__/MarketplaceCaptureProductDetail.mcpConnect.test.tsx` |
| Storyboard Review | `apps/web/client/src/lib/storyboardReviewWorkspace.test.ts`, `apps/web/client/src/pages/__tests__/StoryboardReviewPage.mcpConnect.test.tsx`, relevant `apps/web/server/routers/__tests__/videoEditorProjects*.test.ts` |
| E2E | `apps/web/tests/e2e/mcp-connect-media.spec.ts` |

Cross-section contract assertions:

- Section 04 tests must prove `MediaTaskTransportMetadata` is the single persisted shape for router, task polling/listing, usage events, and UI-facing task data.
- Sections 06-08 UI/workflow tests must assert against the shared metadata fields instead of surface-specific transport objects.
- Section 09 E2E must verify status/history evidence contains transport, origin surface, connection scope, and credit policy for MCP jobs and defaults legacy jobs to `gateway_api`.
- Unit/integration/E2E tests must use mocked MCP provider fixtures by default; live Magnific/Higgsfield accounts are optional release evidence only.
- Section 04 tests must prove MCP requests still pass through existing abuse guard, SSRF/reference validation, and provider/media rate limiting before provider execution.
- Recovery tests must prove provider job ID polling resumes after restart, idempotency prevents duplicate `tools/call`, and unrecoverable status becomes safe `provider_status_unknown`.
- Rollout/config tests must prove existing Admin Settings/provider config and Tenant Settings/feature-flag UI can configure provider readiness and disable global/provider/surface/group-sharing paths without env-file edits.
- Config UI tests must prove provider OAuth/client metadata, callback/redirect allowlist, timeout/retry/schema TTL, and tenant rollout flags are editable through UI/router flows with masked secret reads.

Minimum command matrix:

- `cd apps/web && npm run check`
- `cd apps/web && npm test -- <focused paths from the section>`
- `cd apps/web && npm test -- client/src/pages/__tests__/AdminSettings.mcpProviderConfig.test.tsx client/src/pages/__tests__/TenantSettings.mcpFeatureFlags.test.tsx`
- `cd apps/web && npm test` when cross-section contracts change
- `cd apps/web && npx playwright test tests/e2e/mcp-connect-media.spec.ts --project=chromium`
- `cd apps/web && npm run e2e:marketplace-hyperframes` when Product Detail/Auto Review UI changes need existing marketplace browser regression coverage

## 16. Rollout And Rollback

Tests before implementation:

- Test: disabling global flag hides UI and rejects new MCP jobs.
- Test: disabling provider flag blocks only that provider.
- Test: disabling surface flag keeps that surface on `gateway_api`.
- Test: disabling group sharing blocks new shared jobs but preserves owner connections.
- Test: running jobs keep terminal behavior after flag turns off.

## 17. Implementation Sequence

Section acceptance rule:

- Each section must add failing tests first.
- Each section must keep existing `gateway_api` behavior green.
- UI sections must provide browser evidence or explicitly record skipped browser checks with blocker.
