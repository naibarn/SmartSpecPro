# Risk Register - SocratiCode lifecycle hardening

| Risk | Control | Fresh evidence | Residual state |
|---|---|---|---|
| Active MCP session deleted | managed/project/grace/caller and PID+UID+start-tick+cmdline gates; legacy report-only | cleanup fixtures and live dry-run | Low; uncertain state always preserves |
| Docker stall amplifies outage | every cleanup probe/mutation is timeout bounded | timeout fixture; monitor probe bounded to 5s | Low |
| Hung watcher request leaks children | request watchdog, single-flight status, controlled child termination, systemd restart | 4 watcher tests and live MCP smoke | Low |
| Boot index and watcher exceed slice together | index is oneshot and ordered before watcher | installed unit verification | Low |
| Cleanup service gains broad host access | non-root user, empty capabilities, private network/devices/temp, strict system/kernel/cgroup protection, AF_UNIX-only sockets, one writable lock path | installed unit, security analysis, and successful service run | Low |
| Logs refill disk | daily/10M maxsize rotation, five retained compressed generations | installed logrotate debug parse | Low |
| Existing legacy session remains busy | live-client preservation plus per-container 4 GiB/no-swap and aggregate slice limits | busy legacy session reached its cap and was killed locally; monitor alerted; follow-up PSI/counters/health stayed stable | Low; two remaining legacy clients are idle and report-only |
| Alerts do not leave host | local logs and thresholds work; webhook unset | fresh crash-monitor run | Optional external follow-up |

Security verdict: PASS. No secrets, network policy, application authorization,
database, tenant boundary, or user data paths were changed.

## Media polling and rate-limit containment - 2026-07-20

Verdict: PASS

| ID | Severity | Category | File | Description | Status |
|---|---|---|---|---|---|
| MP001 | INFO | IDOR | apps/web/server/routers/media.ts | MCP task lookup is scoped by authenticated `ctx.user.id`; direct tasks retain protected Python ownership checks | closed |
| MP002 | INFO | JWT | python-backend/app/core/middleware.py | Limiter identity is derived only after signature/type verification; raw `openId` is digested | closed |
| MP003 | INFO | Client abuse | apps/web/client/src/lib/mediaHistoryPolling.ts | Per-task cooldown and single-flight reservation prevent rerender request amplification | closed |

Verdict rationale: no auth bypass, IDOR, secret exposure, raw identifier logging,
or tenant-boundary regression was found. Anonymous requests retain the IP
limiter, and authenticated claim compatibility does not bypass token
verification.
