# Section 03 — Policy admission and deterministic router

## Goal

Ensure every selection is automatically resolved from a strictly eligible candidate set.

## Implementation

1. Resolve emergency revocation, platform policy, tenant/project locality/provider allowlist, principal credential/model lock, workflow sensitivity, feature capability, qualification, health, deadline and budget in order.
2. Reject unknown/stale mandatory policy and credential state before any external classifier, semantic lookup or provider call.
3. Produce one explainable candidate filter receipt with reason codes and pinned policy/registry revisions; never include prompt text.
4. Score remaining candidates deterministically using calibrated quality/cost/latency/reliability/compatibility inputs.
5. Implement AUTO plus model/provider/local/platform locks and preapproved-equivalent fallback. Treat classifier, semantic and learned score as tie-breakers only.

PostgreSQL integration evidence now loads the three policy heads and a current qualification-profile head in the planning transaction. With an eligible synthetic server-certified profile, AUTO selects the provider allowed by all scopes and binds tenant, principal, trace, privacy and ZDR values from trusted server context. This verifies selection against persisted source rows; it does not prove the live certification workflow or an external provider request.
Two independent Node processes now run the same planning request against those persisted rows concurrently and both select the same deployment. This verifies multi-process consistency for the fixture snapshot, not production policy/profile readiness.

## Tests first

- Each hard exclusion and intersection order; candidate cannot be reintroduced by a soft signal.
- Stable tie-breaking, budget ceiling, cost snapshot freshness, token/context and deadline boundaries.
- Private request has no classifier/external egress before policy admission.
- Lock preserved; `ask` returns consent-required; no eligible route produces a typed error.

## Acceptance

- The routine path does not ask a user to choose a provider when an allowed candidate exists.
- No policy failure silently falls back to the legacy first-enabled-provider path.
- AUTO cannot choose uncertified, unauthorized, over-budget or feature-incompatible routes.

## UI/UX Contract

### Target User / JTBD
N/A — pure policy/router behavior only; no UI is implemented in this section.

### Existing Pattern Reference
N/A — no UI is designed or modified in this section.

### Surface Inventory
N/A — no UI surface changes.

### Component Map
N/A — no UI component changes.

### State Matrix
N/A — typed service outcomes only; visible states are in Section 09.

### Responsive Matrix
N/A — no UI layout changes.

### Accessibility Acceptance
N/A — no UI changes.

### Visual Direction and Tokens
N/A — no UI changes.

### Copy Contract
N/A — stable reason codes are not end-user copy; localization is in Section 09.

### Browser Evidence Required
N/A — no browser-facing changes in this section.
