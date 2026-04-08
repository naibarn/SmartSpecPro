# Section 01 — Payment Methods and Consent

## Goal

Add the domain model for saved cards and auto-renew consent without exposing raw card data to application storage.

## Deliverables

- `billing_payment_methods` schema
- `subscription_payment_settings` schema
- `payment_method_audit_logs` schema
- service functions for list/add/default/remove/revoke
- consent versioning and audit entries
- uniqueness guards for one default method per scope and one active settings row per subscription
- consent snapshot payload shape

## Notes

- this section must land before any off-session charge flow
- all UI must show masked card metadata only
- define withdrawal semantics for future cycles before API contracts freeze
