# Section 03 — Capability Policy and Governed Execution

## Source coverage

Feature 199 sections 16–21, 27, 29 and Appendices I–N; cross-spec 195–200 execution boundary.

## Deliverable

Route MCP calls through Feature 196 capability policy, Feature 195 Jobs where durable and Feature 197 Runner for local upstreams. Recheck grants/revisions at effect time and reject Feature 200 direct upstream access.

## TDD steps

Test policy/approval deny, stale grant/lease, duplicate effect, provider outage, Runner disconnect, backpressure and direct-bypass rejection; implement; rerun.

## Completion gate

MCP execution has actor/tenant/grant/revision/Job correlation and bounded side effects.

