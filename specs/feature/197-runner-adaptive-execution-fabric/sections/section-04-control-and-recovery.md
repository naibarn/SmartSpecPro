# Section 04 — Control Channel, Journal and Recovery

## Source coverage

Feature 197 sections 12–21, 25–27, 31–39, 64–67.

## Deliverable

Implement command/event ACK, bounded local journal, replay/dedupe, reconnect/restart/sleep reconciliation, control precedence, cancellation cascade, local/cross-Runner handoff and process containment.

## TDD steps

Test drop-after-acceptance, duplicate/out-of-order event, restart, process hang/exit, cancel/steer/switch precedence, parent-child cascade and resource deadlock; implement; rerun.

## Completion gate

Unknown local state blocks unsafe completion and new claims until reconciliation is complete.

