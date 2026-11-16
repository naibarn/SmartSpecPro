# Harness Identity Contract v1 (R03.5 interim)

SPEC-309 was not present in the canonical local Spec inventory at the R03.5 baseline. This small contract establishes the identity boundary needed by the read-only Mission Control integration and remains subordinate to SPEC-310. It does not approve a Native Harness runtime, Chat-to-Native dispatch, or provider/API credential handling.

## Identities

- **HarnessType** is the supported Runner adapter ID plus its protocol and capabilities. Adapter IDs come from the authenticated Runner capability snapshot and the control-plane supported-adapter allowlist.
- **HarnessInstance** is the server-issued UUID for one `(tenant, Runner, adapter, tool)` tuple. Its immutable identity is distinct from the Runner ID and execution session ID.
- **HarnessSession** is the existing canonical Runner execution session. It may carry a Harness instance ID only when the server resolved and revalidated the exact instance for that Job attempt.
- **HarnessExecutionBinding** is the tuple of authorized tenant/workspace, canonical Job, exact Attempt UUID/number, Runner, optional Harness instance, existing execution session, and Run/Mission/Conversation only when each identity is available from an authoritative source.

## Producer and authorization

Registration is the projection of an authenticated Runner capability snapshot received through the existing Runner enrollment/session protocol. The server issues and preserves the UUID; the `(tenant, Runner, adapter, tool)` unique key makes repeated snapshots idempotent. Existing short-lived Runner credentials, session fencing, snapshot revision ordering, and idempotency-key conflict checks are authoritative. Heartbeat refreshes liveness only; it does not create a Harness or extend capability-snapshot expiry. Runner revocation revokes its Harness registrations.

Workspace IDs and capabilities are accepted only from the authenticated Runner snapshot and rechecked against the exact Job workspace at dispatch/session projection. Unknown entitlement or readiness stays unknown. Unsupported adapters, ambiguous instances, stale snapshots, revoked Runners, and namespace mismatches remain unbound/unavailable; the system must not guess a relationship.

## Canonical binding and read projection

The existing `worker_jobs` and `worker_job_attempts` remain lifecycle authorities. The existing `runner_execution_sessions` carries the optional Harness UUID and retains its Job attempt and fencing identity. The projection derives attempt, Run, event cursor, and execution session from those canonical records. A Mission is `null` until an explicit trusted Mission-to-Job binding source is available; Conversation alone is not sufficient to infer a Mission.

The catalog is a read-only, authenticated workspace projection. The server reauthorizes actor/workspace and exact canonical execution relationships on every request. UI tabs, refresh, split layout, and deep links never dispatch or cancel a Job and never serve as authorization evidence.

## Limits

This contract proves a Runner inventory identity projection and safe correlation boundary only. It does not prove that Codex, Claude, Hermes, or another Native Harness is installed, online, trusted, entitled, dispatch-ready, or operational without fresh authenticated Runner evidence and end-to-end runtime acceptance.
