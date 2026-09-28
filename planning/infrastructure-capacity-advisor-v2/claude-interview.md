# Stakeholder Decisions

No additional interview round was required. The user explicitly approved the
Hybrid information architecture and requested a complete implementation plan
based on the audit.

## Q1 — What should Admin see first?

**Answer:** The first tab must be a simple summary that states the current
assessment, the exact numbers used, the problems found, and the recommendations.
Deep evidence belongs in other tabs so the first view stays understandable.

## Q2 — How should assessments run?

**Answer:** Support both modes: automatic once per day and an Admin-confirmed
manual run.

## Q3 — What is the decision scope?

**Answer:** Assess CPU, RAM, disk/free space, temp files, long-running
background jobs, concurrent work, and related evidence to determine whether the
Home Server should continue, be optimized, be expanded, or move toward Cloud.

## Auto-decisions

- Admin-only access remains the security boundary.
- LLM remains advisory; deterministic server evidence owns status, severity,
  thresholds, coverage, and forecast values.
- A manual click will require an explicit confirmation and will use a guarded
  asynchronous run path to avoid duplicate/costly LLM calls.
- Unknown/stale/partial metrics are visible as insufficient data or coverage
  risk, never healthy by default.
- The first delivery will not provision Cloud, resize infrastructure, delete
  temp files, or migrate data automatically.
- The existing server timezone and existing worker/storage sources are used until
  the product has an explicit timezone or host-inventory setting.
