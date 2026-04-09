---
slug: desktop-host-managed-mode
title: Desktop Host Managed Mode
description: Install, launch, and understand the managed desktop mode used by SmartSpecPro Desktop Host
icon: MonitorPlay
section: features
order: 68
pages: ["/desktop/open"]
tags: [desktop, desktop-host, managed mode, install, launch, handoff]
---

# Desktop Host Managed Mode

## What this page is for

This guide is the quick install and launch reference for Desktop Host managed mode.

Open this page when:

- the **Open in Desktop** handoff page appears
- the desktop app did not launch automatically
- you need to understand what managed mode changes compared with a raw local app

For the full governance guide, see [Desktop Host](./desktop-host.md).

## Quick start

1. Install the latest published desktop build from the release portal.
2. Sign in with the same SmartSpecPro account you use on the web.
3. Let the device complete enrollment and policy refresh.
4. Approve the local roots the workflow needs.
5. Retry the launch link or the **Open in Desktop** action.

If you still need an installer, see [Desktop Releases](./desktop-releases.md).

## What managed mode means

Managed mode keeps desktop execution inside SmartSpecPro's trust model.

That means:

- web is still the control plane
- desktop is still the local execution surface
- managed LLM traffic stays gateway-only
- local roots replace unrestricted whole-disk discovery by default
- Pi and Agency Swarm runs still follow policy, audit, and truthful run labeling

Managed mode is intentionally different from an unrestricted local shell.

## Truthful execution labels

You may see these labels in Desktop Host and related run history:

| Label | Meaning |
|---|---|
| `Local` | Raw inputs stayed on the device. |
| `Hybrid` | The run executed on desktop, but some data or tools crossed into server-managed systems. |
| `Server` | The run executed in a server-controlled runtime. |
| `External` | The run executed in an external worker surface. |

## Launching from the web app

Desktop handoff links can carry a run, project, skill, or agency into the desktop app.

Typical flow:

1. Start the task on the web.
2. Click **Open in Desktop**.
3. The browser opens the desktop launch page and attempts to open the app.
4. If the app is installed and registered, the handoff continues inside Desktop Host.

If automatic launch fails, copy the launch link and try again after installing or opening the app manually.

## What must be ready before desktop runs are treated as managed

The rollout expects these gates to be satisfied:

- proof-of-possession device binding
- signed package verification
- signed update verification
- managed local roots as the default discovery path
- Pi gateway-only startup
- Agency Swarm gateway-only startup
- offboarding cleanup readiness

If these are not ready, desktop execution may still be in preview or partial-governance mode.

## What you should see in Settings

Once the desktop app is enrolled, Settings should show:

- the enrolled device
- device health and last-seen time
- attestation and storage posture
- package sync state
- current workspace profile
- local roots
- rollout gates

If you do not see these sections, the tenant may not have Desktop Host enabled yet.

## Troubleshooting

### The desktop app did not open

- Retry the launch link.
- Make sure the desktop app is installed.
- Open the desktop app once manually, then try the handoff again.

### The app opens but the run does not continue

- Confirm you are signed in with the same account as the web session.
- Wait for policy refresh and enrollment to finish.
- Check whether the required local roots were approved.

### My organization says desktop runs must stay governed

Use only the published installer and keep managed mode enabled. Do not rely on older localhost compatibility paths for long-term managed use.

## Related guides

- [Desktop Host](./desktop-host.md)
- [Desktop Releases](./desktop-releases.md)
