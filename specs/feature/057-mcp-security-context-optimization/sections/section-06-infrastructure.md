# Section 06 — Infrastructure Fixes

## Section ID
`section-06-infrastructure`

## Dependencies
- None (Wave 1 — parallel)

## Overview

Fixes systemd service configuration for subprocess safety: `KillMode=mixed` leaves orphaned stdio children on crash/restart, insufficient `TimeoutStopSec`, and missing resource limits for file descriptors and process count.

## Files Modified

| File | Path | Changes |
|------|------|---------|
| smartspec-backend.service | `docker/systemd/smartspec-backend.service` | KillMode=control-group, TimeoutStopSec=30s, LimitNOFILE=65536, LimitNPROC=4096 |

---

## TDD Specification

```
# Test: service file has KillMode=control-group
  - Read docker/systemd/smartspec-backend.service
  - Assert KillMode=control-group (not mixed)

# Test: service file has TimeoutStopSec >= 30
  - Assert TimeoutStopSec=30s or higher

# Test: service file has LimitNOFILE set
  - Assert LimitNOFILE=65536

# Test: service file has LimitNPROC set
  - Assert LimitNPROC=4096
```

These are file-content assertion tests, run via bash grep in CI.

---

## Implementation Guidance

### Changes to smartspec-backend.service

```ini
[Service]
# CHANGED: was KillMode=mixed — orphaned stdio children on crash
KillMode=control-group

# CHANGED: was TimeoutStopSec=15s — insufficient for stdio drain
TimeoutStopSec=30s

# NEW: MCP stdio processes add FD and process overhead
LimitNOFILE=65536
LimitNPROC=4096
```

### Deployment Steps

```bash
# 1. Edit source file
vim docker/systemd/smartspec-backend.service

# 2. Copy to systemd
sudo cp docker/systemd/smartspec-backend.service /etc/systemd/system/

# 3. Reload systemd
sudo systemctl daemon-reload

# 4. Restart service
sudo systemctl restart smartspec-backend.service

# 5. Verify
systemctl show smartspec-backend.service -p KillMode,TimeoutStopSec,LimitNOFILE,LimitNPROC
```

### Security Considerations

1. **Orphaned processes**: `KillMode=mixed` sends SIGTERM only to the main process. Child stdio subprocesses survive restarts, consuming resources and potentially holding sensitive state. `control-group` kills all processes in the cgroup.
2. **Resource exhaustion**: Without `LimitNOFILE` and `LimitNPROC`, MCP stdio processes can exhaust system-wide limits, affecting PostgreSQL, Redis, and other services on the same host.
