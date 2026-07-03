# TDD Plan: Age-Aware Safety Policy

Write tests before implementing each section. Use Vitest for `apps/web`, pytest for `python-backend`, and browser tests for critical UI flows.

## 1. Policy Foundation

- Test age calculation before/on/after birthday and leap-day birthdays.
- Test unknown DOB maps to `actualAgeBand=unknown` and `enforcementBand=child`.
- Test jurisdiction preset resolution for US, TH, GB, EU/EEA member overrides, unsupported country fallback.
- Test expired/unapproved presets fail closed.
- Test policy schema rejects unsafe defaults and unknown shapes.

## 2. Data And Safety Profile

- Test first-time DOB/country setup.
- Test country normalization and malformed/unsupported country fallback.
- Test declared residence country remains separate from locale, IP geolocation, timezone, and billing country mismatch signals.
- Test non-browser missing/invalid country returns `country_profile_invalid` with missing fields and next allowed route.
- Test completion status missing fields and `profileVersion`.
- Test profile completion projection invalidates on DOB, country, tenant, policy, preset, and enforcement-mode changes.
- Test under-minimum routing state.
- Test typed-column migration preserves users row count once migration exists.

## 3. Security PIN And Protected Surface Tokens

- Test existing Private Vault unlock remains valid.
- Test protected-surface token rejects wrong type/scope/tenant/PIN/profile/policy/preset/day.
- Test token expires on logout, day rollover, PIN version change, profile change, policy change, tenant switch, and revocation.
- Test failed PIN attempts are rate-limited and audited with redaction.

## 4. Admin Policy, Feature Flags, Audit

- Test age flags exist in `TenantFeatureFlags`, allowlist, defaults, and admin labels.
- Test tenant id normalization follows existing registered-domain/primary-domain patterns and fails closed on mismatch.
- Test the `"safety"` system setting category is present only when writes are mediated by `adminSafety`, or that generic settings reject the active age-policy key.
- Test `adminSafety.updateAgePolicy` validates schema and RBAC.
- Test domain admin cannot update another tenant.
- Test generic settings route cannot overwrite age policy.
- Test central audit helpers redact DOB, prompt, PIN, token id, provider payload.

## 5. Profile Completion UX And Backend Gate

- Test `users.getSafetyProfileCompletionStatus` shape.
- Test incomplete human user is redirected by route guard when enforcement requires it.
- Test exempt routes remain reachable.
- Test admin safety recovery/kill-switch remains reachable to authorized admins when profile completion is enforced.
- Test safe internal `returnTo` only.
- Test non-browser clients receive structured `safety_profile_required` errors.
- Test non-browser clients receive structured `country_profile_invalid` errors for invalid/missing country when relevant.
- Test multi-tab/profile/policy changes invalidate cached status.

## 6. Chat Enforcement

- Test chat prompt prefilter blocks child/unknown disallowed prompts.
- Test policy instruction does not include raw DOB/exact age/country.
- Test response filter replaces unsafe output.
- Test streaming route does not emit unsafe partial output before policy handling.
- Test `llmRoutes.ts`, `llmRoutesHandler.ts`, `/api/llm/stream`, OpenAI-compatible routes, and `chat.executeSkill` call the same enforcer.
- Test `x-protected-surface-token` is parsed through shared extraction for tRPC and Express/SSE routes.
- Test context-pack prompt injection cannot disable age policy.
- Test `/api/llm/stream` and tRPC chat/skill routes both enforce policy.

## 7. Media Enforcement And Async Jobs

- Test image/video/audio preflight before abuse prompt hash and credit reservation.
- Test blocked media requests do not reserve/deduct credits.
- Test allowed sanitized prompt uses sanitized hash/metadata.
- Test async job revalidates before enqueue, dispatch, retry, callback, delivery.
- Test stale queued job cancels/refunds/quarantines according to policy state.
- Test Python endpoint rejects public traffic without policy envelope.

## 8. Generated Asset Viewer Policy

- Test generated asset stores redacted safety metadata.
- Test child/unknown viewer cannot preview/open/download adult asset via direct URL.
- Test public/share links fail closed for unknown viewers.
- Test quarantined/review-pending assets cannot be reused as references.
- Test safe-for-child asset remains available only when current viewer policy allows it.

## 9. Non-Human Actors

- Test API key inherits owner policy.
- Test public API `requireScopes` paths construct `SafetyActorContext` from `req.auth` and fail closed when owner/audience is missing.
- Test delegated worker inherits owner/audience policy and manifest restrictions.
- Test MCP sessions construct `SafetyActorContext` from `authMode`, `ownerUserId`, `workerId`, `workerJobId`, and delegated session metadata.
- Test widget system user does not require DOB.
- Test anonymous widget visitor defaults to child-under-13 unless approved audience context exists.
- Test system-agent internal non-user-visible task is not blocked by missing DOB, while user-visible generation is.

## 10. UI, Settings, Admin, i18n

- Test Settings shows DOB/country, age band, preset summary, PIN state, and adult-only legal copy.
- Test English and Thai locale keys exist for new Settings/Admin/Profile copy.
- Test Admin policy editor can test decisions and jurisdiction resolution.
- Test admin review queue redacts raw DOB/PIN/prompts.
- Test menu projection hides/interstitials blocked items but backend still blocks direct route calls.
- Test UI projections refetch after tenant switch, DOB/country changes, policy/preset version changes, enforcement mode changes, and unlock expiry.

## 11. Observability And Compliance

- Test metrics emitted for decisions, would-blocks, classifier timeout/uncertain, stale preset, PIN lockout, token failure, Python reject, and review outcome.
- Test audit events use explicit event types.
- Test review-required and appeal-created flows are tenant-scoped.
- Test export/delete/retention flows include safety profile metadata with proper redaction.
- Test raw DOB is absent from logs, analytics, error telemetry, session replay payloads, feature flag payloads, provider payloads, and general admin/reporting list views.
- Test guardian/minor consent records are required before enabling age-tiered minor access when a jurisdiction preset requires it.
- Test retention action records are created for under-minimum restriction, export/delete requests, deletion, and tombstone flows.

## 12. Rollout And Regression

- Test observe mode logs would-block but does not block safe existing workflows.
- Test prompt-only mode can prompt/route without hard-locking exempt flows.
- Test enforce-sensitive-surfaces blocks Chat/media/private/public API/MCP generation.
- Test kill switch returns blocking to observe while preserving audit.
- Test existing Private Vault and adult-safe Chat/Media workflows do not regress.
