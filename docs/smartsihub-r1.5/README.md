# SmartAIHub Modular SaaS — R1.5

**Decision date:** 2026-11-02
**Status:** Proposed architecture and acceptance contracts. This package makes no implementation, provisioning, runtime, enrollment or deployment claim.

R1.5 is the current companion-doc set for SPEC-312–325. The R1.4 review reports, validator, manifests and UI mockups remain historical evidence under `docs/spec-reviews/smartsihub-r1.4/` and `docs/assets/smartsihub-r1.4/mockups/`; they are not rewritten here.

## Controlling decisions

- `smartsihub.com` is the separate new SmartAIHub SaaS production target on Cloudflare Workers/Hono. It is registered but not activated. `smartaihub.app` remains Legacy on Debian. `aimarkethubs.com` is the prepared but unavailable Modular Debian development target; its current healthy port-3100 service stays in place until a replacement is healthy.
- Build a usable Core identity/action boundary, then Chat with persistent Agent identity and durable jobs, then complex task/mission UI and Mini Apps. Legacy development tools are optional when their path is proven; full Legacy cutover is not a prerequisite.
- Workers, Durable Objects/Agents SDK, Workflows, Queues and event wakeups are the cloud default. “Always-on” means durable identity/state, schedules, triggers, recovery, bounded action and user control. It does not require a resident model, Worker, browser or cloud Container.
- Enrolled, powered Windows/Linux devices run a minimal Core Connector service from OS boot. The native, browser, GPU or GUI Executor starts only for a bounded authorized task. Cloud Agent authority remains independent of device availability.
- Chat is the primary post-login workspace. Mission Control, Task Control and the floating desktop Companion reuse the same frontend source, components, typed actions and canonical thread/Goal/Run state.
- Zero-trust boundaries separate human, tenant, Agent, Service, Module/App and device identities. Service Bindings, Cloudflare Access and hostname selection are not authorization by themselves.
- Tier A Worker Secrets, selective Tier B Secrets Store and Tier C application-encrypted tenant BYOK vault are distinct. Device private keys remain local. See SPEC-325 and the credential ADR.

## Current package

- [Current owner-decision register](../architecture/R1.5-OWNER-DECISION-PRECEDENCE.md)
- [Autonomous implementation roadmap](ROADMAP-AUTONOMOUS-IMPLEMENTATION.md)
- [Work packages](WORK-PACKAGES.md)
- [Bootstrap mission](CODEX-MISSION-BOOTSTRAP.md)
- [M0 mission](CODEX-MISSION-M0.md)
- [SPEC-312–325 ten-pass review and validation](../spec-reviews/smartsihub-r1.5/R1.5-TEN-PASS-GAP-AUDIT.md)
- [Cross-SPEC traceability](../spec-reviews/smartsihub-r1.5/R1.5-CROSS-SPEC-TRACEABILITY.md)

## Architecture decisions

- [Workers-first durable Agents](../architecture/WORKERS-FIRST-DURABLE-AGENTS-ADR.md)
- [Credential and action authority](../architecture/ZERO-TRUST-CREDENTIAL-AND-ACTION-AUTHORITY-ADR.md)
- [Secure Runner connection and device trust](../architecture/SECURE-RUNNER-CONNECTION-AND-DEVICE-TRUST-ADR.md)
- [Always-on Runner and unified desktop Companion](../architecture/ALWAYS-ON-RUNNER-AND-UNIFIED-DESKTOP-COMPANION-ADR.md)
- [Existing Chat-native workspace ADR, R1.5 addendum](../architecture/CHAT-NATIVE-INTERACTIVE-WORKSPACE-ADR.md)

## Status vocabulary

`SPECIFIED` is a normative design contract. `IMPLEMENTED` requires source and focused verification evidence. `DEPLOYED` requires target-specific release and runtime evidence. All R1.5 proposals in this package are **SPECIFIED only**. No real device has been paired and no Worker, KMS, database, secret, tunnel, DNS or production resource was changed.
