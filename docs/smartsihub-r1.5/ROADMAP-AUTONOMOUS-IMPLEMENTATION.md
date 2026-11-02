# SmartAIHub Modular SaaS — R1.5 implementation roadmap

**Decision date:** 2026-11-02
**Status:** Proposed sequencing. No implementation or deployment is claimed.

## Product and environment boundaries

| Target | Current registered role | Current evidence | R1.5 rule |
|---|---|---|---|
| `smartaihub.app` | `legacy-debian-dev`, existing Debian SmartAIHub Legacy | Existing app on `smartspec-web.service`, port 3000 | Keep serving Legacy users. It may be an optional development command tool where a specific Goal path is proven. No full Legacy migration gate. |
| `aimarkethubs.com` | `modular-debian-dev` | Prepared, `applicationAvailable=false`, `deployable=false`; healthy existing port-3100 service remains | Do not claim a Modular deployment or switch traffic until its replacement is healthy and handover is intentional. |
| `smartsihub.com` | `modular-cloudflare-prod` | Registered, not activated; no current-account zone or deployability proof | Future separate production authority. Do not activate or create resources in this SPEC-only package. |

The hostname, `NODE_ENV`, DNS proxy, repository label and account membership do not establish application identity, database authority or permission to deploy. Before any future release, resolve the exact target from `apps/web/scripts/deployment-targets.json` and assert app, runtime, service, port, database authority, deployment identity and traffic effect.

The registry currently names `smartspec` as the logical production database contract but does not prove a live connection or shared credential. Before future production provisioning, verify and reconcile this mapping to the isolated production database authority required by R1.5. Do not infer or migrate user or financial data from this documentation.

## Delivery sequence

1. **Usable Core boundary.** Establish isolated new-platform identity, tenant membership, sessions, scoped actions, canonical job/finance integration and a verified environment-specific database boundary. No parallel ledger, settlement or job authority.
2. **Chat plus persistent Agent.** Make Chat the signed-in home. Persist Agent identity and Goal/Run state with event-driven Workers/DO/Workflow/Queue behavior; show truthful wait, pause and revoke states. Closing the browser must not cancel authorized durable work.
3. **Complex task surfaces.** Add Task Control, Mission Control, the shared Web Chat/desktop Companion frontend and typed action registry. Preserve the same thread, Goal, job, run, device and artifact IDs across surfaces.
4. **Mini App Creator and modular services.** Add per-App capability manifests, isolated data planes and BYOC scopes. Treat imported listings, skills and module code as untrusted.
5. **Optional execution routes.** Use on-demand approved Browser Run, Container, external worker or device Executor only where the workload requires it. Remote Runner execution stays disabled until SPEC-325 enrollment, signed envelope, revoke/reconnect, endpoint isolation, update-integrity and locked-session cases pass in a guarded non-production environment.
6. **Incremental deployment and handover.** Release one module at a time through the exact registered target and its authorized release identity. A Goal has one dispatch owner; transfer only at a durable checkpoint after revoking the prior lease. Keep rollback evidence and preserve Legacy operation.

These are dependency priorities, not a blanket approval queue. Independent bounded work can proceed while a specific unresolved route remains unavailable. A failing device route does not block cloud Chat; an unavailable development target does not prove the new production site is active.

## Always-on and Runner acceptance

Cloud Agent continuity uses durable state, scheduled/event wakeups, recoverable Workflows and canonical `worker_jobs`/outbox/leases. Workers/DOs can hibernate or be evicted. There is no requirement for an always-resident LLM, Worker, browser or cloud Container.

An enrolled Windows SCM or Linux systemd Core Connector starts at OS boot and reconnects without everyday UI clicks while powered, online and authorized. A separately sandboxed Executor starts per task. The user-session Companion is optional and may close independently. Windows Session 0, Linux user-session and Wayland constraints are respected. Locked/no-login sessions may run only permitted headless work; GUI tasks wait for an interactive session. Sleep, power-off or network loss reports the device offline while cloud work remains durable.

Acceptance before enabling a Runner route includes boot-before-login, explicit one-time pairing, device-key proof, short-lived session renewal, signed effect-bound job envelopes, duplicate-delivery reconciliation, network loss/recovery, service crash, WebSocket reconnect and revocation, Companion close/reopen, locked screen, signed update rollback and measured false-online behavior. Documentation does not constitute those runtime results.
