# Research Notes - Marketplace MCP Connector Ingestion And Marketplace Intelligence

Date: 2026-07-01
Spec: `spec.md`
Mode: file-based deep-plan, self-review

## Research Decision

Codebase research is required because this feature extends an existing React + Express + tRPC + Drizzle application and must connect to existing marketplace capture routes, product tables, auth, audit, LLM, and UI conventions.

Web research is required because the plan depends on current MCP authorization/tool behavior and marketplace connector assumptions that may change over time.

SocratiCode status: green, 112,290 indexed chunks, watcher active.

## Codebase Findings

### Repository Shape

- Root package manager is `npm@10.9.8`.
- Root workspaces are `packages/*` and `apps/*`.
- `apps/web` is the main React + Express + tRPC app.
- `apps/web/package.json` provides `npm --prefix apps/web run check`, `npm --prefix apps/web run test`, and Playwright e2e scripts.
- Astryx is installed and repo instructions require UI work to start from `npm run astryx -- build "<idea>"`, then use Astryx templates/components where possible.

### Existing Marketplace Capture Foundation

Feature 113 and current code already provide the baseline:

- Client routes under `/marketplace-capture` are registered in `apps/web/client/src/App.tsx`.
- Existing pages include `MarketplaceCaptureProducts`, `MarketplaceCaptureCandidateBatch`, `MarketplaceCaptureProductDetail`, `MarketplaceCapturePreview`, and `MarketplaceCaptureInsight`.
- tRPC aggregation in `apps/web/server/routers.ts` already registers `marketplaceCapture`.
- REST extension routes are mounted under `/api/marketplace-captures` in `apps/web/server/routes/marketplaceCapture.ts`.
- Shared validation lives in `apps/web/shared/marketplaceCapture.ts`.
- Drizzle marketplace capture tables exist in `apps/web/drizzle/schema.ts`, including capture sessions, capture assets, products, product images, price snapshots, insights, sharing, and auto-review tables.
- Product service logic exists in `apps/web/server/services/marketplaceProductService.ts`.

### Namespace Constraints

- `/marketplace` and `marketplace` are already used for the public skill marketplace.
- Feature 129 should continue under `/marketplace-capture/intelligence/*` and either extend `marketplaceCapture` carefully or add a separate `marketplaceIntelligence` router to avoid making the existing capture router too broad.

### Testing Setup

- Unit and contract tests use Vitest.
- Existing router tests include `apps/web/server/routers.appShape.test.ts` and marketplace capture router tests.
- Existing shared schema tests live beside shared contracts, for example `apps/web/shared/marketplaceCapture.test.ts`.
- Browser-visible workflows should use Playwright when route behavior and visual state matter.
- Recommended commands for this feature:
  - `npm --prefix apps/web run check`
  - `npm --prefix apps/web run test -- apps/web/shared/marketplaceIntelligence.test.ts`
  - `npm --prefix apps/web run test -- apps/web/server/services/__tests__/marketplaceIntelligenceService.test.ts`
  - `npm --prefix apps/web run test -- apps/web/server/routers/__tests__/marketplaceIntelligence.test.ts`
  - `npm --prefix apps/web exec playwright test tests/e2e/marketplace-connector-lab.spec.ts --project=chromium`

## Web Findings

### MCP Authorization

The MCP specification describes authorization for HTTP-based transports and requires discovery metadata for protected resources and authorization servers. Plan implication: SmartSpecPro should model connector authorization as a scoped, expiring, revocable grant and must fail closed when the grant is absent, expired, revoked, or missing required scopes.

Source: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization

### MCP Tool Contracts

MCP tools are named capabilities with input schemas and metadata exposed by a server. Plan implication: SmartSpecPro tool inputs should be strict, versioned, idempotent, and annotated with read/write risk. The save snapshot tool should accept connector output only after validation, not blindly trust upstream fields.

Source: https://modelcontextprotocol.io/specification/draft/server/tools

### Shopee API Volatility

Shopee Open Platform provides formal APIs and authorization flows, but the data returned by an AI-hosted connector may not equal Open Platform API fields. Plan implication: do not hard-code downstream schema from assumptions. Build the Browser Connector Lab and fixture replay harness first, then promote observed fields into normalized mappings.

Sources:
- https://open.shopee.com/
- https://open.shopee.com/developer-guide/20
- https://open.shopee.com/documents/v2/v2.product.search_item?module=89&type=1

## Research Recommendations

- Build the browser-visible Connector Lab first, before irreversible schema/report assumptions.
- Store capability samples and payload shape hashes so future connector changes can be detected.
- Keep raw payload storage isolated, redacted, TTL-bound, and access-controlled.
- Support fixture replay from day one so development and CI do not depend on live connector availability.
- Treat the connector as a permissioned upstream source, not as the durable system of record.
