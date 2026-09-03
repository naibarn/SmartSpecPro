# Decisions

[2026-09-02T08:26:10Z] DECISION: Treat the current target as local Debian Beta and keep Cloud packaging out of the completion gate.
  Context: The user clarified that the product is still run locally on Debian and is not deployed to Cloud.
  Alternatives considered: Requiring Cloud Run/image validation would be incorrect for the current operating mode; retain Docker checks only as future packaging evidence.

[2026-09-02T08:26:10Z] DECISION: Run the audit inline in standard light mode with no sub-agents.
  Context: No Task/sub-agent tool is exposed, and the worktree contains overlapping unrelated dirty changes; the conductor can safely perform bounded sequential reviews.
  Alternatives considered: Parallel agents would increase collision risk without adding available execution capability.
