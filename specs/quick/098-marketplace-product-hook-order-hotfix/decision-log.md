# Decision Log

- Depth: `micro`. The defect is isolated to declaration order in one page plus one focused regression test.
- Chosen fix: move the complete Feature 136 derived-state hook block above the product loading/not-found guards.
- Rejected: rollback `70177883a`, because it spans 105 files and would remove unrelated functionality.
- Rejected: replace hooks with ordinary calculations, because moving them preserves the intended memoization and callback identity.
- Test style: extend the existing sequential UI source-wiring suite to enforce that the hook block precedes both early returns.
- Rollout: build first; atomic production swap only after explicit user confirmation.

## Self-review rounds

1. Completeness: added the exact five-hook scope and both early returns. Security: no boundary change. Missing improvement: regression guard added.
2. Contradictions: confirmed the test style matches existing page-test precedent. No auto-fix.
3. Failure modes: ensured not-found renders also keep stable hook order. No auto-fix.
4. Scope: confirmed no API, DB, or Feature 136 behavior change. No auto-fix.
5. Obvious improvement: included production URL and health verification after deployment. No auto-fix.
