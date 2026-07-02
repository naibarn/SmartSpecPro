# Section 07 - Security Observability Retention

## Objective

Add the production gates required before broader rollout.

## Scope

- Feature flags.
- Audit events.
- Rate limits.
- Structured logs and diagnostics.
- Raw retention cleanup.
- Rollback controls.
- User-scoped connection and raw-payload access controls.

## Implementation Notes

- Keep lab, imports, MCP writes, reports, keyword discovery, report image skills, shareable image exports, and watchlists independently flaggable.
- Audit authorization, write-back token/prompt creation, OpenAI-hosted write-back accepted/rejected, fixture replay, sample save, snapshot create, keyword discovery create/refresh, report create, image prompt/export create, raw read, raw redact, and revoke.
- Audit Settings connection changes, capability refresh, Marketplace Capture product enrichment, product-link confirmation, and connector-derived metric update.
- Rate-limit write-back attempts, keyword discovery refreshes, report/image generations, and write actions by user, tenant, connector, and keyword.
- Redact or delete raw payloads after retention without deleting normalized snapshot rows.
- Add rollback mode that disables live execution but keeps fixture replay and read-only browsing.
- Ensure group/shared Marketplace Capture product access does not expose another user's connector grant, raw payload, or user-only probe metadata.

## Tests First

- Feature flags deny actions by default.
- Audit events are emitted for every sensitive action.
- Rate limits return stable retry metadata.
- Keyword discovery and report image flags deny actions independently from snapshot browsing.
- Raw payload reads are owning user only.
- Retention cleanup redacts raw data and preserves normalized snapshots.
- Same-tenant different-user attempts to use, read, revoke, or refresh another user's connector grant are denied.
- Marketplace Capture enrichment events record user ownership and do not leak raw payloads to product collaborators.

## UI/UX Contract

### Target User / JTBD
Operators and admins need safe visibility into connection, import, redaction, and rollback metadata without raw payload access in v1.

### Surface Inventory
Settings connector diagnostics, Connector Lab diagnostics, Marketplace Capture enrichment status, connection event panel, future admin/operator diagnostics views.

### Component Map
Audit event list, rate-limit notice, raw access warning, retention status badge, rollback/write-back-disabled notice, product enrichment provenance badge.

### State Matrix
Normal, rate limited, raw hidden, raw readable by owning user, raw redacted, retention pending, write-back disabled, rollback active, audit unavailable.

### Responsive Matrix
Mobile shows concise status badges and expandable details. Desktop can show audit and diagnostics tables.

### Accessibility Acceptance
Security warnings must be text-visible, not color-only. Keyword discovery low-confidence/inferred labels must remain visibly marked. Destructive raw redaction actions need clear confirmation and focus handling.

### Copy Contract
Thai and English copy must distinguish live connector disabled, fixture replay available, raw data hidden, and retention/redaction complete.

### Browser Evidence Required
Playwright covers Settings connection state, live-disabled fallback, keyword discovery disabled/rate-limited state, rate-limit error rendering, raw-hidden diagnostics state, and Marketplace Capture product enrichment provenance.

## Acceptance Criteria

- Security review can approve a limited rollout.
- Operators can diagnose field changes and disable risky live paths quickly.

## Implementation Status

Completed for limited rollout foundation:

- Grant and intelligence data are scoped by `tenantId` and `userId`.
- Browser auth routes require session auth and reject missing tenant/user context.
- Grant responses expose hash prefixes only and do not return stored secrets.
- Grant lifecycle and connection events persist to dedicated tables when DB is configured.
- Tenant feature flags now exist for Connector Lab, imports, keyword discovery, reports, report image skills, shareable image exports, watchlists, and MCP writes.
- Admin tenant config surfaces each Marketplace Intelligence sub-feature flag separately.
- tRPC write paths fail closed by tenant flag when database-backed tenant configuration is active: field/sample imports, snapshot creation, keyword discovery create/refresh, report creation, image prompt exports, watchlist writes, and Marketplace Capture handoff writes.
- MCP write tools now fail closed by the tenant MCP-write flag plus the relevant imports/reports/watchlists sub-feature flag when database-backed tenant configuration is active.
- Snapshot storage intentionally omits raw item payloads; diagnostics report `rawPayloadStored: false`.
- Migration includes raw retention/redaction columns for field samples and snapshots.
- Diagnostics expose snapshot/report/watchlist counts, latest snapshot timestamp, field groups, and retention policy summary.
- Settings > Integrations exposes current-user connection controls and safe metadata.

Current limitation:

- Rate limiter metadata, complete audit-event coverage, and retention cleanup jobs are not yet implemented. These remain required before broad live rollout.
