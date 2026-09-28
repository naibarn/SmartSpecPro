# Section 02 — Inference contract and compatibility

## Goal

Create the strict, versioned server boundary used by all later waves without changing existing callers yet.

## Implementation

1. Define typed `InferenceIntentV2`, selection union, plan, rollout bundle reference, attempt receipt, effect reference and R4 fields under UID/revision.
2. Add strict Zod validation with field bounds, enumerated values, safe identifiers, integer USD micros and explicit optional/null behavior.
3. Construct trusted tenant/principal/credential-owner/budget values from authenticated server context; reject conflicting client-supplied values.
4. Add v1-to-v2 negotiation adapter that preserves supported fields and returns an explicit unsupported-requirement result; never silently weakens high-risk calls.
5. Define typed failures for policy-not-ready, no-route, consent-required, route-pin-unavailable, context-migration-required, deadline-exhausted and unknown-outcome.

## Tests first

- Missing/extra/boundary/oversized values, forged scope and secret-like evidence rejection.
- Selection mode compatibility matrix and v1 capability-gap reporting.
- UID/revision propagation and unsupported R4 mandatory-field behavior.

## Acceptance

- Pure contract package with no provider network I/O.
- Existing API request formats remain unchanged until consumer adoption.
- Failing validation returns stable typed reason codes without raw prompt leakage.

## UI/UX Contract

### Target User / JTBD
N/A — this section defines a server contract; caller UI is unchanged until Section 07/09.

### Existing Pattern Reference
N/A — no UI is designed or modified in this section.

### Surface Inventory
N/A — no UI surface changes.

### Component Map
N/A — no UI component changes.

### State Matrix
N/A — no UI states are introduced.

### Responsive Matrix
N/A — no UI layout changes.

### Accessibility Acceptance
N/A — no UI changes.

### Visual Direction and Tokens
N/A — no UI changes.

### Copy Contract
N/A — API reason codes are internal contract labels; translated UI copy is planned in Section 09.

### Browser Evidence Required
N/A — no browser-facing changes in this section.
