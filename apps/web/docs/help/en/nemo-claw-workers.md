---
slug: nemo-claw-workers
title: NemoClaw Workers
description: Operate admin-gated secure sandbox worker pools with explicit network, filesystem, and process policy.
icon: ShieldCheck
section: admin
order: 89
pages: ["/admin/monitoring", "/admin/tenants"]
tags:
  - "nemoclaw"
  - "sandbox"
  - "worker pool"
  - "admin-gated"
  - "monitoring"
  - "tenants"
  - "security"
  - "help"
  - "help/en"
  - "help/runtime"
  - "runtime"
  - "nemo-claw-workers"
aliases:
  - "nemo-claw-workers"
  - "NemoClaw Workers"
  - "NemoClaw Workers help"
---

# NemoClaw Workers

Use this guide when you need the secure sandbox Claw family rather than a personal external worker.

NemoClaw is an admin-gated runtime family for isolated execution. It is a good fit when you need controlled sandbox posture, not a Teams-bound connector or a desktop-managed runtime.

## What NemoClaw is for

NemoClaw is best for:

- sandboxed jobs with explicit network, filesystem, and process restrictions
- worker posture that operators can inspect directly in monitoring
- execution that should stay separate from OpenClaw, Hermes, and Desktop Host

NemoClaw is not the main path for:

- owner-bound external connectors in Teams
- channel companion workflows
- desktop-local file access or managed desktop execution

## What the runtime reports

The control plane expects metadata such as:

- `openShellVersion`
- `sandboxName`
- `blueprintVersion`
- `inferenceProviderProfile`
- `networkPolicyProfile`
- `filesystemPolicyScope`
- `processRestrictionProfile`
- `resourceClass`

If those fields are missing or invalid, the runtime should fail closed before dispatch.

## Rollout truth

`nemoClawSecureWorkerPool` only means the tenant may enable this family. It does not mean every sandbox profile is ready for production work.

Current guardrails:

- registration is admin-gated
- dispatch is admin-gated
- monitoring should show runtime family and compatibility posture before you route work

## Security posture

- keep `networkPolicyProfile` explicit
- keep `filesystemPolicyScope` as narrow as possible
- treat `processRestrictionProfile` as a real guardrail, not a cosmetic label
- use the smallest `resourceClass` that still completes the job

## Operator checklist

Before routing work to NemoClaw:

1. Turn on `nemoClawSecureWorkerPool`.
2. Confirm the worker registers with valid sandbox metadata.
3. Inspect monitoring for compatibility and runtime family labels.
4. Confirm the job is actually meant for sandboxed execution.

Related guides:

- [OpenClaw Workers](./openclaw-workers.md)
- [HiClaw Workers](./hi-claw-workers.md)
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
