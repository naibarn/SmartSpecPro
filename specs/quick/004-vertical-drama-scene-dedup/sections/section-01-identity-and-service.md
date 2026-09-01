# Section 01 — Identity and service

Ownership: shared location identity and special reference service.

Implement normalization and advisory candidate scoring. Preserve exact-key precedence and existing normal reconciliation semantics. Add service helpers that load only the owner-scoped series roster and resolve exact reuse, near-match review, or explicit create.

TDD: pure scoring tests first, then service tests with mocked DB rows. No direct production DB mutation.

Risk: false positives; candidate output must not auto-merge.
