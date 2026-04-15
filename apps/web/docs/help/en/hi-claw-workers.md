---
slug: hi-claw-workers
title: HiClaw Workers
description: Operate admin-gated collaborative cluster runtimes with explicit manager, credential, and artifact governance.
icon: Layers3
section: admin
order: 90
pages: ["/admin/monitoring", "/admin/tenants"]
tags: [hiclaw, cluster, workers, admin-gated, monitoring, tenants, collaboration]
---

# HiClaw Workers

Use this guide when you need the collaborative cluster Claw family rather than a personal external worker.

HiClaw is an admin-gated runtime family for coordinated cluster execution. It is a good fit when the job needs shared posture, explicit artifact governance, and human oversight.

## What HiClaw is for

HiClaw is best for:

- coordinated worker pools that should behave like a managed cluster
- shared artifact handling with explicit governance
- jobs that need a visible manager endpoint and cluster identity
- workflows where human oversight and matrix visibility matter

HiClaw is not the main path for:

- owner-bound external connectors in Teams
- channel companion workflows
- desktop-local file access or managed desktop execution

## What the runtime reports

The control plane expects metadata such as:

- `managerEndpoint`
- `clusterId`
- `gatewayMode`
- `credentialHandlingMode`
- `sharedArtifactStoreProfile`
- `humanOversightMode`
- `workerPoolSummary`
- `matrixVisibilityMode`

If those fields are missing or invalid, the runtime should fail closed before dispatch.

## Rollout truth

`hiClawClusterRuntime` only means the tenant may enable this family. It does not mean the cluster lane is ready for every workload.

Current guardrails:

- registration is admin-gated
- dispatch is admin-gated
- monitoring should show cluster posture, compatibility, and matrix visibility before routing work

## Security posture

- keep `credentialHandlingMode` explicit
- treat `sharedArtifactStoreProfile` as governed storage, not a dumping ground
- limit `matrixVisibilityMode` to the operator audience that truly needs it
- use `humanOversightMode` to make approval boundaries visible

## Operator checklist

Before routing work to HiClaw:

1. Turn on `hiClawClusterRuntime`.
2. Confirm the worker registers with valid cluster metadata.
3. Inspect monitoring for manager endpoint, cluster ID, and shared artifact posture.
4. Route only work that actually needs collaborative cluster behavior.

Related guides:

- [OpenClaw Workers](./openclaw-workers.md)
- [NemoClaw Workers](./nemo-claw-workers.md)
- [Desktop Host](./desktop-host.md)
