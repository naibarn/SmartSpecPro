# Section 02 — Retrieval, Operational, Capability and Runtime Brokers

## Source coverage

Feature 198 sections 13–30, 53–79, 88–132, 139–151, 162, 170, 181, 184, 190–192 and 202.

## Deliverable

Implement bounded search-before-clarify, help/operational/context retrieval, capability lazy hydration, ACL/provenance, runtime selection and governed handoff to 196/199/200.

## TDD steps

Test retrieval outage/degraded answer, tenant provenance, stale capability, large results, context freshness and provider fallback before implementation; rerun focused tests.

## Completion gate

Derived context cannot cross tenant scope or override hard policy.

