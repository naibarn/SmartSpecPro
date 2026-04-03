# Section 02 — Provider Setup and Vault References

## Goal

Add provider-hosted tokenization/setup flows and normalize provider payment-method references into the new payment-method domain.

## Deliverables

- provider abstraction for setup intent / confirmation
- Beam implementation for card setup
- normalization of card brand/last4/expiry/provider refs
- failure handling for abandoned or partially confirmed setup flows
- capability matrix and fallback behavior for unsupported Beam accounts/environments

## Notes

- no raw PAN or CVV may be persisted or logged
- webhook or callback reconciliation may be needed for delayed confirmation flows
- uncertain provider capabilities should map to feature-flagged disablement, not partial silent rollout
