# Risk register

- No security findings; security gate not applicable.

## 2026-08-17 — Vertical Drama stale Draft cleanup

- Security gate: conditional pass; no open Critical, High, Medium, or Low findings.
- Resolved: bounded the preview query at the five-day cutoff and return only the
  aggregate archived-row count from the atomic update.
- Resolved: the dialog shows a stable localized failure message instead of raw
  server error details.
- Runtime proof still required: two-tenant authorization/count test and PostgreSQL
  `EXPLAIN (ANALYZE, BUFFERS)` on production-sized data.
- Browser proof still required: authenticated 5/7/10 selection, cancel,
  duplicate-submit prevention, and inbox refresh.
