# Section 07 — verification and rollout

Run focused shared, Worker, Python, and Rust tests plus static checks. Do not
run `npm typecheck`. Record rollout evidence for Quick canary, Full Scan
checkpoint/recovery, preview/render parity, Mark compatibility, model
capability status, and rollback. Perform at least ten explicit implementation
versus spec review rounds; fix material gaps before declaring complete.

Status: IMPLEMENTED: focused Vitest, Cargo, Python, static checks, planning
validation, and ten-round review artifact completed. `npm typecheck` omitted by
explicit user constraint.
