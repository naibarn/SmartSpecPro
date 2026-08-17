# Code Review: Section 01 — Server contract

Initial review found two actionable gaps: tests asserted only mocked query-chain
calls instead of exact owner/status/archive/cutoff predicates, and the router
duplicated the 5/7/10 literals. Both were auto-fixed.

Re-review verdict: **PASS**. The service-owned schema now derives from the one
threshold tuple and the focused tests assert tenant/user, unarchived, eligible
status, strict cutoff, valid/invalid threshold, and affected-row behavior.
