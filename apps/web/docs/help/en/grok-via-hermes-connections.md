---
slug: grok-via-hermes-connections
title: Grok via Hermes Connections
description: Connect Grok, choose the correct account scope, test capabilities, and recover expired authorization.
icon: Cable
section: user
order: 72
pages: ["/settings"]
tags:
  - "grok"
  - "hermes media worker"
  - "connections"
  - "image generation"
  - "video generation"
  - "help"
  - "help/en"
aliases:
  - "grok connection"
  - "connect grok"
  - "grok via hermes"
---

# Grok via Hermes Connections

Open **Settings > Connections > Grok via Hermes**. This connection uses your
Grok subscription through a Hermes Media Worker to generate images and videos.
It is separate from the **Hermes Agent Gateway** used for external agents.

## What it can do

An authorized connection may advertise:

- image generation
- image editing with up to three reference images
- video generation when the platform, tenant, and account capability all allow it

The capabilities shown on the connection card are authoritative. A connected
account is not automatically entitled to every operation.

## Choose one connection mode

### Central tenant account

An administrator connects one Grok account for the tenant. Everyone allowed to
use it shares that account's quota and generation history. Use this for a
managed team account.

### Personal server account

You connect your own Grok account, while jobs run on the managed server worker.
The credential profile is isolated from other users. Use this when you want a
personal account without keeping your computer online.

### My Worker App

You connect your own Grok account on your own computer. Jobs run through that
Worker App, which must remain online. Use this when the account and runtime must
stay on your machine.

## Connect an account

1. Confirm that all readiness rows required by your chosen mode show **Ready**.
2. Select the connection mode. For **My Worker App**, select the single online
   Worker App shown by the system.
3. Acknowledge that Grok usage is charged to the connected Grok subscription.
4. Select **Connect**.
5. Open the xAI authorization URL and enter the displayed device code.
6. Approve access in xAI, then return to Smart AI Hub.
7. Wait until the status changes to **Connected**.

Smart AI Hub never needs your Grok password, browser cookie, or a manually
copied access token.

## Defaults and tests

- Set **Default for images** or **Default for videos** when more than one
  usable connection exists.
- Select **Test connection** to refresh capability and entitlement information.
- A generation workflow reads the current connection record and sharing scope
  from the database when it starts.

## If it does not connect

- **Platform or tenant disabled:** ask an administrator to follow
  [Grok via Hermes Administration](./grok-via-hermes-admin.md).
- **Server worker not ready:** an administrator must install/pair the host
  worker and check its version and heartbeat.
- **Worker App offline:** open the app and wait for Online status.
- **Reconnect required / authorization expired:** select **Reconnect** and
  repeat device authorization.
- **Entitlement restricted:** the Grok account does not currently advertise
  the requested operation.
- **Quota or rate limit:** wait for the provider limit to reset or use another
  authorized connection.

Do not repeatedly reconnect a healthy account to fix an offline worker; those
are different readiness checks.

## Related Help

- [[grok-via-hermes-admin|Grok via Hermes Administration]]
- [[grok-via-hermes-worker-app|Grok via Hermes Worker App]]
- [[grok-via-hermes-monitoring|Grok via Hermes Monitoring]]

