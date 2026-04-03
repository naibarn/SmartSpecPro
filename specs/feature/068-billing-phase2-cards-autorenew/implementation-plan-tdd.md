# TDD Plan — Feature 068: Billing Phase 2

## 1. Schema and service tests

- payment-method records persist only masked metadata and provider references
- only one default payment method exists per user/tenant scope
- deleting a default method for an auto-renew subscription is rejected unless reassigned or disabled
- consent state is required before off-session auto-renew enablement

## 2. Provider adapter tests

- setup-intent creation never returns raw card data for persistence
- confirmation stores provider reference and masked card presentation only
- provider setup failure does not create partial active payment methods

## 3. Renewal orchestration tests

- auto-renew creates exactly one renewal attempt per cycle
- successful off-session payment marks invoice paid exactly once
- stale success from superseded retry attempt does not apply effects twice
- hard-decline skips retry and transitions to dunning/manual-fallback

## 4. Dunning and retry tests

- retryable failures schedule bounded retries only
- retries do not create duplicate active attempts
- exhausted retries trigger visible dunning/manual-fallback state
- pause dunning suppresses further retry scheduling until resumed

## 5. Authorization and UI tests

- users can manage only their own payment methods
- masked card data is shown in user/admin UIs
- finance/billing roles are required for force retry, revoke, and manual fallback actions
- disabling auto-renew updates future renewal behavior only
