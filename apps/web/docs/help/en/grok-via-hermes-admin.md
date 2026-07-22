---
slug: grok-via-hermes-admin
title: Grok via Hermes Administration
description: Enable the platform and tenant rollout, configure the three connection scopes, and keep the server worker ready.
icon: Settings
section: admin
order: 89
pages: ["/admin/settings", "/admin/tenants"]
tags:
  - "grok"
  - "hermes media worker"
  - "admin"
  - "tenant rollout"
  - "shared account"
  - "help"
  - "help/en"
aliases:
  - "hermes media worker settings"
  - "grok admin setup"
  - "hermes f135"
---

# Grok via Hermes Administration

Grok media requires both a platform gate and a tenant gate. Enabling only
**Hermes Media Worker (Grok, F135)** on the tenant is not enough when the
platform worker or the requested connection scope is unavailable.

This feature is separate from **Hermes Agent Gateway** and the
`hermesAgentRuntime` tenant flag. Agent Gateway help remains under
[Hermes Workers](./hermes-workers.md).

## Recommended private-worker setup

1. Open **Admin > Settings > Infrastructure > Tasks**.
2. In **Enable Grok via Hermes**, turn on the primary switch. This applies the
   safe preset for private Worker App usage.
3. Open **Admin > Tenants**, edit the tenant, and search for
   **Hermes Media Worker (Grok, F135)**.
4. Turn on the flag and save/update the tenant.
5. Have the user install and connect Worker App.
6. The user connects Grok from **Settings > Connections**.

The safe preset deliberately keeps central shared and personal-server modes off
until an operator configures a host worker.

## Enable server modes

Open the advanced operator settings only when the host worker is installed,
paired, and reporting a supported version.

- **Shared pool enabled** allows the tenant central account.
- **Server personal enabled** allows per-user Grok profiles on the host worker.
- **Private worker enabled** allows Worker App connections.
- **Video generation enabled** allows video only when the selected connection
  also advertises video capability.
- **Shared worker ID** identifies the one paired host worker used for server
  scopes.

Each server-side Grok profile uses an isolated Hermes home directory. Never
reuse one user's profile directory for another user or for the central account.

## Central account versus personal accounts

**Central account (`server_shared`)**

- connected and managed by an administrator
- available to permitted tenant members
- provider quota and account history are shared
- tenant queue and concurrency limits apply

**Personal server account (`server_personal`)**

- connected by the individual user
- runs on the managed server worker
- credential profile and defaults belong to that user

**Private Worker App (`private_worker`)**

- connected by the individual user
- runs on that user's online Worker App
- does not use the central host worker for execution

## Readiness checklist

Before rollout, confirm:

1. Platform enablement is on.
2. Tenant `hermesMediaWorker` is on.
3. The required scope is enabled.
4. The shared worker ID exists for server scopes.
5. Worker heartbeat is fresh and status is Online.
6. Worker version meets the minimum shown in settings.
7. Image/video capability is advertised for the selected connection.
8. Queue, concurrency, submission-window, and daily quota settings are coherent.

## Safe rollback

Turn off the tenant flag to stop one tenant. Turn off the platform primary
switch to stop new Hermes media work platform-wide. Do not delete connection
records or credential directories as the first rollback action.

Use [Grok via Hermes Monitoring](./grok-via-hermes-monitoring.md) to confirm
worker health and job drainage before wider rollout.

## Related Help

- [[grok-via-hermes-connections|Grok via Hermes Connections]]
- [[grok-via-hermes-worker-app|Grok via Hermes Worker App]]
- [[grok-via-hermes-monitoring|Grok via Hermes Monitoring]]
- [[hermes-workers|Hermes Workers (Agent Gateway)]]

