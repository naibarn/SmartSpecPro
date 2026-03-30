# Section 01 - Provider Contracts and Catalogs

## Goal

Define the provider-neutral contract for social video publishing so Meta, TikTok, YouTube, and future providers can share one background surface.

## Scope

- Expand the provider catalog with `meta`, `tiktok`, and `youtube`
- Define canonical actions for publish, draft, schedule, status, cancel, and read metadata
- Keep planned providers separate from live providers
- Preserve the current Meta implementation while extending the registry

## Files Likely Touched

- `apps/web/server/services/social/providerCatalog.ts`
- `apps/web/server/services/socialBackgroundFacade.ts`
- `apps/web/server/routes/internalSocialActions.ts`
- `apps/web/server/services/social/providers/*`
- `python-backend/app/services/agency_tools.py`

## Acceptance Criteria

- Unknown providers fail with structured errors
- Live providers and planned providers are discoverable separately
- Callers use one canonical surface for background social actions
- Provider metadata includes supported action sets and capability flags
