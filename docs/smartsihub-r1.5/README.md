# SmartAIHub Modular SaaS — R1.6 owner clarification

**Decision date:** 2026-11-09 (R1.6 clarification; R1.5 architecture baseline)
**Status:** Proposed architecture and acceptance contracts. This package makes no implementation, provisioning, runtime, enrollment or deployment claim.

These are the R1.5 companion documents with the 2026-11-09 R1.6 owner clarification. The R1.4 review reports, validator, manifests and UI mockups remain historical evidence under `docs/spec-reviews/smartsihub-r1.4/` and `docs/assets/smartsihub-r1.4/mockups/`; they are not rewritten here. The R1.5 ten-pass audit remains a documentation-only snapshot of its 2026-11-02 baseline.

## Controlling decisions

- `smartaihub.app`, `aimarkethubs.com` and `smartsihub.com` use the same canonical PostgreSQL `smartspec` database and existing user accounts. `aimarkethubs.com` is the Modular development/test environment tenant; `smartsihub.com` is the separate Cloudflare production environment tenant. Their runtime credentials and release authorities stay separately scoped. The aimarket application is currently unavailable and the healthy port-3100 service stays in place until its replacement is healthy; smartsihub.com is registered but not activated.
- Build a usable Core identity/action boundary, then Chat with persistent Agent identity and durable jobs, then complex task/mission UI and Mini Apps. Legacy development tools are optional when their path is proven; full Legacy cutover is not a prerequisite.
- Support direct Codex/Claude development in the canonical source repository and optional dispatch through existing SPEC-224 facilities on `smartaihub.app`; preserve accurate source and execution receipts for the path used.
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
