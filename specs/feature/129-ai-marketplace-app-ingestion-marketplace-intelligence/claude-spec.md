# Claude Spec - Marketplace MCP Connector Ingestion And Marketplace Intelligence

## Goal

Build a production-grade SmartSpecPro ingestion layer for marketplace data obtained through user-authorized marketplace connectors, starting with Shopee. The first deliverable is a Settings-managed connection flow plus browser-visible Connector Lab that proves authorization, test search, returned field inspection, sanitized fixture capture, Marketplace Capture linking, and snapshot creation before the team commits to downstream analytics assumptions.

## In Scope

- User Settings / Integrations connection configuration for authorize, revoke, reconnect, status, capability refresh, and default search settings.
- Browser routes under `/marketplace-capture/intelligence/*` for lab, snapshots, reports, and compatibility deep-links.
- Compatibility connector route that opens the user's Settings connection panel instead of owning the full authorization flow.
- Connector Lab UI for keyword search tests, region/locale controls, raw redacted response preview, normalized preview, field coverage, unknown field detection, payload shape hash, fixture save, and snapshot creation.
- Fixture replay mode that lets developers and CI test the full UI and ingestion flow without OpenAI-hosted write-back access.
- Shared Zod contracts for connector grants, imports, field samples, snapshots, snapshot items, reports, and watchlists.
- Additive Drizzle schema and migration for user-owned connector imports, capabilities, grants, field samples, search snapshots, snapshot items, product links, product metric enrichments, reports, and watchlist events.
- Ingestion service that validates connector payloads, stores raw payloads with retention metadata, normalizes known fields, preserves unknown fields, computes field coverage, and links/enriches existing Marketplace Capture products when confidence is high.
- Internal tRPC API for browser UI workflows.
- MCP server/tool definitions for saving validated marketplace snapshots and generating reports from stored data.
- Audit, rate limits, tenant isolation, idempotency, retention cleanup, observability, and rollback controls.

## Out Of Scope For First Implementation Slice

- Automated unattended marketplace crawling.
- Bypassing marketplace account restrictions or access controls.
- Storing third-party account credentials.
- Assuming every user can access live connector data.
- Final executive dashboard polish before the Connector Lab proves field availability.

## Primary User Journeys

1. User opens their own Settings / Integrations / Connections page, reviews requested access, authorizes a connector grant in the browser, and sees user-scoped connection status.
2. User opens `/marketplace-capture/intelligence/connector-lab`, enters a keyword, runs a test search through their live connector if authorized or through fixture replay if not, and inspects returned fields.
3. User saves a sanitized field sample with payload shape hash and field coverage.
4. User promotes a validated result into a marketplace search snapshot.
5. User links or enriches existing Marketplace Capture products through explicit match confidence and provenance rules.
6. Operator or growth user later queries their permitted snapshots to compare visibility, pricing, seller presence, review counts, and hero SKUs.

## Production Constraints

- Feature flags must be disabled by default.
- All persisted connector rows must include user and tenant ownership.
- Connector grants must be stored as hashed, scoped, expiring, revocable records.
- Connector grants, probes, raw payloads, reports, watchlists, and connector-only product evidence are user-scoped in v1.
- Raw payload access must be restricted to the owning user, retention-bound, and hidden from shared Marketplace Capture product collaborators.
- Unknown fields must be retained safely for diagnostics without breaking normalization.
- Marketplace Capture remains the canonical product system; connector enrichment appends evidence/metric snapshots and must not silently overwrite user-confirmed product truth.
- Live connector failures must not block fixture replay, schema tests, or UI development.
- UI must follow Astryx/repo design rules and must be verified in browser on desktop and mobile widths.
