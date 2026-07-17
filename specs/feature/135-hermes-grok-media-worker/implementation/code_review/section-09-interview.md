# Section-09 Code Review Triage — 2026-07-16

Mode: autonomous (user waived interviews). Auto-triage by conductor.

| # | Finding | Severity | Decision |
|---|---|---|---|
| 1 | Hermes denied by credit gate (2 of 10 surfaces) | BLOCKER | AUTO-FIX + spy tests |
| 2 | Test edits unstaged / index would fail | BLOCKER | AUTO-FIX (stage all six with the code) |
| 3 | Row 4 hermes untested | MAJOR | AUTO-FIX |
| 4 | Silent reference drop | MEDIUM | AUTO-FIX (audit + droppedReferenceCount) |
| 5 | "Undeclared third remediation" | MEDIUM | NO ACTION — predates section (verified) |
| 6 | media.ts → VD-named helper import | MINOR | ACCEPT (matches convention; follow-up) |

Pre-existing failures in touched files (verified independent of this section):
MCP guard removal from a concurrent session (task_bf5fa5be), 55 in
episodes.shotReferencesAndQualityReview from other in-flight work.
