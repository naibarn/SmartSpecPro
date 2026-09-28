# Review Round 04 — Migration Authority

Checks: Drizzle journal authority, SQL identity, manual/historical files,
second status columns, mutation/provider behavior, and concise evidence.

Finding: the aggregate verifier referenced a non-existent `sqlFiles` field and
printed an oversized raw object.

Fix: use journal-matched/unjournaled fields and emit bounded counts plus proof
flags from the CLI.

Remaining: production migration execution is intentionally out of scope.
