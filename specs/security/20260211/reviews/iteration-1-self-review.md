# Self Review - Iteration 1

**Mode:** self_review  
**Generated:** 2026-02-11

## Summary
The plan is directionally correct and aligned with the security findings, but it needs stronger implementation precision in four areas: URL policy contract, active-content handling details, tenant-scope migration strategy for ops data, and verification/rollback discipline.

## Strengths
- Captures all 5 core findings from the source spec.
- Preserves external image compatibility as a hard constraint.
- Separates policy hardening, tenant safety, and test hardening into independent workstreams.

## Critical Gaps to Address
1. URL policy lacks explicit allow/deny matrix by context
- Current plan states intent but not a concrete matrix for `sourceUrl`, `thumbnailUrl`, preview/open contexts.
- Risk: inconsistent behavior across endpoints and regressions in external image support.

2. Active-content strategy is not explicit on response behavior
- Need concrete serving behavior for uploaded active-content assets (attachment vs isolated domain) and content-type/disposition rules.
- Risk: partial mitigation that still allows browser execution in edge cases.

3. Tenant-ops hardening needs phased data model plan
- Callback tables currently lack tenant id; plan mentions options but not execution path.
- Risk: stalled implementation or partially scoped ops with false security confidence.

4. Test strategy lacks required command ownership and release gate
- No explicit mapping for where tests live and what must pass before deploy.
- Risk: security fixes ship without stable regression protection.

## Recommended Improvements
- Add URL policy matrix section with canonical examples (allowed vs blocked) and error semantics.
- Add explicit active-content response-control design.
- Define tenant-ops migration phases with temporary safeguards if schema migration cannot be immediate.
- Add release verification checklist + rollback strategy.

## Decision
Proceed after integrating the above improvements into `claude-plan.md`.
