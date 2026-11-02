# SmartAIHub R1.5 implementation bootstrap mission

## Objective

Implement the new SmartAIHub Modular SaaS platform as an independent product at the registered `smartsihub.com` Cloudflare Workers/Hono target. The current task package is SPEC/ADR/documentation only; this bootstrap is for a later implementation mission. Do not interpret a spec, domain registration, optimized build or account membership as evidence of a live product or release authority.

## Controlling sources

Read [R1.5 owner-decision precedence](../architecture/R1.5-OWNER-DECISION-PRECEDENCE.md), canonical [SPEC-312–325](../../specs/feature/312-smartaihub-modular-saas-rebuild-master-plan/spec.md), [R1.5 roadmap](ROADMAP-AUTONOMOUS-IMPLEMENTATION.md), [work packages](WORK-PACKAGES.md), and the four R1.5 ADRs linked from the README. Preserve R1.4 review history and UI mockups as historical references. Frozen owners such as SPEC-207, SPEC-208, SPEC-224, SPEC-256, SPEC-261/273, SPEC-280, SPEC-287, SPEC-293, SPEC-295 and SPEC-304 keep their stated authority.

## Binding architecture

1. Build a usable new Core identity/action boundary, then Chat plus durable Agent identity and jobs, then complex Task/Mission surfaces and Mini Apps. `smartaihub.app` remains Legacy and is an optional development command tool only where that specific flow is proven; full Legacy repair or cutover is not a global prerequisite.
2. Use independent Hono/TypeScript Workers, private Service Bindings with caller verification, Durable Objects/Agents SDK for Agent identity/state and wakeups, Workflows for recoverable multi-step work, Queues for asynchronous transport, and suitable data bindings. Workers/DOs are event-driven and may hibernate or be evicted. Never require a resident cloud model, browser, Container or native supervisor.
3. Preserve one canonical authority for each environment's identity, entitlement, ledger and `worker_jobs` lifecycle. New dev, preview and production credentials/DB roles/key boundaries are isolated from Legacy and one another. Reconcile the currently logical `smartspec` production DB mapping to an isolated authority before production provisioning; do not guess hosts or credentials.
4. Make Chat the primary signed-in workspace. Web Chat, headless HTTPS/MCP and the desktop Companion share the same typed action registry and frontend components/state. Closing a UI hides it; it does not cancel authorized durable work.
5. Use the three credential tiers: Tier A per-Worker/environment Secret bindings with required-secret preflight; Tier B only selected, scoped Secrets Store credentials after checking current product suitability; Tier C application-side AES-256-GCM tenant vault with wrapped DEKs behind a Credential Broker and external AWS KMS. No raw secret in prompts, memory, queues, browser storage or default logs. Device private keys remain local.
6. Enrolled Windows/Linux devices run a minimal Core Connector service at OS boot. The Connector uses outbound authenticated WSS, TLS validation, device-key proof and short-lived grants. Shell/browser/GPU/GUI Executor processes start only per bounded authorized task. No incoming control port, arbitrary command IPC, browser cookie borrowing or silent re-pairing.
7. Release each module and Runner package independently with least-privilege identities, target assertions, source/artifact provenance, signing or verifiable hashes, rollback and compatibility policy. Do not force a GitHub-only path.

## Target checks and execution boundary

Resolve `legacy-debian-dev`, `modular-debian-dev` and `modular-cloudflare-prod` through `apps/web/scripts/deployment-targets.json` before any build intended for release. Preserve current `smartaihub.app` Legacy service and the healthy `aimarkethubs.com` port-3100 service. `aimarkethubs.com` is currently unavailable for Modular application traffic. `smartsihub.com` is not activated. A later mission must verify exact runtime, application, service, port, DB, target ID and deployment identity before publishing or changing traffic.

Do not activate remote Runner execution until SPEC-325's non-production tests cover one-time enrollment, device proof-of-possession, signed effect-bound job envelope, reconnect/replay/fencing, live revoke, tenant isolation, OS boot, service recovery, locked-session limits, safe updates, shared Companion state and artifact redaction. Ordinary bounded autonomous work under a valid Goal grant must not introduce recurring approval prompts.

## Status reporting

Keep `SPECIFIED`, `IMPLEMENTED` and `DEPLOYED` separate. Report source SHA, focused checks, exact target identity and actual runtime evidence for each claimed state. A local Worker/DO simulation, CLI success or this mission text does not prove production readiness.
