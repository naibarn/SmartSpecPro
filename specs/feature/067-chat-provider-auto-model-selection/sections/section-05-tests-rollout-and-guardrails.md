# Section 05: Tests, Rollout, and Guardrails

## Purpose

Define the safe rollout path and the regression suite required before implementation is considered complete.

## Ownership

- test strategy
- non-regression guarantees
- rollout gating

## Target files

- client picker/chat tests
- `chatModelSelection` tests
- chat handler tests
- existing Kie route tests

## Implementation notes

### Required regression themes

- explicit OpenRouter non-regression
- provider-auto isolation
- fail-closed mixed-field validation
- route-family compatibility
- trusted capability derivation
- Kie inheritance through existing runtime

### Rollout order

1. picker and contract
2. resolver
3. capability derivation
4. runtime integration
5. observability

### Guardrails

- do not enable provider-auto entries for providers with no enabled models
- do not silently downgrade capabilities
- do not silently cross providers in provider-auto mode
- do not bypass Kie route-family guardrails

## Acceptance checks

- explicit users do not regress
- provider-auto fails clearly when no eligible candidate exists
- Kie and OpenRouter provider-auto are both test-covered before rollout
