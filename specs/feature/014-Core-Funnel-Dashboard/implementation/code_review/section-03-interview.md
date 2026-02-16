# Section 03 Code Review Interview

## Decisions

### Issue #3: Integration wiring into actual flows
**Decision:** Wire core milestones (auth signup, first conversation) into actual flows behind ENABLE_FUNNEL_TRACKING feature flag. Defer LLM, media, and subscription wiring to later phases when those flows are modified.
**Applied:** Yes - oauth.ts (signup_completed), chat.ts (first_conversation)

### Issue #1/#2: eventKey dayBucket and TOCTOU race
**Decision:** Add partial unique index on (tenantId, userId, eventName) for milestone events. This provides DB-level enforcement of once-per-user semantics regardless of dayBucket or race conditions.
**Applied:** Yes - 0027_add_funnel_milestone_unique_index.sql

## Auto-fixes Applied

### Issue #4: Default hasExistingMilestone implementation
Added `defaultHasExistingMilestone()` that queries the DB, used as fallback when deps.hasExistingMilestone is not provided.

### Issue #8: Property spread order
Moved `input.properties` spread before canonical fields (source, plan, channel, attribution) so canonical values can't be overwritten by caller.

### Issue #9: Unnecessary type cast
Removed `as Record<string, unknown>` cast since type already matches.

## Let Go (with rationale)

- Issue #5 (purchase dayBucket dedup): Purchase events intentionally use regular dedup via eventKey. Multiple purchases per day is an edge case; if needed, purchase events can use a different key strategy in a future section.
- Issue #6 (emitCounter default): Observability infrastructure is out of scope for this section. The hook is in place for wiring.
- Issue #7 (transient vs permanent failure): Good improvement but adds complexity beyond section scope. Non-blocking guarantee is met.
- Issue #10 (stronger typing): Over-engineering for current needs.
- Issue #11 (JSDoc): Project convention is to avoid adding docs/comments to code unless logic isn't self-evident.
