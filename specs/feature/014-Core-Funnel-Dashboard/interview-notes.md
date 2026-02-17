# Interview Notes

## Session
- date: 2026-02-16
- planning_intent: `resume_progress`
- interview_mode: standard implementation clarification

## Q1. Retention definition by dashboard tab
User answer:
`hybrid rule by tab`

Interpretation captured:
- Retention tab: use activity-based retention (any qualifying activity in period)
- High-level engagement cards can still show login-centric metrics where appropriate, but retention cohorts use activity definition

## Q2. Tenant scope for domain_admin
User answer:
`both with fallback rules`

Interpretation captured:
- Primary filter should use resolved tenant context (`currentTenantId` / tenant middleware output)
- Fallback path should support domain-based attribution when tenant ID resolution is missing/inconsistent
- Implementation must make fallback explicit and auditable

## Q3. Backfill coverage
User answer:
`core milestone events only`

Interpretation captured:
- Backfill includes milestone lifecycle events only (signup_completed, email_verified, first_*, and purchase/subscription milestones)
- Full engagement catalog is not required in initial backfill to reduce risk and runtime

## Q4. Rollout strategy
User answer:
`gate behind feature flag + ship in phases (MVP tabs first)`

Interpretation captured:
- /admin/funnel must be behind feature flag for controlled rollout
- Phase 1 should ship MVP tabs and foundational metrics first
- Remaining tabs/events can follow in incremental releases
