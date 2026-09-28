# Code Review Interview: Section 03

Date: 2026-07-17

No unresolved product or data-safety tradeoff required user input.

## Auto-fixes
- Corrected cleanup-service filesystem hardening without broadening host write
  access.
- Moved the cleanup lock out of a world-writable directory.
- Reduced the cleanup service sandbox to Unix-socket-only access with no Linux
  capabilities, private network/devices, and protected kernel/control-group
  surfaces while retaining the `/proc` visibility required for launcher proof.
- Serialized the one-shot boot index before the persistent watcher to avoid a
  6 GiB plus 4 GiB startup overlap.

## Preserved by design
One legacy MCP container was consuming CPU during rollout. Process-tree evidence
showed its Docker launcher and remote client were still live, so it was not
removed. It later reached its existing 4 GiB/no-swap limit and only that
container was killed; host PSI remained zero and health stayed 200. This is the
intended containment boundary while future sessions adopt managed labels and
wrapper cleanup.
