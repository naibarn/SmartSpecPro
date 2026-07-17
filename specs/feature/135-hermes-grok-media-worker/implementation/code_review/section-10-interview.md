# Section-10 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews). Auto-triage by conductor.

| # | Finding | Severity | Decision |
|---|---|---|---|
| 1 | Error presentation unreachable (MediaTask.errorCode missing) | MAJOR | AUTO-FIX cross-section (section-06 amendment) + consume here |
| 2 | Non-admin dead-end reconnect | MEDIUM | AUTO-FIX (isAdmin gate) |
| 3 | Error copy not swept into real toasts | MEDIUM | AUTO-FIX (both channels) |
| 4 | Image+video picker collision | MEDIUM | ACCEPT (matches pre-existing MCP behavior; commented) |
| 5 | Reconnect ignores retryable | MINOR | ACCEPT (reconnect ≠ retry) |
| 6 | Guard duplication | NIT | ACCEPT |
| — | ModelSelectorDialog gating reverted | — | ACCEPT (badge-only; hooks broke callers lacking trpc ctx; follow-up = props) |
| — | Ad-banner picker not built | — | ACCEPT (none exists for MCP either) |
| — | MediaStudio partial sweep | — | ACCEPT (no hermes wiring there; out of scope) |
