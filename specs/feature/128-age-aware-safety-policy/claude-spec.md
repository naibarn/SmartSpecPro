# Synthesized Spec: Age-Aware Safety Policy

## Objective

Build a production-grade, system-wide age-aware safety policy for SmartSpecPro. The system must compute user age from date of birth, resolve jurisdiction policy from country/region of residence, and enforce age/content/surface rules across Chat, Media Studio, media generation, public API, MCP, widget, worker, private chat, shared assets, and future sensitive surfaces.

## Core Requirements

### Safety Profile

- Human login users must provide `dateOfBirth` and `countryOfResidence`.
- Age is computed from DOB and policy timezone at request time.
- Effective bands are `unknown`, `child`, `teen`, and `adult`.
- Missing DOB or country blocks normal product routes according to rollout mode and routes the user to a safety profile completion flow.
- Unknown DOB enforces as child-under-13.
- Missing/invalid/unsupported country resolves to `STRICT_UNKNOWN_COUNTRY`.
- Non-human actors do not get fake DOBs; they resolve owner/audience/tenant defaults.

### Legal Modes

- Adult-only service mode is the default because current public policy says the service is not intended for under-18 users.
- Age-tiered service mode is a future mode gated by legal/product approval, consent, support, and retention workflows.
- Country/jurisdiction presets must be data-driven, versioned, source-linked, reviewed, and fail closed when stale/unapproved.

### Security PIN And Protected Surface Unlock

- Existing Private Vault PIN/token behavior must continue to work.
- A new protected-surface token type handles age/private-chat unlocks.
- Protected-surface tokens include current user/tenant/scope/PIN/profile/policy/preset/day metadata.
- Tokens expire on logout/session end, day rollover, PIN/profile/policy/preset/tenant changes, explicit lock, or admin revocation.
- PIN unlock can satisfy only overridable gates and must not bypass hard-block safety/legal categories.

### Central Policy

- Admin-managed `AgeSafetyPolicy` controls thresholds, country presets, rollout mode, surfaces, menu items, route/action groups, prompt/media/model categories, custom topics, override rules, and hard blocks.
- Policy storage must be validated through a dedicated admin safety service/router.
- Generic settings routes must not be able to overwrite active policy.
- Domain admins are tenant-scoped; platform admins can manage global/default policy and validated target tenants.

### Enforcement

- Backend enforcement is authoritative.
- UI menus and route guards are UX guidance only.
- Chat prefilters prompts and context, attaches minimal provider policy instruction, filters output, and handles streaming without leaking unsafe partial tokens.
- Media preflights image/video/audio prompts before abuse hashing, credit reservation/deduction, provider dispatch, worker dispatch, MCP transport, or Python task creation.
- Async jobs revalidate at enqueue, dispatch, retry, provider callback, and final delivery.
- Generated/shared assets enforce viewer-time policy for preview/open/download/copy/remix/share/reference reuse.
- Provider payloads never include raw DOB, exact age, country, PIN state, guardian consent status, or full internal policy JSON.

### Rollout And Operations

- Tenant feature flags gate master policy, observe mode, DOB/country/profile completion, Chat, Media, protected-surface unlock, and emergency rollback.
- Enforcement modes: `observe`, `prompt_only`, `enforce_sensitive_surfaces`, `enforce_all`.
- Bootstrap exemptions always allow logout, account recovery, profile completion, security/PIN setup, help/support, and admin safety recovery.
- Metrics, alerts, runbooks, audit events, review queues, and kill switch must exist before broad blocking rollout.

### Privacy And Compliance

- DOB, country, consent metadata, and age-derived decisions are sensitive safety profile data.
- Raw DOB access is least-privilege and not shown in general admin/reporting surfaces.
- Safety profile data is redacted from logs, analytics, telemetry, session replay, feature flag payloads, and normal audit metadata.
- Export/delete/retention flows cover safety profile, consent, and retention records.

## Implementation Constraints

- Preserve existing Private Vault contract.
- Prefer existing feature flag, system settings, audit logger, route guard, tRPC, Express, Drizzle, Vitest, and pytest patterns.
- Use typed columns for production DOB/country enforcement; JSON prototype is acceptable only before broad enforcement.
- Follow database safety protocol before schema changes.
- Do not enable child/teen product access until legal/product launch gates are complete.

## Success Criteria

- Existing adult-safe Chat and Media Studio workflows do not regress.
- Unknown/incomplete human profiles are routed to completion or enforced as child-under-13 according to rollout mode.
- Chat, Media, public API, MCP, widget, worker, Python, async jobs, generated assets, and viewer-time access are covered by the same policy service.
- Blocked media requests do not reserve/deduct credits.
- Policy decisions are auditable, redacted, replayable, and operationally observable.
- Tests cover age calculation, profile completion, policy decisions, token validation, admin RBAC, chat/media enforcement, async revalidation, viewer policy, jurisdiction presets, i18n, rollout flags, and failure semantics.
