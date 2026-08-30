# Decisions

- Depth: standard quick plan. The change is cross-component but stays within the existing Worker App and worker queue contract.
- Polling: five seconds, with a single in-flight guard and cleanup.
- Status model: structured summary, not a boolean, so stale/unavailable and reconnect-required remain distinguishable.
- Overview: read-only aggregate; destructive queue actions remain in Queue.
