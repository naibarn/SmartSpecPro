---
slug: grok-via-hermes-monitoring
title: Grok via Hermes Monitoring
description: Read Hermes Media Worker readiness, heartbeat, version, capabilities, queue state, and diagnostics.
icon: Activity
section: admin
order: 90
pages: ["/admin/monitoring"]
tags:
  - "grok"
  - "hermes media worker"
  - "monitoring"
  - "heartbeat"
  - "diagnostics"
  - "help"
  - "help/en"
aliases:
  - "grok media monitoring"
  - "hermes media health"
  - "hermes worker diagnostics"
---

# Grok via Hermes Monitoring

Open **Admin > Monitoring > Claw Workers** and use **Grok Media Help** for this
guide. The same card contains other runtime families; **Hermes Help** documents
Hermes Agent Gateway, while this topic documents Grok media workers.

## What to check

- **Online / last seen:** proves the control plane recently received a worker
  heartbeat.
- **Readiness:** combines pairing, enabled state, version, and worker status.
- **Version:** must meet the minimum configured under Admin Settings.
- **Strategy / scope:** confirms whether the worker is the central host worker
  or a user's private Worker App.
- **Capabilities:** image generation, image edit reference limit, and video
  generation must match the requested operation.
- **Doctor/diagnostics:** use current diagnostics to identify runtime pack,
  executable, profile, or connectivity failures.

Online does not by itself prove that a Grok account is authorized or entitled.
Check the connection card under Settings for account status and capability.

## Job lifecycle

1. A media workflow resolves the current authorized connection and sharing
   scope from the database.
2. Admission checks platform, tenant, scope, quota, queue, and capability.
3. The job is assigned to the central host worker or the selected private
   Worker App.
4. Heartbeats and progress update the job until completion or failure.
5. The result is validated before it is exposed to the calling workflow.

## Diagnose by symptom

### Connection token expired after reconnect

Confirm the workflow resolved the current database connection rather than an
old task snapshot. Test the current connection card, then retry the operation.
If the fresh record still requires authorization, reconnect through xAI device
authorization.

### Worker is Online but not ready

Check pairing, shared worker ID, minimum version, runtime pack installation, and
doctor output. For private mode, also confirm the Worker App belongs to the
current user and workspace.

### Job is queued but never starts

Check worker heartbeat, queue/concurrency limits, user and tenant submission
windows, daily quota, and whether the requested scope is enabled.

### Image works but video does not

Check the platform video switch and the selected connection's video capability
and entitlement. Image authorization does not imply video authorization.

### Invalid or missing result

Inspect the job error and diagnostics for provider timeout, expired reference,
invalid output, or interrupted Worker App. Retrying without fixing an Offline
worker will produce the same result.

## Escalation evidence

Record the trace/job ID, tenant, connection scope (never credentials), worker
ID, version, last heartbeat, requested operation, and sanitized error code.
Do not paste device codes, cookies, refresh tokens, or profile files into an
incident report.

## Related Help

- [[grok-via-hermes-connections|Grok via Hermes Connections]]
- [[grok-via-hermes-admin|Grok via Hermes Administration]]
- [[grok-via-hermes-worker-app|Grok via Hermes Worker App]]
- [[hermes-workers|Hermes Workers (Agent Gateway)]]

