# Code Review: Section 03 - Milestone Event Instrumentation and Idempotency

## CRITICAL

### 1. eventKey includes dayBucket, which could allow duplicate milestones across days
The tracker's `buildFunnelEventKey` includes a day bucket, so the same user's "signup_completed" on different days gets different keys. The `hasExistingMilestone` check is the defense, but needs a real default implementation.

### 2. TOCTOU race between hasExistingMilestone and trackEvent
Two concurrent requests can both pass the check before either insert completes. DB constraint catches same-day races, but cross-day needs the milestone check.

### 3. No actual integration into registration/verification/chat/LLM/media/purchase flows
The module is standalone - no router or service imports it yet. The section plan requires wiring into actual lifecycle flows.

## IMPORTANT

### 4. No default production implementation of hasExistingMilestone
When undefined, the pre-check is silently skipped. Needs a real DB query implementation.

### 5. purchase/subscription events with dayBucket key could dedup same-day purchases
Two purchases on the same day would collide on the eventKey.

### 6. emitCounter has no default production implementation
Counters are no-ops in production.

### 7. No transient vs permanent failure distinction

## MINOR

### 8. Property spread order allows caller to overwrite canonical fields
Caller `properties` spread last can overwrite `source`/`plan`/`channel`.

### 9. Unnecessary type cast on input.properties

### 10. MILESTONE_EVENTS could use stronger typing

### 11. Missing JSDoc on public API functions

## POSITIVE
- Clean DI pattern for testability
- Non-blocking error handling
- Consistent counter emission
- Thorough test coverage
- Good separation of concerns (milestone policy vs tracker mechanics)
