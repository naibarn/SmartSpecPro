---
slug: admin-monitoring-incident-response
title: Admin Monitoring Incident Response
description: Understand monitoring alerts, triage the right signal first, and close incidents with evidence.
icon: ShieldAlert
section: admin
order: 86
pages: ["/admin/monitoring", "/admin/dashboard"]
tags: [admin, monitoring, incident, alerts, triage, faq]
---

# Admin Monitoring Incident Response

Use this guide when a monitoring alert opens from the global alert modal, the Command Center, or the Server Monitoring page.

## 1. Read the incident summary first

Before clicking through multiple panels, answer these questions from the summary card:

- What happened
- Why it matters
- What needs to be checked now
- Whether anyone already owns the incident
- Whether a notification was sent and acknowledged

If those answers are unclear, keep the incident open and record a note instead of resolving it early.

## 2. How to triage by signal type

### Monitoring stale

This means fresh monitoring rows are not arriving on time.

Check:

- `Last check`
- `Checks` tab
- `Force Fresh Check`

Do this:

1. Confirm when the last monitoring row landed.
2. Trigger `Force Fresh Check`.
3. If no fresh row appears, inspect the collector, scheduler, or backend write path.

Only resolve after fresh rows appear again.

### Critical alert backlog

This means high-severity alerts exist, but ownership or acknowledgement is lagging.

Check:

- `Open Alerts`
- `Current owner`
- `Latest operator update`

Do this:

1. Separate duplicate symptom alerts from the likely first root cause.
2. Assign an owner.
3. Add an action note describing the current investigation step.

Do not acknowledge everything blindly just to clear the inbox.

### Service runtime issue

This usually means a service is degraded, unhealthy, or restarting too often.

Check:

- Service cards
- Alert evidence
- Dependency health

Do this:

1. Decide whether the issue is isolated to one service or caused by a shared dependency.
2. If you restart something, record exactly what changed.
3. Watch for repeated alerts before resolving.

### Resource pressure

This means CPU, memory, disk, or restart pressure is rising.

Check:

- `Metrics`
- Restart patterns
- Queue pressure

Do this:

1. Identify whether pressure is isolated or node-wide.
2. Choose the relief action: restart, scale, drain, or reduce load.
3. Keep monitoring until the graphs stay down instead of rebounding.

### Audit or provider health issue

This means quality, latency, or error rates are degrading even if the service is still technically up.

Check:

- Error spike
- Latency spike
- Provider or model concentration

Do this:

1. Confirm which provider, model, or endpoint is affected.
2. Compare recent performance with the earlier stable period.
3. Fail over only when the degradation is sustained and user impact is real.

### Orchestration issue

This usually means fallback, classification drift, queue lag, or worker behavior is becoming unstable.

Check:

- Queue health
- Orchestration alerts
- Worker behavior

Do this:

1. Identify whether the fault is in classification, fallback, worker consumption, or a dependency.
2. Record manual retries or reroutes in the operator log.
3. Resolve only when the automated path is stable again.

## 3. What acknowledgement should mean

Acknowledgement should answer all of these:

- Who owns the incident now
- What has already been checked
- What action is happening next

If those are missing, the incident is not really under control yet.

## 4. When to mark resolved

Resolve only when:

- The original signal stops repeating
- Fresh evidence confirms recovery
- The operator log explains what changed

If the issue returns quickly, reopen it and write the reopen reason.

## 5. Recommended response workflow

1. Read the incident summary.
2. Open the incident-scoped alerts.
3. Assign ownership.
4. Add an action note.
5. Check metrics, checks, or service evidence based on the incident type.
6. Confirm recovery with fresh data.
7. Resolve with a clear resolution note.

## Claw Workers panel

If your tenant uses external Claw workers, the **Claw Workers** panel in **Admin Monitoring** becomes part of your first-pass checks.

Use it to:

- confirm whether a worker is online
- inspect the latest redacted diagnostics
- drain, disable, resume, or revoke a worker
- run **Redact Legacy Data** once if this environment has older worker records from earlier builds

If a workflow is waiting on an external worker, check this panel before assuming the problem is inside the workflow itself.

## FAQ

### Why did I get an alert before anything looked down

Because the system is designed to warn on early drift, not just final outages.

### What if the page says `Stale`

`Stale` means the last known data exists but is old. Run `Force Fresh Check` before trusting it.

### What if the page says `Unknown`

`Unknown` means the latest structured service status was not rich enough to classify confidently. Use fresh checks and grouped alerts to investigate.

### Should I close the incident if a manual retry worked once

No. Keep it open until the normal path is stable and alerts stop repeating.
