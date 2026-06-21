# Section 04: Transport Resolver, MCP Adapter, and Media Router Integration

## Goal

Add MCP as an optional transport at the async media boundary while preserving all existing `gateway_api` behavior.

## Depends On

- Section 01 schema/flags.
- Section 02 connection service/OAuth.
- Section 03 sharing policy/budget/approval helpers.

## Files

Create:

- `apps/web/server/services/mediaTransportResolver.ts`
- `apps/web/server/services/mcpMediaAdapter.ts`
- `apps/web/shared/mcpConnectTypes.ts` if no existing shared media contract module can own the canonical MCP transport types
- `apps/web/shared/mcpToolSchemaProjection.ts`
- `apps/web/server/services/__tests__/fixtures/mcpProviderTestHarness.ts`
- `apps/web/server/services/__tests__/mediaTransportResolver.test.ts`
- `apps/web/server/services/__tests__/mcpMediaAdapter.test.ts`
- `apps/web/shared/__tests__/mcpToolSchemaProjection.test.ts`
- `apps/web/server/routers/__tests__/media.mcpTransport.test.ts`

Modify:

- `apps/web/server/routers/media.ts`
- `apps/web/server/services/mediaGenerationService.ts` only if shared metadata/cancel normalization requires it

Before modifying `mediaGenerationService.ts`, inspect and document:

1. whether existing task `parameters`/`resultData` can persist MCP transport metadata;
2. whether `media.ts` can own MCP task creation while `mediaGenerationService` remains the gateway adapter;
3. whether existing get/list/cancel behavior can read MCP metadata without service changes;
4. whether credit reconciliation can skip MCP provider-credit jobs from router-level metadata.

If all four are true, leave `mediaGenerationService.ts` unchanged.

## Canonical Contracts

Define or reuse shared types for:

- `MediaTransport = "gateway_api" | "mcp"`;
- `MediaAssetType = "image" | "video"`;
- `MediaOriginSurface = "media_studio" | "auto_storyboard_review" | "marketplace_capture" | "storyboard_review"`;
- `McpCreditPolicy = "smartspec_credits" | "provider_credits_tracked"`;
- `McpConnectionScope = "personal" | "shared"`;
- `MediaTaskTransportMetadata`.

`MediaTaskTransportMetadata` must include transport, origin surface, provider, asset type, actor user, optional connection/share/provider job/tool/schema fields, optional fallback metadata, and credit policy. Legacy tasks without this metadata must read as `gateway_api`.

Section 06-08 UI/workflow code must consume these shared contracts rather than introducing surface-specific metadata shapes.

## Transport Resolver

Inputs:

- actor/tenant;
- origin surface;
- asset type;
- provider/model;
- optional transport;
- optional connection/share/group;
- user defaults and surface defaults.

Resolution priority:

1. explicit UI selection;
2. surface-scoped default;
3. personal default;
4. single eligible shared default only when enabled;
5. `ask_each_time` blocks automatic MCP;
6. omitted transport uses `gateway_api`.

Non-v1 surfaces, synchronous procedures, public REST, and public SmartSpecPro MCP tools stay `gateway_api`.

## MCP Adapter

Responsibilities:

- resolve encrypted session through connection service;
- use cached/discovered `tools/list`;
- select image/video/status/cancel tools from template hints and schema;
- filter normalized fields through schema projection;
- call provider MCP tool;
- poll/wait for status;
- redact provider summary;
- record schema hash/tool/provider job ID;
- attempt provider-side cancel when available.

## Schema Projection

`mcpToolSchemaProjection` maps provider MCP input schemas into safe dynamic field metadata.

Rules:

- support existing dynamic field primitives only;
- unsupported fields become hidden warnings;
- preserve schema hash and tool name;
- schema text cannot override transport/connection/group/owner/credit/destination fields.

## UI/UX Contract

### Target User / JTBD
N/A for direct UI implementation. This section supplies transport metadata and schema projection consumed by UI sections.

### Surface Inventory
N/A. No page/component is modified directly.

### Component Map
N/A. Shared schema projection output is consumed by Media Studio and workflow UI sections.

### State Matrix
N/A. Router/adapter states are verified by tests; UI state rendering is covered in Sections 06-08.

### Responsive Matrix
N/A. No browser layout changes.

### Accessibility Acceptance
N/A. No interactive UI changes.

### Copy Contract
N/A. Error/status codes must be safe and mappable by UI sections.

### Browser Evidence Required
Skipped for this backend/shared-contract section.

## Media Router Changes

Extend async inputs:

- `transport`
- `mcpConnectionId`
- `sharedGroupId`
- `idempotencyKey`

For `gateway_api`, keep current flow unchanged.

For MCP:

- validate flags/surface;
- resolve connection/share;
- apply existing async media abuse guard, prompt hashing, SSRF/reference validation, and provider/media rate limiting style before provider execution;
- reserve budget/concurrency if shared;
- call adapter;
- write `MediaTaskTransportMetadata`;
- prove metadata survives create, poll, list, reload, cancel, and retry when stored in existing task JSON fields; add a schema migration before shipping if the existing fields cannot preserve it reliably;
- track provider-credit usage;
- do not deduct SmartSpecPro media credits by default;
- fallback only after explicit approval.

## Provider Capability Degradation

- Missing image/video tool returns `tool_unavailable` before provider execution.
- Missing status/wait tool is allowed only when `tools/call` returns terminal output or a safe provider job URL; otherwise return `async_status_unavailable`.
- Missing cancel tool keeps local cancel successful and records `provider_cancel_unsupported`.
- Schema changes while queued revalidate before execution and fail with `schema_changed` if incompatible.
- Unsupported normalized fields reject before execution unless a documented safe provider default exists.
- Provider 401/expired session marks the connection `requires_reauth` and stops pending MCP jobs.
- Provider 429/quota/credit exhausted records safe error code and never silently falls back to `gateway_api`.

## Recovery And Idempotency

Reuse existing async media task and polling safety-net patterns. Do not create a separate MCP-only queue.

- Persist provider job ID, tool name, schema hash, attempt count, next poll hint, and idempotency key.
- Resume polling after restart when a provider job ID exists.
- Retry only within the same local idempotency scope when provider execution has not started.
- Never submit duplicate provider generation after a provider job ID is known for that idempotency key.
- If provider status cannot be recovered after bounded retries, fail safely with `provider_status_unknown`.
- Release local shared concurrency reservations on terminal states and avoid double-counting budgets during recovery.

## Test Harness

Create an in-process mocked MCP provider harness for adapter/router tests. It must cover:

- `tools/list` for Magnific-like and Higgsfield-like schemas;
- `tools/call` queued, processing, terminal success, terminal failure;
- status/wait tools, missing status tool, missing cancel tool;
- schema hash changes between queue and execution;
- provider 401/expired session, 429/quota, timeout, malformed response, and safe redaction.

Unit and integration tests must not call real Magnific or Higgsfield endpoints.

## Cancel Semantics

- Local cancel succeeds immediately for authorized actor.
- Provider cancel is attempted when tool exists.
- Unsupported/failed provider cancel is audited.
- Queued cancel releases reservation.
- Processing cancel releases local concurrency but may still consume provider credits.

## Tests First

- Test: omitted transport image/video remains `gateway_api`.
- Test: `mcpConnectionId` rejected unless `transport=mcp`.
- Test: direct cross-tenant connection ID is denied without enumeration.
- Test: resolver priority order.
- Test: `ask_each_time` blocks automatic MCP.
- Test: shared group inactive member denied.
- Test: MCP adapter filters unsupported fields.
- Test: schema hash and tool name persist in task metadata.
- Test: legacy task without metadata reads as `gateway_api`.
- Test: metadata survives create, poll, list, reload, cancel, and retry.
- Test: MCP jobs create provider-credit usage event and do not deduct SmartSpecPro credits.
- Test: fallback requires approval.
- Test: cancel supported and unsupported provider paths.
- Test: missing provider tools and schema changes return safe errors before execution.
- Test: existing abuse guard/rate limiter/SSRF validation still applies before MCP provider execution.
- Test: restart recovery resumes polling when provider job ID is stored.
- Test: idempotency key prevents duplicate provider `tools/call`.
- Test: unrecoverable provider status becomes safe `provider_status_unknown` without leaking raw provider data.

Test file targets:

- `apps/web/server/services/__tests__/mediaTransportResolver.test.ts`
- `apps/web/server/services/__tests__/mcpMediaAdapter.test.ts`
- `apps/web/server/routers/__tests__/media.mcpTransport.test.ts`
- `apps/web/shared/__tests__/mcpToolSchemaProjection.test.ts`
- `apps/web/server/services/__tests__/fixtures/mcpProviderTestHarness.ts`

Verification commands:

- `cd apps/web && npm test -- server/services/__tests__/mediaTransportResolver.test.ts server/services/__tests__/mcpMediaAdapter.test.ts server/routers/__tests__/media.mcpTransport.test.ts shared/__tests__/mcpToolSchemaProjection.test.ts`
- `cd apps/web && npm run check`

## Acceptance Criteria

- Existing media tests still pass.
- New transport fields are optional/backward-compatible.
- MCP path is fully gated.
- Metadata survives create, poll, list, reload, cancel.
