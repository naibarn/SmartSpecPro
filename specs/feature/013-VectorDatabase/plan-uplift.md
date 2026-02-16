# Plan Quality Uplift

Date: 2026-02-16
Target: `implementation-plan.md`

## Recommended Uplift Items

### U1. Define explicit rollback thresholds and windows
- severity: `high`
- impact: `high-impact`
- rationale: The plan references rollback on failure-rate/search regression but leaves concrete threshold windows partially implicit, which can delay incident decisions.
- concrete plan delta: Add explicit operational defaults (for example failure-rate threshold window, latency regression threshold, smoke test pass criteria) and where they are configured.

### U2. Add dual-write policy during staged cutover
- severity: `high`
- impact: `high-impact`
- rationale: Staged read cutover is defined, but write-path behavior during migration is not explicit. Missing dual-write policy can create divergence between old/new provider during campaign.
- concrete plan delta: Specify migration-time write policy (primary write target + optional mirrored writes), conflict handling, and reconciliation rules.

### U3. Introduce provider capability compatibility matrix in the plan
- severity: `medium`
- impact: `low-impact`
- rationale: Provider limits/feature differences are acknowledged but not mapped to concrete behavior decisions.
- concrete plan delta: Add a matrix that defines normalized behavior for topK, metadata filtering, namespace usage, and unsupported capability fallback per provider.

### U4. Add queue SLOs and backpressure controls
- severity: `medium`
- impact: `high-impact`
- rationale: Reliability is covered generally, but no explicit queue lag/error SLO or backpressure strategy is defined for large reindex campaigns.
- concrete plan delta: Define queue lag SLO, max retry policy, dead-letter handling, and intake throttling/backpressure triggers.

### U5. Expand migration safety with preflight checks
- severity: `medium`
- impact: `low-impact`
- rationale: Migration safety exists, but preflight validation sequence is not explicit.
- concrete plan delta: Add preflight checklist before migration/cutover (extension privileges, disk/memory headroom, index build limits, RLS policy dry-run).

### U6. Add acceptance-quality checks for search parity
- severity: `high`
- impact: `high-impact`
- rationale: Plan contains smoke/latency checks, but not explicit relevance-quality parity checks between old/new providers before cutover.
- concrete plan delta: Add sampled query-set parity evaluation and minimum quality threshold gate before read cutover.
