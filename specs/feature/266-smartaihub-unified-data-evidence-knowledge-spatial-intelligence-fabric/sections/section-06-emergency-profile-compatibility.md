# Section 06 — Emergency Profile Compatibility

## Scope

Implement Phase E adapters for hazard envelopes, hydrology, satellite/radar, human observations, camera/vision, correlation/fusion, timelines and impact assessment while preserving Spec 260 authority and Spec 262 rendering.

## Spec coverage

Spec 266 §§34–37, 46.9 and compatibility items 48–57, 78–79, 85.

## Implementation

- Reuse existing 260/262-owned records and map them losslessly to Fabric references.
- Keep all unverified Thailand source candidates disabled until rights, endpoint, cadence and schema are independently verified.
- Do not dual-write or perform destructive ownership migration; cut over one source only after replay proof and explicit operator procedure.

## Tests

- Compatibility projections, source-class preservation, no dual-writer assertions, correction and stale-data handling.

## Acceptance

Spec 266 §46.9 plus §46.11 items 78–79 and §46.12 item 85.
