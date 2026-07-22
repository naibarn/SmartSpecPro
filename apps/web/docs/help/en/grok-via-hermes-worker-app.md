---
slug: grok-via-hermes-worker-app
title: Grok via Hermes Worker App
description: Install, approve, and keep the private Worker App online for Grok media generation.
icon: MonitorCog
section: user
order: 73
pages: ["/workers/connect"]
tags:
  - "grok"
  - "worker app"
  - "browser approval"
  - "private worker"
  - "windows"
  - "help"
  - "help/en"
aliases:
  - "hermes worker app"
  - "connect worker app"
  - "private grok worker"
---

# Grok via Hermes Worker App

Worker App runs private Grok media jobs on your computer. Use it for the
**My Worker App** connection mode. The app must be connected to the correct
workspace and remain Online while work is running.

## Install and pair

1. Download the latest Windows installer from this page.
2. Install and open **Smart AI Hub Worker App**.
3. In the app, select **Connect**. It opens this browser approval page with a
   short-lived user code.
4. Check the machine, runtime, account, and workspace shown in the browser.
5. Select **Allow this Worker App**.
6. Return to the app and wait for Connected/Online status.
7. In Smart AI Hub, open **Settings > Connections > Grok via Hermes** and use
   **My Worker App** to authorize Grok through xAI device authorization.

The browser approval gives the app a scoped worker identity. It does not ask you
to copy a registration token, password, cookie, or Grok credential.

## Runtime readiness

- Keep Worker App running during generation.
- Install the Hermes runtime pack offered by the current Worker App release.
- Update when the app reports an unsupported runtime or version.
- Only an Online worker can be used for new private jobs.
- Closing, signing out, or sleeping the machine can interrupt a running job.

The downloadable installer on this page is currently the supported Windows
path. If no macOS package is published, do not use a Windows runtime archive as
a substitute.

## Common problems

- **No connection code:** start Connect from Worker App again.
- **Code expired:** restart Connect to obtain a new browser approval URL.
- **Wrong workspace:** reopen the link from the workspace you intend to use.
- **Denied:** verify the signed-in user and workspace, then start again.
- **Connected but Offline:** keep the app open and check network/firewall access.
- **Hermes runtime missing or unsupported:** update Worker App/runtime pack.
- **Grok not connected:** Worker pairing and Grok authorization are two
  separate steps; complete Grok device authorization in Settings.
- **Generation remains queued:** confirm the selected Worker App is Online and
  the connection advertises the requested capability.

## Related Help

- [[grok-via-hermes-connections|Grok via Hermes Connections]]
- [[grok-via-hermes-admin|Grok via Hermes Administration]]
- [[grok-via-hermes-monitoring|Grok via Hermes Monitoring]]

