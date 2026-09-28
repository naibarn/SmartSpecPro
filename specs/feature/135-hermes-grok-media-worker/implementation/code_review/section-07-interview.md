# Section-07 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews). Auto-triage by conductor.

| # | Finding | Severity | Decision |
|---|---|---|---|
| 1 | Secrets spread into Hermes child env | BLOCKER | AUTO-FIX (allow-list + leak tests) |
| 2 | Cache-scan signal structurally dead | BLOCKER | AUTO-FIX (allowed-before-forbidden) |
| 3 | Presigned PUT result ignored | BLOCKER | AUTO-FIX (ok-check + retry + typed fail) |
| 4 | Doctor capability never reaches server | MAJOR | AUTO-FIX at the privileged actor (pairing script); heartbeat metadata observability-only — conductor verified it cannot drive the gate |
| 5 | console.* + NOOP logger swallow | MAJOR | AUTO-FIX |
| 6 | No claim backpressure | MEDIUM | AUTO-FIX |
| 7 | Retryable code for permanent failure | MEDIUM | AUTO-FIX (HERMES_OUTPUT_INVALID reuse, documented) |
| 8 | Unbounded lock map | MINOR | AUTO-FIX |
| 9 | Unvalidated leftover output | NIT | AUTO-FIX |

Conductor verification of the agent's fixes (grep on disk, not report
trust): env allow-list present at all spawn sites; assertConfined order
inverted with rationale comment; PUT ok-checks present; pairing probes the
real doctor. Tests 115/12 files green.
