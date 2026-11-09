# SmartAIHub R1.5 M0 — secure usable Core and Chat foundation

**Status:** Future implementation scope. This documentation mission has not implemented or deployed M0.

## Goal

Deliver the smallest usable SmartAIHub Core and signed-in Chat slice on the `aimarkethubs.com` development/test environment tenant, using existing user accounts and the shared canonical `smartspec` database, with persistent Agent/Goal identity and a durable job contract. Keep environment-tenant access scoped. Do not make Legacy infrastructure cutover a global prerequisite.

## Required decisions before implementation

- Verify exact target and current availability using `apps/web/scripts/deployment-targets.json`. At this revision, `aimarkethubs.com` is prepared/unavailable and its existing healthy port-3100 service must remain undisturbed until a replacement is healthy. `smartsihub.com` is registered but not activated.
- Use the same canonical PostgreSQL `smartspec` database and existing user/tenant/Core records as `smartaihub.app`. Verify the live endpoint, schema, writer and tenant filters before enabling each read/write path. Use a separately scoped Modular development DB credential; do not clone data, reuse broad Legacy credentials or let development-only records/effects enter the production environment tenant.
- Preserve the separate `aimarkethubs.com` development/test and `smartsihub.com` Cloudflare production environment tenants. Existing customer tenant IDs and authorized shared Core data remain canonical across surfaces; every access still requires verified user membership and role policy.
- Development may be performed directly with Codex/Claude in the canonical source repository or dispatched through existing SPEC-224 facilities on `smartaihub.app`. Record the actual path and its evidence; SPEC-224 is optional and no new in-house orchestration system is introduced.
- Preserve existing owners: canonical job/outbox/lease and financial settlement authorities are not duplicated inside Agents, Workflows, Queues, Mini Apps or Runners.
- Select non-production identity, bindings, deployment credentials, KMS/broker identities, logging/data-class policy and rollback ownership before using them. No real secret is placed in source, `vars`, examples, `.env`, queue payloads or telemetry.

## M0 acceptance boundary

1. Separate human, tenant, Agent, Worker/service, module and device principal contracts; server derives tenant access and applies session, CSRF, audience, scope and policy-epoch checks.
2. Chat is the post-login home and uses typed server-authorized actions. Headless HTTPS/MCP calls pass the same effect authorization. Browser close preserves durable Goal/Run state.
3. Cloud Agent state and wakeups use Workers/DO/Workflows/Queues without claiming a resident model or process. Job admission/status and external effects use the selected canonical job/ledger authority with idempotency and truthful wait/retry states.
4. Define credential placement before first secret-bearing feature: Tier A required Worker Secrets; Tier B selected Secrets Store/fallback; Tier C encrypted BYOK vault and external KMS-backed broker. Implement deny-by-default if a dependency or key is unavailable.
5. Keep device remote execution disabled until the secure Connector/Executor boundary passes SPEC-325's guarded acceptance matrix. Boot service, secure pairing, WSS/PoP, signed envelopes, update verification and lock/revoke behavior require runtime evidence, not spec review alone.
6. Preserve public/authenticated origin separation, Mini App data isolation and per-module release/rollback identity.

## M0 exit evidence

Record the implementation revision, focused checks, exact development target and shared DB credential/tenant context, existing-account Core/Chat user journey, durable continuation after browser closure, idempotency/authorization evidence, negative tenant and credential tests, and rollback path. Do not report production, device enrollment or deployment unless the corresponding target was actually changed and checked. Do not run `npm run typecheck` in a local/shared implementation session.
