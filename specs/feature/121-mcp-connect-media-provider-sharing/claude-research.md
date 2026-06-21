# Research: Feature 121 MCP Connect Media Provider Sharing

## Research Decision

Codebase research: yes. SmartSpecPro is an existing TypeScript/React/tRPC/Drizzle codebase, and this feature touches database schema, tRPC routers, media generation, Settings integrations, Media Studio, Marketplace Capture, and Storyboard Review.

Web research: yes. The spec names external remote MCP providers and OAuth-backed MCP authorization behavior: Magnific MCP, Higgsfield MCP, and MCP OAuth/security.

Testing research: use existing repo conventions: Vitest for unit/integration/component tests under `apps/web`, Playwright for route-level browser checks, and Drizzle migration/schema verification.

## Codebase Findings

### Project and Tooling

- Root package manager: `npm@10.9.8`.
- Web app package: `apps/web`.
- Typecheck command: `cd apps/web && npm run check`.
- Test command: `cd apps/web && npm test`.
- Playwright E2E scripts already exist for production/marketplace flows, including `e2e:marketplace-hyperframes`.
- Drizzle commands exist in `apps/web/package.json`: `db:migrate` and `db:push`.

### Media Generation Boundary

Primary router: `apps/web/server/routers/media.ts`.

Relevant async procedures:

- `media.generateImageAsync`
- `media.generateVideoAsync`
- `media.getTask`
- existing list/cancel/fetch task patterns around media history and polling

Important existing behavior:

- `media.ts` already imports `zod`, `TRPCError`, credit services, rate limiter, audit logger, media library service, tenant resolution, model/provider tables, SSRF/reference URL validation helpers, abuse guard prompt hashing, and sandbox dispatch.
- Existing async task polling reconciles credits on completed/failed tasks.
- Existing synchronous image/video procedures must remain `gateway_api` only for v1.
- Existing `originSurface` style metadata already appears in media router snippets and should be reused rather than inventing unrelated surface labels.

Planning implication:

- Extend existing async media inputs and task metadata in place.
- Introduce a transport resolver and MCP adapter underneath the async router.
- Preserve omitted transport as `gateway_api`.
- Add tests proving existing callers that omit transport still behave exactly as before.

### Database and Group Sharing

Primary schema file: `apps/web/drizzle/schema.ts`.

Relevant existing tables:

- `userGroups` maps to `user_groups` with integer `id`, `tenantId`, soft delete via `deletedAt`, partial unique index on active group name, and active group indexes.
- `groupMembers` maps to `group_members` with integer `groupId`, integer `userId`, role, status, and active membership indexes.

Planning implication:

- MCP group shares should use integer `groupId` FK to `user_groups.id`.
- Sharing policy must check active group membership via `group_members.status = "active"`.
- New tables should follow local Drizzle style, with indexes declared in the `pgTable` callback and partial indexes where useful.

### Settings and OAuth UI Pattern

Primary Settings page: `apps/web/client/src/pages/Settings.tsx`.

Existing integration panels:

- `GoogleDrivePanel`
- `OneDrivePanel`
- `McpServersSettingsPanel`
- API key and LLM key panels

Observed OneDrive panel pattern:

- disconnected/connected/expired style states;
- tabs for richer dashboard areas;
- connect/reconnect/disconnect actions;
- `trpc` hooks and `sonner` toasts;
- dashboard cards, badges, and status indicators.

Existing Google Drive planning/docs describe a popup callback page that extracts `code` and `state`, calls a tRPC `completeOAuth` mutation, shows a connecting/success/error status, and closes the popup.

Planning implication:

- Add a new `McpConnectPanel` under Settings > Integrations.
- Reuse popup OAuth flow and callback page pattern.
- Keep provider secrets server-side; callback page only handles code/state and safe status.

### Marketplace Capture and Storyboard Review

Relevant paths:

- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- `apps/web/server/routers/marketplaceCapture.ts`
- `apps/web/server/services/marketplaceAutoReviewService.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.tsx`
- `apps/web/client/src/lib/storyboardReviewWorkspace.ts`
- tests around `marketplaceAutoReviewService`, `storyboardReviewWorkspace`, `StoryboardReviewPage`, and `videoEditorProjects`

Feature 118 documents the current Marketplace Auto Review behavior:

- Product Detail is the primary entry.
- Existing flows include `storyboard_images` and `full_video`.
- Generated outputs carry product/run/concept/shot/frame-strategy metadata through media generation extra params, Storyboard Review handoff, Video Editor, and Library.
- Active run dedupe already exists.

`storyboardReviewWorkspace.ts` defines `StoryboardReviewDraft` and `StoryboardGenerationTask`. It already carries marketplace/production/manual HyperFrames context and task `extraParams`.

Planning implication:

- Transport metadata should be added to existing task/context metadata objects, not a parallel handoff object.
- Marketplace product truth/evidence metadata must remain immutable and separate from MCP connection/share policy.
- Auto Storyboard Review and Storyboard Review batch fallback must operate on pending tasks without mutating completed items.

### Existing Risk Areas

- The repo worktree contains unrelated dirty files. Implementation sections must isolate Feature 121 files and avoid accidental rewrites.
- Several surfaces already have active recent work around Marketplace Auto Review and HyperFrames. The plan should keep MCP transport metadata additive and avoid changing HyperFrames/render behavior.
- Shared provider accounts touch tenant isolation, RBAC, OAuth/session security, audit logging, and user-visible credit expectations. These need explicit section boundaries and tests.

## Web Research Findings

### Magnific MCP

Magnific's MCP documentation describes a remote MCP server at `https://mcp.magnific.com`. It lets connected agents generate images and video, train/reuse characters, upscale assets, browse generation history, and use the user's existing Magnific account credits without an API key. The first connection requires sign-in to the user's Magnific account.

Source: https://docs.magnific.com/modelcontextprotocol

Planning implication:

- Treat Magnific MCP as OAuth/account-credit backed.
- Depend on live `tools/list` discovery for exact tool names and schemas.
- UI must label provider-credit use clearly.

### Higgsfield MCP

Higgsfield documents an MCP/CLI workflow for connecting MCP-compatible clients to Higgsfield image/video generation. Public pages describe 30+ models, image/video generation, previous generation history, and iterative workflows from prior images/videos.

Sources:

- https://higgsfield.ai/cli
- https://higgsfield.ai/mcp

Planning implication:

- Treat Higgsfield as remote MCP with async image/video generation and provider-credit usage.
- Use schema discovery and adapter mapping rather than hardcoding advanced tool capability.

### MCP Authorization and Security

The MCP authorization documentation describes secure authorization for MCP servers using OAuth. Current MCP authorization specifications and tutorials emphasize OAuth 2.1, protected resource metadata, authorization server metadata, and secure handling for public/confidential clients.

Sources:

- https://modelcontextprotocol.io/docs/tutorials/security/authorization
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://modelcontextprotocol.io/specification/draft/basic/authorization

Key implementation implications:

- Remote MCP OAuth should use `state`, nonce, short TTL, replay protection, and PKCE/client metadata support where the provider requires it.
- MCP server/tool descriptions and return values are untrusted external data.
- Tools must be allowlisted by provider template and schema-filtered before call.
- Token/session material must never be returned to the browser.

## Recommended Planning Boundaries

1. Schema and seed data first, with migration/schema tests.
2. Connection service/OAuth router before UI.
3. Transport resolver and MCP adapter before touching scoped surfaces.
4. Media Studio first as the smallest user-visible vertical slice.
5. Marketplace/Storyboard flows after the shared transport metadata works.
6. Group sharing and shared video approval should ship behind separate flags and after owner usage visibility exists.
