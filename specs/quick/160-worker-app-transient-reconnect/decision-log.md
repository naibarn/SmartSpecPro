# Decision log

## Decision 1: End-to-end typed status

**Chosen:** Add a typed health status at the Rust/React boundary.

**Rejected alternatives:** UI-only suppression would keep the underlying
credential/transient ambiguity; a new server protocol would increase rollout
risk without being necessary.

## Decision 2: Two-minute recovery budget

**Chosen:** Use a two-minute transient budget as approved by the user.

**Trade-off:** A longer outage becomes visible as unavailable, but the app does
not incorrectly claim that credentials are revoked.

## Decision 3: Preserve credentials on unavailable

**Chosen:** Retain saved credentials for transient and unavailable states.

**Reason:** A timeout cannot prove whether the refresh request was committed;
the existing server grace window makes retry safe for the short ambiguity window.

## Planning depth

Standard quick-plan: the change is limited to one Rust command module, one UI
module, and focused tests. No schema, auth, or deployment changes are needed.
