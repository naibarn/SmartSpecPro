# TDD Plan — Feature 068: Billing Phase 2

## 1. Payment-Method Domain

- test that payment methods persist provider references and masked metadata only
- test that only one default payment method exists per scope
- test that revoking a default method used by an auto-renew subscription is rejected unless reassigned or auto-renew is disabled
- test that consent fields are required before auto-renew enablement

## 2. Provider Setup and Compliance

- test that setup-intent creation stores no raw card payload
- test that confirmation persists only masked metadata plus provider reference
- test that failed or abandoned setup flows do not leave active orphan payment methods
- test that redaction rules cover provider setup payload views and logs
- test that provider-capability-disabled environments keep setup and auto-renew entrypoints gated off

## 3. Auto-Renew Orchestration

- test that one cycle creates one renewal attempt and one invoice
- test that off-session success marks the invoice paid exactly once
- test that stale provider success for a superseded retry attempt does not reapply business effects
- test that manual-to-auto and auto-to-manual mode changes affect future cycles only
- test crash recovery when a renewal attempt row exists but the provider charge result is unknown
- test double scheduler runs on the same cycle do not create duplicate active renewal-attempt paths
- test provider success arriving after manual fallback does not reactivate an automatic retry path silently

## 4. Retry and Dunning

- test that retryable failures schedule bounded retries only
- test that hard declines skip retries and move into dunning/manual-fallback state
- test that paused dunning suppresses new retries
- test that fallback to manual collection keeps the same invoice unless policy explicitly requires replacement
- test that reminder jobs respect dedupe, cooldown, and rate-limit policy
- test consent withdrawal after retry scheduling suppresses future off-session retries
- test revoking/deleting a card during an in-flight retry path moves the renewal attempt into `requires_new_card` or manual review

## 5. UI and Authorization

- test that users manage only their own payment methods
- test that admin views show masked card metadata only
- test that force retry, revoke, and fallback actions require billing authorization
- test that user UI shows grace/dunning state when renewal is failing
- test that high-risk user actions require recent auth/step-up confirmation when policy is enabled

## 6. Rollout

- test that Phase 2 feature flags disable setup, auto-renew enrollment, and retry automation cleanly
- test that subscriptions outside rollout cohorts stay on manual billing behavior
- test cohort rollback suppresses future automatic retries without mutating settled prior cycles
