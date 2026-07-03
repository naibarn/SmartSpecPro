# Orchestra Decisions

## Accepted Planning Decisions

- Use a central age-safety policy layer for the whole system, not page-specific checks.
- Require DOB and country/region for human users after login before normal product use.
- Treat unknown/incomplete profile as child-under-13 until completion.
- Keep adult-only product posture as the default launch-safe mode; age-tiered access remains a legal/product gate.
- Compute age from DOB and current evaluation date; do not store age as the source of truth.
- Use versioned, data-driven jurisdiction presets with Thailand, United States, EU/EEA, and global fallback coverage.
- Preserve existing Private Vault behavior and add separate protected-surface tokens for age/sensitive-surface unlocks.
- Enforce policy server-side for chat, media, async jobs, generated assets, external actors, and admin surfaces.
- Roll out with observe/prompt/enforce/emergency modes and explicit rollback paths.
- Add `x-protected-surface-token` as a distinct header/context path; do not reuse `x-private-vault-token` for age unlock.
- Add tenant age-safety flags to `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- Use dedicated `adminSafety` validation/audit for active policy writes even if storage is backed by `system_settings`.
- Treat `llmRoutesHandler.ts`, public API `requireScopes`, and MCP delegated session context as first-class implementation surfaces.
- Use one canonical tenant normalization path before policy lookup, token validation, audit writes, and domain-admin policy changes.
- Treat locale, IP geolocation, timezone, and billing country as redacted mismatch/risk signals, not substitutes for user-declared residence country.
- Return structured `country_profile_invalid` and `safety_profile_required` responses for non-browser clients.
- Keep recovery, Settings/Security, profile completion, support/account, admin safety recovery, and emergency kill-switch paths reachable under profile-completion enforcement.

## Deferred Decisions

- Exact legal text, consent model, and retention periods require legal/product approval.
- Final database column/table names should follow the repo's migration conventions during implementation.
- Whether to enable child/teen product access in production is outside this implementation plan and should be a separate launch decision.
