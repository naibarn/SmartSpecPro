# SmartSpecPro Web Runtime Watchdog and Analytics Repair Design

Date: 2026-08-23
Status: Approved by user

## Goal

Prevent a hung `smartspec-web` process from remaining systemd-active while it
cannot serve requests, preserve bounded diagnostics before recovery, and repair
the Python analytics metadata type error.

## Design

The solution has two independent layers:

1. The Node web process emits runtime metrics for RSS, V8 heap, external/native
   buffers, array buffers, event-loop delay, and its service cgroup counters.
2. A host-side watchdog polls `/healthz` and the web cgroup independently. It
   captures bounded diagnostics and restarts only after consecutive failures or
   sustained `MemoryHigh` pressure, with cooldown and restart-loop limits.

The existing application watchdog remains useful for visibility, but it is not
the recovery authority because an event-loop hang can prevent in-process logic
from running.

## Recovery contract

- Poll interval: 10 seconds.
- Restart after 3 consecutive health failures or 3 consecutive samples above
  `MemoryHigh`.
- Cooldown: 5 minutes between recovery actions.
- Restart budget: 3 actions per 30 minutes; after that, alert and stop trying.
- A diagnostic capture is best-effort and bounded; failure to create a heap
  snapshot must never prevent recovery.
- Diagnostic artifacts are retained under `/var/lib/smartspec/web-diagnostics`
  with bounded age/size cleanup.

## Diagnostic contract

Capture cgroup counters, process status, `smaps_rollup`, thread wait state,
recent journal output, and a Node heap snapshot/report signal when supported.
When the process is in uninterruptible sleep, proc/cgroup evidence remains the
fallback and restart proceeds after the capture timeout.

## Analytics repair

Normalize analytics row metadata before accessing provider fields. The service
must tolerate a mapping, null, or an unexpected SQLAlchemy metadata object
without calling mapping methods on the latter. Regression tests cover all three
shapes.

## Safety and rollout

- Do not raise memory limits as the primary fix.
- Keep rendering and other heavy work out of the web process.
- Keep the repository systemd unit canonical and verify live-unit parity before
  enabling the watchdog.
- Live daemon reload/restart remains a separate operational action after code
  and focused tests pass.
