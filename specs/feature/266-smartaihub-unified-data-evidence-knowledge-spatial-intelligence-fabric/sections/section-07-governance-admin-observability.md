# Section 07 — Governance, Packs, Admin, Observability

## Scope

Implement Phase F and cross-cutting operating surfaces: source/data/metric/semantic packs, supply-chain governance, rights/admin views, metrics, failure states and kill switches.

## Spec coverage

Spec 266 §§32–33, 38–43, 48–49, 46 and 47.

## Implementation

- UI uses established platform admin and Astryx components; every control calls a real authorized service and exposes loading/empty/error/success state.
- Source/pack/index kill switches are scoped and audited.
- Telemetry excludes secrets and raw restricted payloads.
- Production evidence is recorded separately from local code evidence.

## Tests

- Authorization and audit tests for administrative mutations; observability redaction and scoped kill switch.

## Acceptance

Spec 266 §§46–47 and 48 non-goals.
