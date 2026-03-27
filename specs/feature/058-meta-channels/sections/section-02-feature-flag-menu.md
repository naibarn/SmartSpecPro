# Section 02 — Feature Flag & Menu Registration

## Dependencies
- None (Batch 1 — parallelizable with sections 01 and 03)

## Overview
Register `META_CHANNELS_ENABLED` feature flag (default `false`) and add 4 Social menu items. Add 4 lazy-loaded routes in `App.tsx` with stub page components.

## Files to Create or Modify

| File | Action | Purpose |
|------|--------|---------|
| `apps/web/shared/featureFlags.ts` | Modify | Add flag to interface, allowlist, defaults |
| `packages/shared/src/constants/menu.ts` | Modify | Add 4 social menu items |
| `apps/web/client/src/App.tsx` | Modify | Add 4 lazy imports and routes |
| `apps/web/client/src/pages/Social{Channels,Inbox,Publishing,Moderation}.tsx` | Create | Stub pages |
| `apps/web/server/services/__tests__/metaFeatureFlag.test.ts` | Create | Tests |

## Tests First
```
# Test: META_CHANNELS_ENABLED exists in ALLOWED_FEATURE_FLAGS set
# Test: META_CHANNELS_ENABLED defaults to false in FEATURE_FLAG_DEFAULTS
# Test: menu items with requiresFeature="META_CHANNELS_ENABLED" — exactly 4 items found
# Test: menu items are hidden when flag is false, visible when true
# Test: social menu items have correct paths and sortOrder 7.0-7.3
```

## Implementation
1. Add `META_CHANNELS_ENABLED: boolean;` to `TenantFeatureFlags` interface, `ALLOWED_FEATURE_FLAGS` set, and `FEATURE_FLAG_DEFAULTS` (value: `false`)
2. Add 4 menu items: social-channels (7.0), social-inbox (7.1), social-publishing (7.2), social-moderation (7.3). All: `requiresFeature: "META_CHANNELS_ENABLED"`, `platforms: ["web","desktop"]`, `group: "main"`
3. Add lazy imports + routes in App.tsx under `<RequireAuth>`
4. Create minimal stub pages with title + "Coming soon" (full implementations in sections 04,07,09,10)
