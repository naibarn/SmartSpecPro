# Section 03 — focused verification

- Run focused client and server Vitest suites.
- Run the affected workspace typecheck.
- Review diff for tenant safety, accidental eager requests, and unrelated worktree changes.
- Report what remains unverified: browser waterfall/real production latency unless a live browser session is available.
