# Section 01 — Contracts and Router

Add an owner-scoped Series planning-shell mutation and an active-plan snapshot
contract stored additively in the existing series `bible` JSON. Add an in-place
promotion path for the selected Draft/QC and expected-revision compare-and-swap.
Do not create a second workspace ledger/table.

Change recovery/status procedures so `includeHistory` defaults to false. Add an
explicit bounded history query; full Draft/QC content is fetched only after the
user selects a history item.

Tests must cover tenant/user mismatch, missing workspace, oversized payload,
stale version, and successful update.
