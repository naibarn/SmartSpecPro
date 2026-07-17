# Code Review: Section 02 - Watchdog and Observability

Conductor review (standard light mode):

- Correctness: every tracked watcher request owns one timeout; responses clear timers; status remains single-flight.
- Recovery: timeout/protocol/stdin failures terminate only the owned child and exit non-zero for systemd restart.
- Resource safety: watcher cap is 4G, index cap 6G, and boot ordering prevents their previous startup overlap.
- Observability: user-slice cgroup events, SSH sessions/pre-auth processes, and managed/legacy MCP counts are logged; Docker probing is bounded to five seconds.
- Deployment: cleanup service is fail closed, timer is persistent, and logrotate uses daily plus 10M maxsize.
- Auto-fixes: added JSON-RPC error/EPIPE handling, an error-response regression test, and replaced `size` with `maxsize` to avoid overriding daily rotation.

Verdict: PASS pending installed-unit verification during Section 03.

Rollout repair: the first installed cleanup-service run failed closed because
`ProtectSystem=strict` made `/tmp` read-only. The final unit uses a private
writable temp directory and a narrow write exception for the shared lock path.

Security auto-fix: moved the shared lock out of world-writable `/tmp` into the
dev-owned runtime locks directory. The service now uses `PrivateTmp=yes` and a
single `ReadWritePaths` exception for that locks directory.
