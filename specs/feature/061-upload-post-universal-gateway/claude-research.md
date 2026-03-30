# Research: Upload-Post Universal Gateway

## Codebase Findings

- User-scoped encrypted key storage already exists in [apps/web/server/services/userApiKeyService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/userApiKeyService.ts) and the matching UI in [apps/web/client/src/components/settings/UserLlmKeysPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/UserLlmKeysPanel.tsx).
- Tenant feature flags are handled in [apps/web/server/services/tenantFeatureFlagService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/tenantFeatureFlagService.ts) and enforced in routers through [apps/web/server/middleware/requireFeatureFlag.ts](/home/dev/projects/SmartSpecPro/apps/web/server/middleware/requireFeatureFlag.ts).
- The current generic feature-flag helper in [apps/web/server/services/featureFlags.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/featureFlags.ts) defaults to enabled, so Upload-Post needs a fail-closed helper instead of reusing the generic default.
- Encryption is centralized in [apps/web/server/services/crypto.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/crypto.ts) with AES-256-GCM and is already used for user-provided secrets.
- SSRF validation already exists in [apps/web/server/services/ssrfValidator.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/ssrfValidator.ts), and rate limiting is provided by [apps/web/server/_core/rateLimitedProcedure.ts](/home/dev/projects/SmartSpecPro/apps/web/server/_core/rateLimitedProcedure.ts) plus service-level limiters in [apps/web/server/services/rateLimiter.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/rateLimiter.ts).
- Existing social publishing is split across [apps/web/server/routers/socialPublishing.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/socialPublishing.ts), [apps/web/server/services/socialPublishingService.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/socialPublishingService.ts), and [apps/web/server/services/socialPublishGateway.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/socialPublishGateway.ts).
- Existing social background execution is intentionally parallel to the provider registry in [apps/web/server/services/socialBackgroundFacade.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/socialBackgroundFacade.ts) and [apps/web/server/services/social/providerRegistry.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/social/providerRegistry.ts); Upload-Post should follow the same "parallel path" idea rather than forcing itself into `SocialProviderAdapter`.
- The current social architecture already gates Meta flows on [apps/web/server/routers/metaChannels.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/metaChannels.ts), which provides a useful pattern for tenant feature gating and page ownership checks.
- Existing settings UI lives in [apps/web/client/src/pages/Settings.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/pages/Settings.tsx) and is composed of dedicated panels such as [apps/web/client/src/components/settings/UserAPIKeysPanel.tsx](/home/dev/projects/SmartSpecPro/apps/web/client/src/components/settings/UserAPIKeysPanel.tsx).
- The codebase uses Vitest for both unit and router tests, with fixtures and mocked tRPC callers in [apps/web/server/routers/__tests__/userApiKeys.test.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/userApiKeys.test.ts), [apps/web/server/routers/__tests__/socialPublishing.test.ts](/home/dev/projects/SmartSpecPro/apps/web/server/routers/__tests__/socialPublishing.test.ts), and [apps/web/server/services/__tests__/socialPublishingService.test.ts](/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/socialPublishingService.test.ts).

## Planning Implications

- Upload-Post should be modeled as a separate connection/profile/job subsystem, not as a new `socialProviderAdapter`.
- The plan should reuse the existing encrypted-secret, tenant-scoped, and rate-limited patterns rather than inventing new infrastructure.
- The plan should explicitly call out a fail-closed feature flag helper because the generic feature-flag service defaults to `true`.
- The frontend should extend the existing settings page rather than introduce a separate settings shell.

