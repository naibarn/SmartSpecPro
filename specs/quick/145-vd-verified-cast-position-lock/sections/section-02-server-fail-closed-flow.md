# Section 02 — Server fail-closed flow

Ownership: shot video prompt service, episode router, and focused server tests.

Targets: prompt parameter/builder/validator, lock mutation, prompt execution,
image/cast invalidation, clip snapshot persistence, and paid-render gate.

TDD: missing/stale lock rejects before LLM; contradictory frame analysis rejects;
valid Shot 5 positions are used; paid render rejects lock mismatch before credits.

Acceptance: the current active anchor asset and exact cast set are authoritative at
both prompt and render boundaries; warning-only position degradation is no longer
allowed when a verified lock applies.

Risk: keep barrier multi-view coordinates independent and do not weaken existing
tenant, tie-in, safety, or provider gates.
