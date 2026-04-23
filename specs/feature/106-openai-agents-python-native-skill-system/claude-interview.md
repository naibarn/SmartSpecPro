# Interview Transcript

## Q1. Implementation order

**Question:** Which implementation order should we assume for the plan?

**Answer:** Proceed with the full recommended sequence from the spec: native ISC target and exporter first, then evaluator/validator, then the dedicated Python runtime and supervisor, then Node registry/router integration, then legacy migration and maintenance hardening.

## Q2. Legacy migration scope

**Question:** Should the plan assume automatic migration for any bundle that passes validation, or start with a curated subset first?

**Answer:** Start with a curated high-usage/high-risk subset first, then expand the migration lane once the native path is proven safe. That matches the spec’s recommendation to prioritize the most executed and most brittle bundles.

## Auto-Decisions

- No additional business-domain clarifications were required.
- Technical architecture choices were decided from the spec and codebase:
  - Use `vitest` for web/Node tests and `pytest` for Python tests.
  - Treat OpenAI sandbox agents and lazy skill loading as the runtime target, based on the official docs and spec lock-in.
  - Keep the existing DB-backed registry during rollout, but make native-bundle metadata authoritative for the new path.
