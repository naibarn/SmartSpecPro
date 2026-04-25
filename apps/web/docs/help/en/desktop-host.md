---
slug: desktop-host
title: Desktop Host
description: Managed desktop execution, device governance, local roots, package sync, and desktop handoff
icon: MonitorPlay
section: features
order: 66
pages: ["/settings", "/admin/desktop-host", "/domain-admin/desktop-host", "/desktop/open"]
tags:
  - "desktop"
  - "desktop-host"
  - "managed mode"
  - "local roots"
  - "package sync"
  - "device governance"
  - "pi"
  - "agency swarm"
  - "help"
  - "help/en"
  - "help/runtime"
  - "runtime"
aliases:
  - "desktop-host"
  - "Desktop Host"
  - "Desktop Host help"
---

# Desktop Host

## Overview

Desktop Host is SmartSpecPro's managed desktop execution surface. Web stays the control plane, while the desktop app provides the local runtime, local file access, and governed package materialization needed for Pi, Agency Swarm, and advanced local workflows.

Use Desktop Host when you need:

- local file intelligence without upload-first workflows
- governed desktop execution for Pi or Agency Swarm
- device-bound enrollment and tenant-visible posture
- signed desktop package sync for local skills and agency packs
- truthful run labels that distinguish local, hybrid, server, and external execution

## What "managed mode" means

Managed mode keeps desktop execution under policy instead of treating the desktop app as an unrestricted local shell.

Core rules:

- Web remains the control plane.
- Desktop remains the execution-rich surface.
- Managed LLM traffic stays gateway-only.
- Local roots replace whole-disk discovery as the default file posture.
- Pi and Agency Swarm runs remain policy-bound, auditable, and truthfully labeled.

For the install and launch flow used by the Desktop Open handoff page, see [Desktop Host Managed Mode](./desktop-host-managed-mode.md).

## Truthful run labels

Desktop Host uses four execution-locality labels:

| Label | Meaning |
|---|---|
| `Local` | Raw inputs stayed on the device. |
| `Hybrid` | The run executed on desktop, but some data, tools, or brokered access crossed into server-managed systems. |
| `Server` | The run executed inside a server-controlled runtime. |
| `External` | The run executed in an external worker surface such as the OpenClaw gateway. |

These labels are intentionally truthful. A desktop-originated run is not always purely local.

## Personal setup

You can review your own Desktop Host posture from **Settings** when the feature is enabled.

Typical setup flow:

1. Sign in to SmartSpecPro on the web.
2. Install and open the desktop app.
3. Register the device through the desktop enrollment flow.
4. Approve at least one local root.
5. Let Desktop Host sync signed packages.
6. Enable or verify the Agency Swarm runtime if your tenant uses desktop multi-agent execution.

The bootstrap card in Settings summarizes this readiness flow.

## What the Settings surface shows

The Desktop Host section in **Settings** and the tenant console reports the current desktop posture.

Important sections include:

- enrolled devices and health state
- last-seen timestamps
- proof-of-possession and attestation posture
- package sync state
- current workspace profile and network class
- rollout gates
- last run labels
- local file parser capability posture
- local roots and allowed actions

## Device posture

Each enrolled device can report:

- display name and machine name
- health: online, offline, unhealthy, or disabled
- last-seen time
- current workspace profile
- storage protection mode
- attestation mode
- package cache paths
- current package sync state
- local roots configured on that device

The attestation mode can vary by platform. In current rollout states, Desktop Host can report software-backed, OS-protected, OS-keychain, OS-attested, or hardware-attested posture depending on what the device and deployment can support.

## Rollout gates

Desktop Host rollout should stay blocked if any required gate is missing.

The gate panel tracks:

- device binding readiness
- signed package enforcement
- signed update verification
- managed file roots as the default path
- Pi gateway-only startup
- Agency Swarm gateway-only startup
- offboarding cleanup readiness

If a gate is unsatisfied, treat desktop execution as not fully managed yet.

## Local roots

Local roots are the approved folders Desktop Host can index or use for governed file access.

Actions available from the governance console:

- **Reindex root** to refresh derived metadata and search state
- **Purge derived store** to remove derived previews, indexes, or cached analysis for that root
- **Revoke root** to remove that root from managed access on the device

Best practice:

- grant the smallest root that matches the task
- use separate roots for sensitive departments or projects
- revoke roots you no longer need instead of leaving stale broad access in place

## Package sync and trust classes

Desktop Host can sync signed packages to the device for managed local execution.

Package trust classes:

| Trust class | Meaning |
|---|---|
| `built_in_verified` | Platform-provided and verified by SmartSpecPro. |
| `org_verified` | Signed and approved by your organization. |
| `local_unverified` | Desktop-local package that is not trusted for managed server use by default. |
| `project_local` | Scoped to a specific project or local workflow. |

Package states can include `trusted`, `restricted`, `quarantined`, `blocked`, `revoked`, `requires_review`, and `incompatible`.

In managed mode, signed packages are the expected path. Local-unverified packages should be treated as exceptional and governance-sensitive.

## Workspace and network posture

Desktop Host reports the effective workspace profile for a device. That profile explains what kind of local runtime environment the desktop can open.

Common profiles include:

- `standard_managed`
- `advanced_local`
- `indexing_worker`
- `connector_helper`
- `pi_sidecar_managed`
- `agency_swarm_managed`

Network posture may be:

- `gateway_only`
- `server_only`
- `approved_connectors_only`
- `approved_public_web`
- `unrestricted_advanced_local`

If your tenant expects strict governance, `gateway_only` and managed writeback modes are the safest defaults.

## Device disable and offboarding

Admins and domain admins can disable a desktop device from the governance console.

Disabling a device is intended to:

- block it from passing managed execution gates after the next policy refresh
- schedule cleanup of package caches and governed local materialization
- support offboarding or incident response without waiting for manual user action

Use disable when:

- a laptop is lost
- a contractor leaves
- a device falls out of compliance
- you need to stop local execution immediately pending review

## Desktop handoff from web

Some surfaces can hand work off from the web app to the desktop app. You may see actions such as:

- **Open in Desktop**
- **View on Web**
- desktop launch links for runs, projects, skills, or agencies

If the handoff page opens but the desktop app does not launch, use the launcher help in [Desktop Host Managed Mode](./desktop-host-managed-mode.md).

## Desktop releases

Desktop installers are published through the Desktop Releases flow.

- End users can download the latest published installer from the dashboard release panel.
- Admins can upload, publish, unpublish, or delete installers from the tenant desktop governance surface.

See [Desktop Releases](./desktop-releases.md) for the full installer workflow.

## Security notes

- Device enrollment is expected to be proof-of-possession based.
- Signed package verification should stay enabled in managed rollouts.
- Signed update verification should remain enforced.
- Local roots should be explicit and revocable.
- Disabled devices should stop qualifying for managed execution after refresh.
- Desktop runs should preserve truthful labels instead of being relabeled as fully local by default.

## Troubleshooting

### I do not see Desktop Host in Settings

- Confirm the tenant feature flag is enabled.
- Check whether your role and tenant rollout allow Desktop Host.

### My device shows as offline or unhealthy

- Open the desktop app and let it reconnect.
- Check whether the app can refresh policy successfully.
- If the device was disabled, it will remain blocked until re-enabled by governance.

### Package sync is not ready

- Verify signed package sync is enabled for the tenant.
- Wait for the next sync cycle after device registration.
- Check whether a package is quarantined, incompatible, or requires review.

### A local root is missing expected files

- Reindex the root.
- Confirm the folder is still present on the device.
- Revoke and re-add the root if consent or policy changed.

### Desktop handoff does not open the app

- Retry the launch link from the handoff page.
- Confirm the desktop app is installed.
- Use the release portal or install help if you need a fresh installer.

<!-- knowledge-graph:related:start -->
## Related Help

- [[getting-started|Getting Started]]
- [[document-management|Document Management]]
- [[browser-session|Browser Session]]
- [[cli|CLI (Kilo)]]
- [[desktop-host-managed-mode|Desktop Host Managed Mode]]
- [[desktop-releases|Desktop Releases]]
- [[docker-sandbox|Docker Sandbox]]
<!-- knowledge-graph:related:end -->
