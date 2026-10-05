# Spec 278 receipt binding review — 10 rounds

Date: 2026-10-05. Scope: M0 external-agent projection identity propagation and receipt-driven state projection. These rounds verify only this implementation slice; they do not certify the full Spec 278 rollout.

1. **Dispatcher projection identity:** compared the projection fields with the existing external-agent command; tenant, job, attempt, fencing token, runner and session generation are carried into the optional binding.
2. **Web command boundary:** confirmed `validateRunnerJobCommand` validates any supplied session binding against the canonical command identity before persistence/dispatch.
3. **Rust wire compatibility:** checked camelCase JSON naming for continuity/enforcement with aliases for the older Rust field names; legacy commands without `executionSession` remain accepted.
4. **Rust binding checks:** reviewed allowed binding keys, external-agent-only restriction and tenant/job/attempt/fence/runner equality. Focused Rust protocol regression passed.
5. **Receipt construction:** checked normal and recovery receipt builders include only the binding already present on the validated command; no terminal or workspace bytes are copied into the session projection.
6. **Journal replay:** confirmed the minimal command recovery context retains the optional binding without changing legacy `taskId` payload shape.
7. **Canonical ordering:** inspected Runner Control: `recordRunnerReceipt` completes before session projection is attempted; projection failure is caught, sanitized to a bounded error code and cannot reject the canonical receipt ACK.
8. **State transition/idempotency:** reviewed event mapping and SHA-256 idempotency key over command/event IDs; the service enforces current projection identity and CAS revision. Matching duplicate events return idempotently.
9. **Dark mode and defaults:** added receipt projection to the feature-off service test; flag-off operations return before DB access. The feature remains disabled by default.
10. **Final source/doc/test comparison:** corrected terminal create-state comparison to use the actual `state` input, updated Section 01/index records, and checked the diff for conflicts/whitespace. Focused Web: 21 passed across 3 files; Rust protocol regression: 1 passed; Rust format and `git diff --check`: passed.

## Remaining scope after these rounds

This closes receipt binding for the existing external-agent M0 shadow projection only. It does not wire Linux Session Host into canonical Worker start/recovery, issue or rotate execution grants, implement Windows/macOS hosts, durable server-side stream reconnect, provider/Cloudflare session adapters, Spec 280 grant/metering, migration application, browser certification, or Tier A–E rollout evidence. Those blockers remain open in the section matrix and must not be represented as completed implementation.
