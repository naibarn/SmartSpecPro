# SmartSpecPro Incident Response Plan

## Purpose

This document defines the incident response process for SmartSpecPro production environments. Follow this plan when any service degradation, outage, security breach, or data integrity issue occurs.

## Severity Levels & Response Times

| Severity | Response Time | Description | Examples |
|----------|--------------|-------------|----------|
| **P1** (Critical) | < 15 minutes | Full outage, data breach, payment system down, data loss | - smartaihub.app unreachable<br>- Database unavailable<br>- Confirmed security breach<br>- Payment processing stopped<br>- Mass data corruption |
| **P2** (High) | < 1 hour | Partial outage, degraded performance, single service down | - 50%+ users unable to login<br>- Media job processing stopped<br>- Cloud Run service down<br>- Redis cache unavailable<br>- 5xx rate > 20% |
| **P3** (Medium) | < 4 hours | Non-critical feature broken, elevated error rates | - Specific feature broken<br>- 5xx rate 5-20%<br>- Queue backlog growing<br>- Slow API responses (p95 > 2s)<br>- Email delivery delays |
| **P4** (Low) | Next business day | Cosmetic issues, minor bugs, logging issues | - UI styling issues<br>- Non-critical validation errors<br>- Documentation outdated<br>- Minor UX inconsistencies |

## Escalation Matrix

### Roles

| Role | Responsibilities | Contact Method |
|------|-----------------|----------------|
| **On-Call Engineer** | First responder, triage, initial mitigation | PagerDuty / Phone |
| **Incident Commander** | Coordinates response, makes rollback/escalation decisions | Slack + Phone |
| **Backend Specialist** | Deep investigation of Node.js/Python services, database | Slack |
| **Infrastructure Specialist** | Cloud Run, GCP infrastructure, networking | Slack |
| **Security Lead** | Handles P1 security incidents (breach, auth bypass) | Phone (immediate) |
| **Comms Lead** | Customer communication, status page updates | Slack |

### Escalation Path

1. **P4/P3**: On-Call Engineer handles independently, updates Slack #incidents
2. **P2**: On-Call Engineer + Incident Commander, may call Backend Specialist
3. **P1**: Immediately notify all roles via PagerDuty + Phone, Incident Commander takes control

## Incident Lifecycle

### Phase 1: Detection (0-5 minutes)

**How incidents are detected:**
- Cloud Monitoring alerts (email + Slack)
- Sentry error spikes
- User reports (support tickets, social media)
- PostHog dashboard anomalies
- Manual discovery during routine checks

**Immediate Actions:**
1. Acknowledge the alert in PagerDuty
2. Create incident channel in Slack: `#incident-YYYYMMDD-HHmm-<short-description>`
3. Post initial status: "Investigating [issue]. ETA for update: [time]."
4. Assign severity level (P1/P2/P3/P4)

### Phase 2: Triage (5-15 minutes)

**Determine scope:**
```bash
# Check service health
gcloud run services list --region=asia-southeast1 --project=smartspecpro-mvp

# Check error rate (last 30 minutes)
gcloud logging read "resource.type=cloud_run_revision AND httpRequest.status>=500 AND timestamp>\"$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=10 --project=smartspecpro-mvp --format=json

# Check Sentry for new errors
# Visit: https://sentry.io/organizations/smartspecpro/issues/?project=<PROJECT_ID>&query=is:unresolved

# Check queue backlogs
for QUEUE in media-transcode media-render media-upload llm-request skill-execution cloud-run-tasks; do
  gcloud tasks queues describe $QUEUE --location=asia-southeast1 --project=smartspecpro-mvp --format="value(stats.approximateArrivalRate, stats.executedLastMinute)"
done
```

**Classify impact:**
- How many users affected? (check PostHog active users, support tickets)
- Which services affected? (node-api, python-orchestrator, both?)
- Is data at risk? (check for error messages indicating DB corruption)
- Is revenue impacted? (payment processing, subscription creation)

**Update severity if needed** (may upgrade P3 → P2 if impact larger than initially thought)

### Phase 3: Mitigation (15-60 minutes)

**Goal: Stop the bleeding, restore service (even if temporary/partial)**

**Decision Tree:**

```
Is there a recent deployment (< 2 hours)?
├─ YES → High confidence rollback will fix
│   └─ Execute emergency rollback (see Phase 3a)
└─ NO → Investigate deeper
    ├─ External dependency down? (Kie.ai, Neon, Upstash)
    │   └─ Mitigate: Circuit breaker, failover, queue pause
    ├─ Resource exhaustion? (memory, CPU, connections)
    │   └─ Mitigate: Scale up instances, kill leaked connections
    ├─ Database issue? (slow queries, locks, corruption)
    │   └─ Mitigate: Kill long-running queries, restore from backup
    └─ Unknown root cause?
        └─ Collect diagnostics, implement partial fix
```

#### Phase 3a: Emergency Rollback

**When to rollback:**
- Deployment within last 2 hours AND error rate spiked immediately after
- New code clearly causing errors (stack traces point to new files)
- No other obvious external cause

**Rollback procedure:**
```bash
# 1. Identify last known good revision
gcloud run revisions list --service=node-api --region=asia-southeast1 --project=smartspecpro-mvp \
  --format="table(metadata.name,status.conditions[0].status,metadata.creationTimestamp)" \
  --limit=5

# Look for revision deployed BEFORE the incident started

# 2. Immediate traffic shift to healthy revision
HEALTHY_REVISION="node-api-00042-abc"  # Replace with actual revision
gcloud run services update-traffic node-api \
  --to-revisions=$HEALTHY_REVISION=100 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# 3. Same for python-orchestrator if affected
HEALTHY_REVISION_PY="python-orchestrator-00031-xyz"
gcloud run services update-traffic python-orchestrator \
  --to-revisions=$HEALTHY_REVISION_PY=100 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# 4. Verify error rate drops within 2 minutes
# Watch Sentry real-time, Cloud Monitoring dashboard

# 5. Post in incident channel: "Rolled back to <revision>. Monitoring recovery."
```

**Estimated time to rollback:** 60-90 seconds for traffic shift to complete

#### Phase 3b: Scale Up (Resource Exhaustion)

```bash
# Check current scaling
gcloud run services describe node-api --region=asia-southeast1 --project=smartspecpro-mvp \
  --format="value(spec.template.spec.containerConcurrency, spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'])"

# Increase max instances (if currently at limit)
gcloud run services update node-api \
  --max-instances=20 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# Increase memory if OOMKilled errors
gcloud run services update node-api \
  --memory=2Gi \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp
```

#### Phase 3c: Database Emergency Actions

```bash
# Kill long-running queries (DANGER: only if blocking critical operations)
# First, identify long queries
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
psql "$DATABASE_URL" -c "
  SELECT pid, now() - pg_stat_activity.query_start AS duration, query
  FROM pg_stat_activity
  WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 minutes'
  ORDER BY duration DESC;
"

# Kill specific query (CAREFUL!)
psql "$DATABASE_URL" -c "SELECT pg_terminate_backend(<PID>);"

# Check connection pool (if exhausted)
psql "$DATABASE_URL" -c "
  SELECT count(*), state FROM pg_stat_activity GROUP BY state;
"

# Emergency: If database unresponsive, restore from Neon PITR
# (See docs/runbooks/backup-restore-testing.md)
```

#### Phase 3d: Pause Affected Queues

```bash
# If job processing is causing cascading failures, pause intake
gcloud tasks queues pause media-transcode --location=asia-southeast1 --project=smartspecpro-mvp

# Resume after fix deployed
gcloud tasks queues resume media-transcode --location=asia-southeast1 --project=smartspecpro-mvp
```

### Phase 4: Resolution (1-4 hours)

**Goal: Permanent fix deployed**

1. **Root cause identified**: Document in incident channel
2. **Fix implemented**: Code change, config update, or infrastructure adjustment
3. **Fix deployed**: Follow standard deployment process (canary if P2/P3, emergency push if P1)
4. **Validation**: Confirm fix resolves issue, no regressions

**Validation checklist:**
```bash
# Error rate back to baseline
gcloud logging read "resource.type=cloud_run_revision AND httpRequest.status>=500 AND timestamp>\"$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=100 --project=smartspecpro-mvp | wc -l
# Should be < 5 for normal traffic

# Latency back to normal
# Check Cloud Monitoring > Cloud Run > node-api > Request latency (p95 < 500ms)

# No new Sentry errors in last 10 minutes

# Queue backlogs draining
gcloud tasks queues describe media-transcode --location=asia-southeast1 --project=smartspecpro-mvp \
  --format="value(stats.approximateArrivalRate, stats.executedLastMinute)"
# executedLastMinute should be >= approximateArrivalRate
```

### Phase 5: Post-Incident Review (Within 72 hours)

**Blameless Postmortem Template:**

```markdown
# Incident Postmortem: [DATE] - [SHORT TITLE]

**Incident ID:** INC-YYYYMMDD-NNN
**Severity:** P1/P2/P3/P4
**Duration:** [Total time from detection to resolution]
**Affected Users:** [Percentage or count]
**Data Loss:** Yes/No
**Revenue Impact:** $X estimated

## Timeline (all times UTC)

| Time | Event |
|------|-------|
| HH:MM | Incident began (first error logged) |
| HH:MM | Alert fired |
| HH:MM | On-call acknowledged |
| HH:MM | Incident channel created |
| HH:MM | Root cause identified |
| HH:MM | Mitigation deployed (rollback/fix) |
| HH:MM | Service restored |
| HH:MM | Incident closed |

## Root Cause

[Detailed technical explanation of what went wrong and why]

## What Went Well

- Alert fired within X minutes
- Rollback executed quickly
- Communication clear and timely

## What Went Poorly

- Root cause took too long to identify
- Monitoring didn't catch early warning signs
- Rollback procedure had manual steps

## Action Items

| Action | Owner | Due Date | Priority |
|--------|-------|----------|----------|
| Add monitoring for [metric] | Backend Team | YYYY-MM-DD | P1 |
| Automate rollback trigger | Infrastructure | YYYY-MM-DD | P2 |
| Update runbook for [scenario] | On-Call | YYYY-MM-DD | P3 |

## Lessons Learned

[Key takeaways for preventing similar incidents]
```

**Post-incident actions:**
1. Schedule postmortem meeting within 48 hours (all responders + stakeholders)
2. Update runbooks based on lessons learned
3. Add monitoring/alerting to catch this pattern earlier next time
4. Track action items to completion

## Communication Templates

### P1 Critical - Initial Notification

**Subject:** [P1 CRITICAL] SmartSpecPro Service Disruption

**Body:**
```
We are currently investigating a critical issue affecting SmartSpecPro (smartaihub.app).

IMPACT: [Describe user-facing impact - e.g., "Users cannot access the platform"]
STATUS: Investigating
WORKAROUND: [If available, otherwise "None at this time"]
NEXT UPDATE: [Time - typically +30 minutes]

We will provide updates every 30 minutes until resolved.

Incident ID: INC-YYYYMMDD-NNN
Started: YYYY-MM-DD HH:MM UTC
```

### P1 Critical - Resolution

**Subject:** [RESOLVED] SmartSpecPro Service Restored

**Body:**
```
The incident affecting SmartSpecPro has been resolved.

ISSUE: [Brief description of what happened]
RESOLUTION: [What was done to fix it]
DURATION: [Total downtime]
DATA IMPACT: [Any data loss or corruption - be transparent]

Services are now operating normally. We will publish a detailed postmortem within 72 hours.

We apologize for the disruption.

Incident ID: INC-YYYYMMDD-NNN
Started: YYYY-MM-DD HH:MM UTC
Resolved: YYYY-MM-DD HH:MM UTC
```

### P2 High - Status Update

**Subject:** [P2 UPDATE] SmartSpecPro Performance Degradation

**Body:**
```
We are experiencing degraded performance on SmartSpecPro.

IMPACT: [e.g., "Slower response times, some requests timing out"]
AFFECTED FEATURES: [List specific features if applicable]
PROGRESS: [What's been done so far]
ESTIMATED RESOLUTION: [Best guess or "Under investigation"]

Next update in 1 hour or when resolved.

Incident ID: INC-YYYYMMDD-NNN
```

### P3 Medium - Internal Slack Update

```
:warning: P3 Incident: [Short description]
Impact: [Specific feature/subset of users]
Owner: @engineer
Status: Investigating | Fix in progress | Monitoring
ETA: [Time or "Unknown"]
Incident channel: #incident-YYYYMMDD-HHmm-description
```

## Incident Tracking

**Log all incidents in:** `/home/dev/projects/SmartSpecPro/docs/incidents/YYYY/MM/INC-YYYYMMDD-NNN.md`

**Incident numbering:** INC-YYYYMMDD-NNN (NNN is sequential number for that day, starting at 001)

**Required fields:**
- Incident ID
- Severity
- Start time / End time / Duration
- Services affected
- Root cause (after postmortem)
- Action items (with status tracking)

## On-Call Handoff

**Daily handoff template (Slack):**
```
:rotating_light: On-Call Handoff - [DATE]

Previous on-call: @previous-engineer
New on-call: @new-engineer

Outstanding incidents:
- INC-YYYYMMDD-001 (P3): [Brief status] - Owner: @engineer

Known issues (not incidents):
- [Any degraded services or monitoring gaps]

Action items due today:
- [From previous postmortems]

Deployment schedule today:
- [Any planned deployments that might cause alerts]

On-call guide: docs/incident-response-plan.md
Alert runbooks: docs/runbooks/alert-response.md
```

## Quick Reference Commands

```bash
# Service status
gcloud run services list --region=asia-southeast1 --project=smartspecpro-mvp

# Recent errors (last 1 hour)
gcloud logging read "resource.type=cloud_run_revision AND httpRequest.status>=500 AND timestamp>\"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=50 --project=smartspecpro-mvp

# Emergency rollback
gcloud run services update-traffic node-api --to-revisions=<HEALTHY_REVISION>=100 --region=asia-southeast1 --project=smartspecpro-mvp

# Database connection count
psql "$DATABASE_URL" -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Pause job queue
gcloud tasks queues pause <QUEUE_NAME> --location=asia-southeast1 --project=smartspecpro-mvp

# Check Sentry
open "https://sentry.io/organizations/smartspecpro/issues/?query=is:unresolved"

# Cloud Monitoring dashboard
open "https://console.cloud.google.com/monitoring/dashboards?project=smartspecpro-mvp"
```

## Appendix: Severity Decision Matrix

**Use this matrix when unsure about severity:**

| Affected Users | Service Down | Data at Risk | Security Issue | Severity |
|----------------|--------------|--------------|----------------|----------|
| > 90% | Yes | Yes | Yes | P1 |
| > 90% | Yes | No | No | P1 |
| > 50% | Yes | No | No | P2 |
| > 50% | No (degraded) | No | No | P2 |
| < 50% | Partial | No | No | P3 |
| < 10% | No | No | No | P3 |
| Any | No | No | Minor | P4 |
| Any | No | Yes | No | P1 (data risk overrides) |
| Any | No | No | Critical | P1 (breach, auth bypass) |

**When in doubt, escalate to higher severity.** It's better to over-respond than under-respond.
