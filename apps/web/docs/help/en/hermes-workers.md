---
slug: hermes-workers
title: Hermes Workers
description: Register a personal Hermes bridge worker, understand the staged rollout surfaces, and choose Hermes vs OpenClaw vs Desktop Host without over-promising capability parity.
icon: Bot
section: admin
order: 88
pages: ["/admin/tenants", "/admin/monitoring", "/teams"]
tags:
  - "hermes"
  - "workers"
  - "external runtime"
  - "rollout"
  - "teams"
  - "mcp"
  - "channel companion"
  - "help"
  - "help/en"
  - "help/runtime"
  - "runtime"
  - "hermes-workers"
aliases:
  - "hermes-workers"
  - "Hermes Workers"
  - "Hermes Workers help"
---

# Hermes Workers

Use this guide when you want to bring a personal Hermes agent into SmartSpecPro through the `hermes_agent_gateway` runtime.

Hermes is intentionally not presented as a silent replacement for other runtime families. It is a user-owned external runtime with a bridge contract that reuses the worker control plane, delegated gateway sessions, and bound-worker flows already used elsewhere in SmartSpecPro.

## What Hermes is

Hermes is best for:

- a personal external agent that you already operate outside SmartSpecPro
- owner-bound team handoff flows where the same user owns both the worker and the SmartSpecPro credits
- delegated HTTP and, when explicitly ready, delegated MCP usage through the existing worker gateway contract
- channel companion setups where Hermes owns the real chat platform tokens and SmartSpecPro only stores companion metadata

Hermes is not the main path for:

- the most mature delegated external worker rollout today
- managed local machine execution
- automatic import of upstream worker state into SmartSpecPro objects

For those cases, compare it with [OpenClaw Workers](./openclaw-workers.md) and [Desktop Host](./desktop-host.md).

## Choose Hermes vs OpenClaw vs Desktop Host

Choose Hermes when:

- you already run a personal Hermes agent outside SmartSpecPro
- you want SmartSpecPro to treat that agent as a bring-your-own external runtime
- you are comfortable with a staged rollout where registration may be available before dispatch, and dispatch may be available before delegated MCP or channel companions

Choose OpenClaw when:

- you want the current stable delegated external worker path in SmartSpecPro
- you need the most established external operator posture today
- you do not need Hermes-specific channel-companion semantics

Choose Desktop Host when:

- the work must stay on a managed local machine
- you need desktop-local files, local GPU, or device governance
- you want the SmartSpecPro-managed desktop runtime instead of a user-owned external agent

## Hermes rollout truth

`hermesAgentRuntime` is the parent tenant gate. It only means Hermes registration can exist in the control plane. It does not mean every Hermes surface is live.
That gate also controls whether Hermes appears as a bindable option in Teams. If it is off, Hermes registration, listing, and binding fail closed.

SmartSpecPro keeps Hermes rollout staged in this order:

1. `registration`
   Hermes workers can register and appear in monitoring.
2. `bound_dispatch`
   Owner-bound follow-up work can be queued only when the worker reports:
   `apiServerEnabled=true`, `supportsDelegatedHttp=true`, and `supportsBoundConnector=true`.
3. `delegated_mcp`
   Delegated MCP only becomes truthful when the same worker also reports `supportsDelegatedMcp=true`.
4. `channel_companion`
   Channel companion visibility only becomes available when the worker reports `supportsCallbacks=true` and at least one sanitized `gatewayPlatforms` value.

Important:

- registration can be enabled before dispatch
- dispatch can be enabled before delegated MCP
- dispatch can be enabled before channel companion behavior
- SmartSpecPro fails closed if the parent gate is off or the worker does not report the required capabilities

## Bound worker behavior

Hermes reuses the existing **External Connector** and **Bound Worker** model in **Teams**. It does not create a new member kind.

Current guardrails:

- the bound worker must belong to the same tenant
- the bound worker must belong to the same owner
- the worker must report `supportsBoundConnector=true`
- disabled workers cannot be bound
- SmartSpecPro only shows sanitized channel companion labels such as `telegram` or `discord`; it does not expose Hermes platform secrets

## Delegated gateway and MCP behavior

Hermes delegated sessions stay inside the existing worker gateway contract.

Use the delegated manifest as the source of truth for each job:

- HTTP availability depends on Hermes delegated HTTP support and API server readiness
- MCP availability depends on both dispatch readiness and `supportsDelegatedMcp=true`
- callback targets remain bound to the existing worker callback routes

Do not assume that MCP is available just because Hermes registration exists.

## Callback and channel companion boundary

Hermes channel companions are metadata-first:

- SmartSpecPro knows which channel families the worker claims through `gatewayPlatforms`
- Hermes keeps the actual platform tokens, sessions, and upstream channel state
- SmartSpecPro only exposes the sanitized companion labels needed for operator and team context

Hermes must publish updates through the existing worker runtime routes:

- `POST /api/worker-jobs/:jobId/publish-room-update`
- `POST /api/worker-jobs/:jobId/publish-workflow-update`
- `POST /api/worker-jobs/:jobId/publish-user-notification`

Those routes still require `worker_execution` tokens, `workers:report` scope, idempotency keys, and the existing callback link and payload protections.

## Remote endpoint policy

Hermes API server URLs are loopback-only by default.

Public or other non-loopback Hermes API endpoints are denied unless an operator grants an audited exception. An exception must include:

- a recorded exception ID
- the business reason for exposing a non-loopback endpoint
- the owner and tenant affected
- a rollback plan that returns the worker to loopback-only mode

When an exception is granted, the endpoint must still use `https`; SmartSpecPro rejects remote `http` endpoints even when the exception ID exists.
SmartSpecPro also records the exception ID in worker audit and control-plane metadata so operators can trace why the exception was granted.
SmartSpecPro normalizes the base URL before storing it, so use the canonical endpoint you intend to audit.

If you cannot justify and audit that exception, do not use a remote Hermes API endpoint.

## OpenClaw to Hermes onboarding

If you already operate Hermes upstream and previously used OpenClaw-style flows, the safest onboarding path is:

1. Keep the current OpenClaw worker active while validating the Hermes bridge.
2. Register Hermes as a separate worker and verify monitoring, delegated manifests, and callback behavior.
3. Bind Hermes only to the connectors you want to move first.
4. Confirm owner-bound dispatch, callback publishing, and any channel companion labels before widening usage.
5. Retire or drain the older worker only after the Hermes path is stable.

Limits of this onboarding lane:

- SmartSpecPro does not promise automatic import of upstream sessions, prompts, channel tokens, or state from OpenClaw into Hermes objects
- migration is operational and manual, not a silent data-conversion feature

## Operator checklist

Before enabling Hermes for a tenant:

1. Turn on `hermesAgentRuntime`.
2. Confirm the worker reports a loopback API server URL unless an audited `https` exception already exists.
3. Decide whether you are enabling registration only, bound dispatch, delegated MCP, or channel companions.
4. Verify the worker capability report matches that rollout stage.
5. Check that monitoring, credits, callback audit trails, and any remote-endpoint exception metadata behave as expected.

Related guides:

- [OpenClaw Workers](./openclaw-workers.md)
- [Desktop Host](./desktop-host.md)

<!-- knowledge-graph:related:start -->
## Related Help

- [[desktop-host|Desktop Host]]
- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[desktop-releases|Desktop Releases]]
<!-- knowledge-graph:related:end -->
