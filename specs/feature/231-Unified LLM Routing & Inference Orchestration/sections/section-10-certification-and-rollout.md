# Section 10 — Certification and rollout

## Goal

Promote only a measured, signed and recoverable route bundle with proof matched to the actual target environment.

## Implementation

1. Maintain a traceability matrix for R2/R3/R4 acceptance clauses to named automated/manual/provider/production evidence.
2. Run full unit/contract, disposable DB, concurrency, provider-surface, browser and security suites; separate baseline errors from regressions.
3. Create a signed bundle binding spec UID/revision, router policy, model/deployment profiles, credential refs, pricing/FX, safety rules, route manifest, contract versions and rollback bundle.
4. Exercise billing outage, stale policy, provider ambiguity, route repoint, Worker crash, duplicate queue, stream interruption, regional failover and rollback in staging.
5. Canary one safe low-risk consumer, compare cost-per-success, p95, quality and error strata against deterministic baseline; expand only when measured gates pass.
6. Preserve independent rollback domains for RAG index, Redis migration and LLM router changes.

## Tests first

- Missing/ambiguous UID or incompatible contract stops release.
- Partial bundle activation is fenced; rollback restores a tested compatible bundle.
- In-flight plan stays on its pinned bundle; emergency revocation fences it.
- Production/target evidence is required and cannot be satisfied by a local health check or source assertion.
- Every specified R2/R3/R4 acceptance case has a result and evidence reference.

## Acceptance

- No unresolved release-blocking test or safety issue.
- Staging recovery and rollback have been exercised.
- Provider, DB, credential, route, billing, data-governance and operational owners sign the target evidence package.

## UI/UX Contract

### Target User / JTBD
N/A — release evidence and promotion gates only; operator UI changes belong to Section 09.

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
N/A — no user-facing copy changes.

### Browser Evidence Required
N/A — no UI is changed in this section; any browser evidence is owned by Section 09.
