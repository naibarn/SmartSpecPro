# Section 02 - Auth Grants Browser Flow

## Objective

Implement browser-based SmartSpecPro write-back authorization with user-scoped, expiring, revocable grants managed from Settings > Integrations / Connections. This grant lets an OpenAI-hosted Shopee connector flow save data into SmartSpecPro; it is not a Shopee OAuth grant.

## Scope

- Shared grant status contracts.
- REST routes for status, start authorization, complete authorization, revoke, and connection events.
- Grant service that stores hashed identifiers and safe metadata only.
- Settings UI wiring for authorize, complete, revoke, reconnect, defaults, and capability refresh.
- Marketplace Intelligence UI consumes grant status and deep-links to Settings, but does not own duplicate configuration.

## Implementation Notes

- Authorization must open or redirect through a browser page so the user can confirm rights.
- Workspace context must resolve automatically from the active request tenant/domain first, then from the authenticated user's current tenant, then from explicit URL/body tenant fallback for local or embedded flows.
- Never store external account credentials, OpenAI connector tokens, Shopee cookies, or connector-host session identifiers.
- Store grant hash, scopes, provider/account label if safe, expiry, revoked state, tenant, user, and audit metadata.
- Persist grant records with both `tenantId` and `userId`. Tenant flags enable the feature; the grant itself belongs to one authenticated user.
- Store user defaults for region, locale, result limit, and preferred source mode as user-owned connector settings.
- Fail closed on missing, expired, revoked, tenant-mismatched, or scope-missing grants.
- Fail closed on cross-user access even inside the same tenant.
- Offer fixture replay when OpenAI-hosted write-back data has not been received yet.
- Settings connector card must show only the current user's connection data: provider, safe account label when available, scopes, expiry, grant hash prefix, last status refresh, last test run, default region/locale/result count, capability version, and last Marketplace Capture enrichment update.
- A connected badge is not sufficient. The UI must distinguish `writeback_ready`, `waiting_for_openai_hosted_payload`, `snapshot_saved`, `writeback_rejected`, and `fixture_replay_only`.
- Revoke/reconnect must use confirmation dialogs and explain that revoking stops future OpenAI-hosted write-back imports but does not delete already saved snapshots unless the user chooses delete/redact separately.

## Tests First

- Status procedure returns stable status values.
- Start authorization returns a browser handoff URL and no secrets.
- Complete authorization stores hashed grant metadata.
- Revoke makes future write-back imports fail closed.
- Tenant/user isolation tests reject cross-user access.
- Settings UI tests cover connect/reconnect/revoke/defaults and ensure Marketplace Intelligence routes show status only.

## UI/UX Contract

### Target User / JTBD
Authenticated users need to see whether SmartSpecPro is ready to receive OpenAI-hosted Shopee data and revoke write-back access when needed.

### Surface Inventory
Settings > Integrations connector card, compatibility link on `/marketplace-capture/intelligence/connect/shopee`, and status summary on the Connector Lab.

### Component Map
Settings connector card, grant status panel, authorize action, revoke action, reconnect action, default region/locale/result-count controls, source mode preference, scope list, expiry display, safe account label, grant hash prefix, write-back unavailable notice, last write-back event, last saved snapshot, last Marketplace Capture enrichment update, audit/event list.

### State Matrix
Feature disabled, no tenant/workspace, not connected, pending, write-back ready without payload, recent write-back saved, expired, revoked, scope missing, upstream provider unavailable, capability refresh failed, loading, revoke pending, revoke success, revoke error, fixture replay only.

### Responsive Matrix
Mobile shows one status block and full-width actions. Desktop can show status, scopes, and events in adjacent panels.

### Accessibility Acceptance
Status changes are announced through visible text, buttons have clear labels, focus returns after authorization/revoke actions, provider/scopes are not color-only, and destructive revoke requires clear confirmation.

### Copy Contract
Thai and English copy must explain why write-back is unavailable, whether fixture replay remains usable, what revocation does, that the connection is private to the current user in v1, and that Shopee app connectivity lives in the OpenAI/ChatGPT host.

### Browser Evidence Required
Playwright covers feature disabled, not connected, write-back ready without payload, recent write-back saved, expired/revoked, revoke confirmation, upstream provider unavailable, fixture replay only, and mobile Settings layout with screenshots.

## Acceptance Criteria

- Users can see connection status and revoke access.
- Users manage connector configuration from their own Settings / Integrations area.
- Write-back imports are allowed only with an active scoped SmartSpecPro grant.
- A user cannot use another user's connector grant, snapshot raw payload, or write-back permission.
- The UI clearly explains unavailable write-back access without blocking fixture replay.

## Implementation Status

Completed for the browser-testable slice:

- Shared connector provider/status contracts exist in `apps/web/shared/marketplaceIntelligence.ts`.
- Canonical grant status now uses `pending` for started-but-unconfirmed browser handoff state.
- Browser-session-only routes exist under `/api/marketplace-connectors` for status, start, complete, revoke, and events.
- Grant metadata is tenant/user scoped, expiring, revocable, and exposes only safe identifiers such as hash prefixes.
- Grant rows and grant events now persist to the `marketplace_connector_grants` and `marketplace_connector_grant_events` tables when `DATABASE_URL` is configured, with in-memory fallback for local tests without a database.
- Grant routes auto-select workspace context from the tenant-resolved request URL/domain, with authenticated user tenant and explicit URL/body fallback.
- Settings > Integrations now includes `MarketplaceConnectorSettingsPanel` for authorize-in-browser, confirm, refresh, revoke, scopes, expiry, hash prefix, account label, and Lab deep-link.
- `/marketplace-capture/intelligence/connect/shopee` remains a compatibility surface and `/marketplace-capture/intelligence/connect/authorize` is available for browser authorization handoff.
- Tests cover shared contracts, authorization URL handoff, completion, revoke, no-secret response shape, and tenant/user isolation.

Current limitation:

- Applying the migration to a real environment requires running `npm --prefix apps/web run db:migrate` with `DATABASE_URL` configured.
