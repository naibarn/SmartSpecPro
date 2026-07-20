# Decision Log

## Planning depth

- depth: standard
- reason: medium cross-runtime bug affecting React, tRPC, Python middleware,
  production state, and tests, but with established interfaces and no schema
  change.
- promotion triggers: an incompatible API contract, migration requirement, or
  inability to derive a safe verified JWT identity.

## Decisions

1. Server-side task dispatch is authoritative. MCP tasks never reach Python
   fetch-result even if a client misclassifies them.
2. Client polling uses a reusable pure scheduler helper plus refs, so timing can
   be unit-tested without rendering the full Media History page.
3. A verified `openId` uses a SHA-256 digest in the limiter key to avoid storing
   or logging the raw identifier.
4. MCP hard timeout becomes media-type-aware: images/audio use a shorter
   bounded timeout while video retains the longer default.
5. No global limit increase. Raising the limit would mask the request loop.

## Self-review stabilization

- Round 1: added direct-task compatibility acceptance checks.
- Round 2: added raw-identifier privacy requirement.
- Round 3: added media-type timeout because the 24-hour image timeout prolonged
  the incident.
- Round 4: added dirty-worktree ownership constraints.
- Round 5: no meaningful gaps found.
- Round 6: no meaningful gaps found; plan stabilized.
