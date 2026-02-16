# Section 03: Milestone Event Instrumentation and Idempotency

## Objective
Integrate funnel tracking into the highest-value lifecycle milestones (acquisition, activation, usage, and revenue) while preserving deterministic first-event behavior under retries and repeated triggers.

## Scope
- Wire tracker calls into registration/verification/auth and key usage/revenue surfaces.
- Ensure integration points produce canonical milestone names and property schemas.
- Use idempotent integration strategy so retries do not inflate first-event counts.
- Align live ingestion with dedup rules expected by backfill.

## Out of Scope
- Building analytics query endpoints.
- Dashboard UI construction.
- Backfill job logic beyond shared event-key rules.

## Dependencies
- section-02-tracker-service-dedup-and-analytics-sidechannels

## Implementation Tasks
1. Add instrumentation hooks for `signup_completed` and `email_verified` lifecycle points.
2. Add milestone hooks for first conversation, first LLM request, first media generation, and purchase/subscription milestones.
3. Ensure each hook uses common tracker interface and canonical event naming.
4. Standardize event properties needed by later aggregate queries (source, plan, channel, attribution metadata).
5. Add retry-safe invocation wrappers where upstream flows can replay.
6. Add instrumentation observability (success/failure counters by milestone).

## TDD-First Test Stubs
- Test: registration and verification flows emit expected milestones exactly once.
- Test: first conversation/LLM/media events remain single-count under repeated triggers.
- Test: purchase/subscription milestones emit correct event names and attribution properties.
- Test: auth or usage flow behavior is unchanged when tracking fails (non-blocking guarantee).
- Test: instrumentation for a single source event never produces multiple distinct first-event records.

## Risk Controls
- Never block user-facing auth/usage requests on analytics persistence errors.
- Keep event name/property registry centralized to avoid contract drift.
- Log missing-context instrumentation fallbacks for auditability.

## Deliverables
- Instrumented milestone producers across relevant backend flows.
- Shared event name/property contract reference for milestone events.
- Integration tests proving idempotency and non-blocking behavior.

## Done Criteria
- Core milestone coverage is complete for MVP scope.
- Duplicate-trigger scenarios preserve first-event integrity.
- Instrumentation does not regress existing functional flows.

## Actual Implementation

### Files Created
- `apps/web/server/services/funnelMilestones.ts` — Milestone tracking module with 7 exported functions (trackSignupCompleted, trackEmailVerified, trackFirstConversation, trackFirstLlmRequest, trackFirstMediaGeneration, trackPurchaseCompleted, trackSubscriptionStarted)
- `apps/web/drizzle/0027_add_funnel_milestone_unique_index.sql` — Partial unique index on (tenantId, userId, eventName) for milestone events

### Files Modified
- `apps/web/server/_core/oauth.ts` — Wired `trackSignupCompleted()` after user registration (behind ENABLE_FUNNEL_TRACKING flag)
- `apps/web/server/routers/chat.ts` — Wired `trackFirstConversation()` after conversation creation (behind ENABLE_FUNNEL_TRACKING flag)

### Deviations from Plan
- **email_verified**: No standalone email verification flow exists in the codebase. Email is verified via OAuth provider. Hook is defined but not wired; will be wired when email verification is implemented.
- **purchase/subscription**: No Stripe webhook handler exists yet. Hooks are defined but wiring deferred to when billing flows are implemented.
- **LLM/media milestones**: Wiring deferred to later phases to minimize diff size and rollout risk.
- **Partial unique index added**: Not in original plan but added after code review to enforce once-per-user milestone semantics at the DB level, protecting against TOCTOU races and cross-day duplicates.
- **Feature flag**: All integration points gated behind `ENABLE_FUNNEL_TRACKING` env var (default: disabled).

### Test Coverage
- 5 unit tests in `funnelMilestones.test.ts` — all passing
- Tests cover: idempotency (exact once), retry safety, attribution properties, non-blocking failure, multi-event dedup
- 12 total funnel-related tests passing (schema + tracker + milestones)
