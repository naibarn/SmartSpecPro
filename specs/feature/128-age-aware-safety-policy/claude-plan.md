# Implementation Plan: Age-Aware Safety Policy

## 1. Summary

Build a central age-aware safety policy platform for SmartSpecPro. The implementation introduces safety profile data, policy services, protected-surface PIN unlocks, route/action enforcement, Chat and Media preflight, async job revalidation, generated-asset viewer policy, admin controls, audit/metrics, and rollout gates.

The plan is intentionally phased. V1 should ship observe/prompt-only foundation first, then enforce sensitive surfaces after tests, metrics, and rollback paths are proven.

## 2. Guiding Decisions

- Backend policy is authoritative; UI is advisory.
- Unknown DOB enforces as child-under-13.
- Missing country uses `STRICT_UNKNOWN_COUNTRY`.
- Current product policy remains adult-only until legal/product approve age-tiered minor access.
- Existing Private Vault token behavior remains unchanged.
- Protected-surface unlock tokens are separate from Private Vault tokens.
- Provider payloads receive only minimal age-policy instruction, never raw safety profile data.
- Generated content is checked again at viewer time.

## 3. Proposed Module Map

Backend services to add:

- `apps/web/server/services/ageProfileService.ts`
- `apps/web/server/services/ageSafetyPolicyService.ts`
- `apps/web/server/services/agePolicyEnforcer.ts`
- `apps/web/server/services/ageModerationClient.ts`
- `apps/web/server/services/safetyActorContextService.ts`
- `apps/web/server/services/securityPinService.ts`
- `apps/web/server/services/protectedSurfaceTokenService.ts`
- `apps/web/server/services/agePolicyAudit.ts`
- `apps/web/server/services/agePolicyMetrics.ts`

Backend routers/adapters to add or extend:

- `apps/web/server/routers/users.ts`
- `apps/web/server/routers/adminSafety.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/chat.ts` or existing chat/skill router boundaries
- `apps/web/server/_core/context.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/services/llmRoutesHandler.ts`
- `apps/web/server/middleware/requireScopes.ts`
- `apps/web/server/_core/mcpPublicServer.ts`
- public API, MCP, widget, worker, and Python-gateway adapters

Frontend to add or extend:

- `apps/web/client/src/App.tsx`
- `apps/web/client/src/lib/protectedSurface.ts`
- `apps/web/client/src/hooks/useSafetyProfileCompletion.ts`
- `apps/web/client/src/pages/Settings.tsx`
- `apps/web/client/src/pages/SafetyProfileCompletion.tsx` or focused Settings completion state
- settings locale files in English and Thai

Shared contracts:

- `apps/web/shared/ageSafetyPolicy.ts`
- `apps/web/shared/featureFlags.ts`
- `packages/shared/src/constants/menu.ts` for UX projection only

Data/model locations:

- `apps/web/drizzle/schema.ts`
- migration files generated through the repo's Drizzle workflow
- optional future tables for policy versions, jurisdiction presets, consent, retention, and audit/event materialization

## 4. Core Data Contracts

### Safety Profile

Production fields should be typed columns when enforcement becomes broad:

- `dateOfBirth`
- `dateOfBirthUpdatedAt`
- `dateOfBirthChangeCount`
- `countryOfResidence`
- `countryOfResidenceUpdatedAt`
- `countryOfResidenceChangeCount`
- `safetyProfileVersion`

Prototype fallback may use `users.userPreferences.safetyProfile`, but broad enforcement should not depend on JSON-only storage.

Country/residence rules:

- Store `countryOfResidence` as the user's declared residence country, normalized to supported ISO 3166-1 alpha-2 values where possible.
- Keep residence country separate from UI locale, browser language, timezone, IP geolocation, and billing country.
- Locale, IP, timezone, and billing country may be logged only as redacted mismatch/risk signals unless a separately reviewed policy allows them to affect access.
- Missing, invalid, unsupported, or stale country/preset resolves to `STRICT_UNKNOWN_COUNTRY` and returns structured `country_profile_invalid` or profile-required errors for non-browser clients.

### Completion Status

Expose a server-computed status:

- `complete`
- `missingFields`
- `requiredByPolicy`
- `enforcementMode`
- `actorKind`
- `tenantId`
- `exempt`
- `reasonCode`
- `returnToAllowed`
- `profileVersion`
- `policyVersion`
- `jurisdictionPresetId`
- `completedAt`
- `underMinimumServiceAge`
- `nextAllowedRoute`

### Policy Decision

Every policy decision should contain:

- allowed/action/reason/user message
- actual and enforcement age bands
- policy version and snapshot hash
- jurisdiction preset id
- classifier version/confidence bucket
- degraded mode
- redacted audit id
- sanitized input when applicable

Tenant comparison must use one canonical normalization path. Age policy should follow existing repo patterns that resolve domain admins through `registeredDomain -> tenants.primaryDomain` and compare normalized string tenant ids before policy lookup, token validation, and audit writes.

## 5. Policy Services

`AgeProfileService` owns DOB/country loading, age calculation, completion status, profile versioning, and under-minimum routing.

`AgeSafetyPolicyService` owns active policy loading, system setting/table storage, default seeds, jurisdiction preset resolution, policy versioning, snapshot hashing, stale-preset fail-closed behavior, feature-flag mode resolution, and kill switch.

`AgePolicyEnforcer` owns route/action checks and returns a typed decision. It must handle policy unavailable, classifier timeout, low confidence, stale presets, and observe-mode would-block decisions deterministically.

`AgeModerationClient` wraps content classification. It should support prompt, output, reference metadata, media prompt, generated asset metadata, and degraded-mode decisions.

`AgePolicyAudit` owns redacted event logging through the central audit logger.

## 6. Security PIN And Protected Surface Tokens

Keep Private Vault behavior intact. Add a shared `SecurityPinService` over existing Private Vault PIN storage first, and migrate storage only in a later explicit migration.

Add `protected_surface` unlock tokens with:

- explicit token type and scopes
- separate header `x-protected-surface-token`; do not overload `x-private-vault-token`
- user id, tenant id, PIN version
- profile version, policy version, jurisdiction preset id
- policy day key and expiry
- optional revocation support

Validation rejects wrong type/scope, stale PIN/profile/policy/preset/day, tenant mismatch, expired token, and revoked token.

Current codebase alignment:

- `TrpcContext` currently extracts only `privateVaultToken` from `x-private-vault-token`; add `protectedSurfaceToken` extraction in `apps/web/server/_core/context.ts`.
- Client tRPC header injection currently sends only `x-private-vault-token` from `apps/web/client/src/main.tsx`; add a separate protected-surface token helper/header and clear it during logout.
- Keep CORS allow-headers updated for `x-protected-surface-token` anywhere non-tRPC Express/SSE/public API/MCP routes need it.
- Private Vault tokens must remain token type `private_vault` and must not satisfy age unlock scopes unless a dedicated compatibility scope is issued.

## 7. Profile Completion Gate

Add a post-login safety profile completion gate for human users.

Client:

- extend `RequireAuth` or add `RequireCompletedSafetyProfile`
- preserve safe internal `returnTo`
- avoid redirect loops
- exempt logout, recovery, completion page, Settings/Profile, Settings/Security, support, and admin safety recovery

Server:

- expose `users.getSafetyProfileCompletionStatus`
- add set/update DOB and country mutations
- enforce completion server-side for protected product actions
- return structured `safety_profile_required` and `country_profile_invalid` errors for non-browser clients
- revalidate after save before releasing route
- invalidate profile completion, menu projection, protected-surface unlock, and policy decision caches after DOB/country, tenant, policy, preset, or enforcement-mode changes

If a completed profile resolves below `minimumServiceAge`, route to account/support/privacy/export/delete flow rather than normal product routes.

## 8. Admin Safety Policy

Add `adminSafety` router with:

- get/update active policy
- list jurisdiction presets
- test jurisdiction resolution
- test policy decision
- list audit events
- list/resolve review cases
- get policy metrics

RBAC:

- `domain_admin` is tenant-scoped
- `admin` can manage global/default and validated target tenants
- all tenant comparisons use normalized tenant id and must not trust Host-header-derived tenant context alone

Policy writes must validate the full policy shape and audit the actor. Generic settings routes cannot update active policy.

Storage and feature-flag fit:

- If using `system_settings`, add a dedicated `"safety"` category to `settingCategorySchema` only when the dedicated `adminSafety` service owns writes to the age policy key.
- Generic `systemSettings.updateSetting` must reject or ignore the active age policy key unless the write came through the validated admin safety service.
- Tenant rollout flags must be added to all three places in `apps/web/shared/featureFlags.ts`: `TenantFeatureFlags`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- Recommended flags: `ageSafetyPolicyEnabled`, `ageSafetyObserveMode`, `ageSafetyProfileCompletionGate`, `ageSafetyChatEnforcement`, `ageSafetyMediaEnforcement`, `ageSafetyProtectedSurfaceUnlock`, `ageSafetyGeneratedAssetViewerPolicy`, and `ageSafetyEmergencyChildSafeMode`.

## 9. Chat Enforcement

Add enforcement in:

- tRPC chat/skill execution
- `/api/llm/stream`
- OpenAI-compatible Chat/Responses paths if present
- Python chat endpoints if exposed

Request flow:

1. Build policy request context.
2. Classify user prompt and context metadata.
3. Apply policy.
4. Block/sanitize/require unlock or continue.
5. Attach minimal provider instruction.
6. Post-filter model output.
7. Store only safe output.

Streaming must not emit unsafe partial tokens before post-filter/repair/refusal can run. Use buffering, segment moderation, or safe holdback for child/unknown bands.

Codebase-specific routing:

- The active Node LLM boundary includes `apps/web/server/_core/llmRoutes.ts` and `apps/web/server/services/llmRoutesHandler.ts`; both must be covered because routed streaming can move through `handleStreamWithRouter`.
- Public/OpenAI-compatible routes that pass through `responsesRoutes.ts` or `/v1/*` auth paths need the same actor context builder and protected-surface token extraction.
- `chat.executeSkill` and any skill/orchestrator chat path must call the shared enforcer before provider dispatch, not only the visible Chat page.

## 10. Media Enforcement

Add age preflight before:

- abuse prompt hashing beyond minimal rate-limit needs
- model/pricing dispatch
- credit reservation/deduction
- provider/API/MCP/Python dispatch
- async worker enqueue or dispatch

Cover image, video, audio/TTS/native audio, voice cloning/reference media, negative prompts, selected models/providers, origin surface, and reference metadata.

Async jobs revalidate at enqueue, dispatch, retry, callback acceptance, and final delivery. Policy changes can cancel, release/refund, or quarantine jobs.

## 11. Generated Asset Viewer Policy

Generated media, chat artifacts, library items, marketplace captures, workflow outputs, and presentation/storyboard artifacts must store redacted safety metadata:

- content category
- policy version/snapshot
- creator enforcement band
- minimum viewer band
- review/quarantine state

Viewer-time enforcement applies to preview, open, download, copy, remix, share, export, and use-as-reference actions. Unknown public/share viewers fail closed to child-under-13 or stricter tenant default.

## 12. Non-Human Actors

Add actor/audience resolution for:

- API key/public API owner
- delegated worker owner and manifest restrictions
- widget visitor declared/default audience
- widget system users
- internal system agents
- MCP sessions

User-visible generation needs owner/audience context. Non-user-visible internal jobs may bypass age gates but not hard safety gates.

Current route fit:

- API key/public API routes should extend the existing `requireScopes` and `req.auth` context instead of inventing a parallel auth layer.
- MCP should derive actor context from `McpToolSession` fields such as `authMode`, `userId`, `ownerUserId`, `tenantId`, `workerId`, `workerJobId`, and `delegatedSessionId`.
- Widget system accounts matching `widget-system@{tenant}.internal` must be treated as system users; widget visitors still need an audience/default policy and fail closed when unknown.
- Delegated workers must inherit owner/audience policy and cannot upgrade beyond delegated scopes, worker manifest restrictions, tenant, or active job context.

## 13. Frontend UX And i18n

Settings/Profile and Settings/Security must show:

- DOB setup/edit
- country setup/edit
- derived age band
- active preset summary
- unknown child-mode warning
- legal adult-only copy
- Security PIN setup/change/lockout
- unlock state

Admin UI must show:

- policy editor
- jurisdiction preset list/tester
- custom rule mapping
- audit viewer
- review queue
- metrics

All copy must be localized in English and Thai.

Reachability requirements:

- DOB setup, Settings/Security, profile completion, support/account recovery, and admin safety recovery/kill-switch routes must remain reachable for unknown-age users or authorized admins.
- Blocked menus may hide or interstitial, but direct route/API calls must still receive backend policy decisions.
- UI caches must refetch after profile, tenant, policy, preset, enforcement mode, or protected-unlock changes.

## 14. Observability, Audit, And Review

Add explicit age-safety audit event helpers:

- policy decision
- observe would-block
- unlock
- admin update
- DOB/country set/change/blocked
- review required
- appeal created
- operational degraded

Metrics:

- decisions by tenant/surface/action/band/preset/mode/reason
- would-block rates
- classifier timeout/error/uncertain
- stale preset fallback
- no-credit-on-block
- token validation failures
- PIN failures/lockouts
- review and appeal outcomes
- Python bypass rejects

Alerts and runbooks must exist before blocking rollout.

Privacy redaction must cover logs, analytics, error telemetry, session replay, feature flag payloads, normal audit metadata, provider payloads, and admin/reporting list views. General admin/reporting views should use age band, completion state, policy version, and reason codes instead of raw DOB.

Consent and retention readiness:

- Age-tiered child/teen access must require verified consent records when the active jurisdiction preset requires guardian/minor consent.
- Under-minimum or consent-blocked users should create retention/support action records for restrict, export requested, delete requested, deleted, or tombstoned states.
- These records must store safe metadata only; no raw guardian identity documents, raw DOB copies, PIN values, token ids, or full prompts.

## 15. Rollout Strategy

Phase rollout:

1. Foundation and observe mode.
2. Safety profile and PIN UX.
3. Chat enforcement in observe, then sensitive-surface enforcement.
4. Media enforcement with no-credit-on-block gates.
5. Admin policy editor and operational tooling.
6. Viewer-time policy and deeper workflow/MCP/Python coverage.
7. Age-tiered minor access only after legal/product launch gates.

Tenant flags default to safe/off for blocking behavior.

## 16. Risk And Migration Strategy

High-risk areas:

- auth/profile completion route gating
- policy enforcement in tRPC/Express/Python/public API/MCP
- tenant isolation
- DOB/country sensitive data storage
- credit reservation/release
- streaming partial output
- async job stale policy state

Migration:

- begin with JSON prototype only if needed
- before typed columns: backup users table, inspect schema drift, run Drizzle migration safely, verify row counts
- no NOT NULL without safe backfill/default
- add policy storage and audit before enforcement

## 17. Verification Gates

Minimum gates per implementation wave:

- `cd apps/web && pnpm test -- <focused tests>`
- `cd apps/web && pnpm check` after TypeScript changes
- `cd python-backend && pytest <focused tests>` for Python routes/tasks
- browser/Playwright evidence for profile completion and Settings/Admin UX before broad rollout
- security review for auth, RBAC, tenant, token, profile data, and public API changes

## 18. Self-Review Notes

Plan self-review round 1 found likely gaps around streaming partial output, async job revalidation, viewer-time generated asset policy, and provider payload minimization. These are now included as explicit sections and acceptance criteria.

Plan self-review round 2 tightened codebase alignment for protected-surface token extraction, tenant feature flag allowlists/defaults, generic system settings write protection, active LLM handler coverage, public API/MCP/widget actor context, and consent/retention launch gates.

Plan self-review round 3 tightened acceptance-criteria details for canonical tenant normalization, structured non-browser profile errors, cache/projection invalidation, country mismatch signals, recovery/kill-switch reachability, and broad privacy redaction.

Plan self-review round 4 added an acceptance-criteria traceability matrix covering all 65 criteria and classified spec open questions as either implementation defaults or legal/product launch gates.

No unresolved required planning gaps remain. Legal/product decisions for age-tiered minor access are deferred as launch gates, not implementation blockers for adult-only/observe foundation.
