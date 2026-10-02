# Section 04 — Spec 266 Research and Evidence Integration

## Scope

Implement Spec 265 §§2.7, 10.1–10.3, 22–23 and §51.3A. Use canonical versioned Spec 266 contract only.

## Implementation

- Map ResearchNeed server-side to `spec266-research-v1`; derive identity/scope/policy and clamp budget.
- Bound deterministic idempotency canonicalization; cyclic, sparse, oversized, or non-JSON caller data fails closed before an identity is derived.
- Use canonical `worker_jobs`/outbox; no direct provider call or browser/local runtime fallback.
- Pin ResearchRun/admission/corroboration references into a new immutable AnalysisRun.
- Reauthorize and dedupe watch notices before analysis admission.

## Tests

Unknown contract/scope, budget clamps, idempotent admission, missing policy, unadmitted evidence and notice replay.
