# Funnel Dashboard Operational Ownership Matrix

**Feature**: Funnel Analytics Dashboard
**Last Updated**: 2026-02-16
**Review Cycle**: Quarterly

## Overview

This document defines ownership, response windows, and escalation paths for all Funnel Dashboard alert classes. Every alert must have a primary owner and clear response expectations.

---

## Ownership Matrix

| Alert Class | Severity | Primary Owner | Secondary | Response Window | Escalation After |
|-------------|----------|---------------|-----------|-----------------|------------------|
| **Cross-Tenant Data Exposure** | CRITICAL | Security Lead | Engineering Manager | 15 minutes | 30 minutes |
| **SLO Breach (p95 >5s)** | HIGH | On-Call Engineer | Backend Team Lead | 30 minutes | 1 hour |
| **SLO Breach (Error Rate >5%)** | HIGH | On-Call Engineer | Backend Team Lead | 30 minutes | 1 hour |
| **Reconciliation Drift >20%** | HIGH | Data Engineer | Backend Team Lead | 1 hour | 4 hours |
| **Export Abuse (Rate Limit Exceeded)** | MEDIUM | Security Lead | On-Call Engineer | 2 hours | 8 hours |
| **Cache Hit Rate <30%** | MEDIUM | Infrastructure Engineer | Backend Team Lead | 4 hours | Next business day |
| **Backfill Job Failure** | LOW | Data Engineer | Backend Team Lead | 8 hours | Next business day |
| **Audit Log Gap** | LOW | Platform Engineer | Engineering Manager | 24 hours | 48 hours |

---

## Role Definitions

### Primary Owner
**Responsibilities**:
- Acknowledge alert within response window
- Initial triage and diagnosis
- Execute immediate mitigation (e.g., rollback)
- Communicate status to team via Slack #incidents channel
- Coordinate with secondary owner if needed

**Expectations**:
- Available during on-call rotation (24/7 for CRITICAL, business hours for LOW)
- Familiar with runbooks and rollback procedures
- Has access to production systems and monitoring tools

### Secondary Owner
**Responsibilities**:
- Support primary owner with diagnosis
- Execute rollback if primary is unavailable
- Review post-incident reports
- Approve changes to runbook

**Expectations**:
- Available within escalation window
- Can take over if primary owner is unresponsive
- Has production access and deep system knowledge

---

## Alert Definitions and Response Playbooks

### 1. Cross-Tenant Data Exposure

**Severity**: CRITICAL
**Detection**:
- User report via support ticket
- Security audit finding
- Audit log anomaly (scope fallback to wrong tenant)

**Primary Owner**: Security Lead (security@company.com)
**Response Window**: 15 minutes
**Escalation**: Engineering Manager after 30 minutes

**Response Playbook**:
1. **0-5 min**: Acknowledge alert, verify incident scope
2. **5-10 min**: Execute immediate rollback (disable feature flag)
3. **10-15 min**: Halt all backfill jobs, notify stakeholders
4. **15-30 min**: Review audit logs for affected tenants
5. **30-60 min**: Draft incident report, identify root cause
6. **1-24 hours**: Implement fix, test in staging
7. **24-72 hours**: Post-incident review, update runbook

**Escalation Path**:
- 30 min: Engineering Manager
- 1 hour: VP Engineering + Security Team
- 2 hours: CTO + Legal (if customer data exposed)

**Required Documentation**:
- Incident report (template: `incident-report-template.md`)
- Affected tenant list
- Audit log export for forensic analysis
- Security postmortem

---

### 2. SLO Breach (p95 Latency >5s or Error Rate >5%)

**Severity**: HIGH
**Detection**:
- Automated alert from Prometheus/Grafana
- User complaints about slow dashboard
- Increased error logs in application monitoring

**Primary Owner**: On-Call Engineer (on-call rotation via PagerDuty)
**Response Window**: 30 minutes
**Escalation**: Backend Team Lead after 1 hour

**Response Playbook**:
1. **0-10 min**: Check monitoring dashboard for spike cause
   - Database slow queries?
   - High traffic / DDoS?
   - External API timeout?
2. **10-20 min**: If cause not obvious, execute rollback to previous phase
3. **20-30 min**: Collect diagnostic data:
   - Query execution plans
   - Application traces (traceId from audit logs)
   - Redis metrics (cache hit rate, connection pool)
4. **30-60 min**: Investigate root cause:
   - Review code changes in past 48 hours
   - Check for data anomalies (huge tenant with millions of events)
   - Test query performance in staging
5. **1-4 hours**: Implement fix or mitigation (e.g., add index, increase cache TTL)
6. **4-24 hours**: Monitor recovery, write incident report

**Escalation Path**:
- 1 hour: Backend Team Lead
- 2 hours: Engineering Manager
- 4 hours: VP Engineering (if customer-impacting)

**Common Causes**:
- Missing database index on frequently queried column
- Cache invalidation bug (cache thrashing)
- N+1 query issue in ORM
- Large tenant with >10M events (needs pagination or optimization)

---

### 3. Reconciliation Drift >20%

**Severity**: HIGH
**Detection**:
- Backfill job reports count mismatch >20%
- Automated reconciliation check fails
- User reports incorrect event counts

**Primary Owner**: Data Engineer (data-team@company.com)
**Response Window**: 1 hour
**Escalation**: Backend Team Lead after 4 hours

**Response Playbook**:
1. **0-15 min**: Halt all running backfill jobs
2. **15-30 min**: Run manual reconciliation report:
   ```sql
   SELECT tenantId,
          source_count,
          funnel_count,
          (funnel_count - source_count) / source_count * 100 AS drift_percent
   FROM reconciliation_report
   WHERE drift_percent > 20
   ORDER BY drift_percent DESC
   LIMIT 100;
   ```
3. **30-60 min**: Investigate root cause:
   - Duplicate events? (Check idempotency logic)
   - Missing events? (Check instrumentation coverage)
   - Timing issue? (Events arriving after backfill window)
4. **1-4 hours**: Implement fix:
   - Update deduplication logic
   - Adjust backfill window (add buffer time)
   - Fix instrumentation bug
5. **4-24 hours**: Re-run backfill for affected tenants, verify drift <5%

**Escalation Path**:
- 4 hours: Backend Team Lead
- 8 hours: Engineering Manager
- 24 hours: VP Engineering (if data integrity compromised)

**Post-Fix Verification**:
- Re-run reconciliation for 10+ sample tenants
- Verify drift <5% for all
- Monitor drift trend over next 48 hours

---

### 4. Export Abuse (Rate Limit Exceeded)

**Severity**: MEDIUM
**Detection**:
- Rate limiter logs show TOO_MANY_REQUESTS for funnelAnalytics.export
- Audit log shows single user >100 exports/day
- Multiple users (>10) hitting rate limit within 1 hour

**Primary Owner**: Security Lead (security@company.com)
**Response Window**: 2 hours
**Escalation**: On-Call Engineer after 8 hours

**Response Playbook**:
1. **0-30 min**: Review audit logs for affected users/tenants:
   ```bash
   grep '"eventType":"funnel_export"' logs/audit/audit-$(date +%Y-%m-%d).jsonl | \
     jq 'select(.metadata.rowCount > 4000)' | \
     jq -s 'group_by(.userId) | map({userId: .[0].userId, count: length})' | \
     jq 'sort_by(.count) | reverse'
   ```
2. **30-60 min**: Categorize usage:
   - Legitimate: User with many domains or large tenant
   - Suspicious: Automated script or bot
   - Malicious: Data exfiltration attempt
3. **1-2 hours**: Take action:
   - **Legitimate**: Increase rate limit for that user (contact user first)
   - **Suspicious**: Monitor for 24 hours, contact user
   - **Malicious**: Block user, notify account team, investigate data exposure
4. **2-8 hours**: If malicious, review audit logs for all exports by user
5. **8-24 hours**: Update rate limits if pattern suggests legitimate high usage

**Escalation Path**:
- 8 hours: On-Call Engineer (if technical issue)
- 24 hours: Account Manager (if customer complaint)

**Common Scenarios**:
- Customer using API for automated reporting (legitimate)
- QA team stress testing (legitimate, but should use staging)
- Compromised account (malicious)
- Bug in client code causing retry loops (suspicious)

---

### 5. Cache Hit Rate <30%

**Severity**: MEDIUM
**Detection**:
- Redis monitoring shows hit rate drop
- Database query rate increases significantly
- Users report slow dashboard performance

**Primary Owner**: Infrastructure Engineer (infra@company.com)
**Response Window**: 4 hours
**Escalation**: Backend Team Lead after next business day

**Response Playbook**:
1. **0-30 min**: Check Redis metrics:
   - Memory usage (eviction happening?)
   - Connection count (connection pool exhausted?)
   - Key count (cache not being populated?)
2. **30-60 min**: Investigate cache invalidation:
   - Check application logs for `redis.del` calls
   - Review recent code changes (did someone add aggressive invalidation?)
3. **1-2 hours**: Temporary mitigation:
   - Increase cache TTL from 5 min to 15 min
   - Increase Redis memory limit (if eviction is the issue)
4. **2-4 hours**: Implement permanent fix:
   - Optimize cache key structure (reduce key count)
   - Add cache warmup job (pre-populate on backfill completion)
   - Fix over-eager invalidation logic
5. **4-24 hours**: Monitor recovery, verify hit rate >70%

**Escalation Path**:
- Next business day: Backend Team Lead
- 2 business days: Engineering Manager (if performance still degraded)

**Common Causes**:
- Cache eviction due to memory pressure
- Bug in cache invalidation logic
- Cold cache after Redis restart
- Key expiration set too low

---

### 6. Backfill Job Failure

**Severity**: LOW
**Detection**:
- Celery task shows FAILURE status
- Backfill job logs show exception
- Reconciliation report shows no new events for tenant

**Primary Owner**: Data Engineer (data-team@company.com)
**Response Window**: 8 hours (business hours only)
**Escalation**: Backend Team Lead after next business day

**Response Playbook**:
1. **0-2 hours**: Review job logs for error:
   - Database connection timeout?
   - Source data API unavailable?
   - Bug in transformation logic?
2. **2-4 hours**: Categorize failure:
   - Transient: Network issue, will retry automatically
   - Systemic: Bug in code, needs fix
   - Data quality: Source data is malformed
3. **4-8 hours**: Take action:
   - **Transient**: Monitor retry, ensure success within 24 hours
   - **Systemic**: Fix bug, deploy, rerun job
   - **Data quality**: Contact data provider, request fix
4. **8-24 hours**: Rerun job for affected tenant(s), verify success

**Escalation Path**:
- Next business day: Backend Team Lead
- 2 business days: Engineering Manager (if blocking customer)

**Auto-Retry Policy**:
- Backfill jobs retry 3 times with exponential backoff
- After 3 failures, job moves to DEAD LETTER queue
- On-call engineer notified after 3 failures

---

### 7. Audit Log Gap

**Severity**: LOW
**Detection**:
- Monitoring detects missing audit log entries for >1 hour
- Audit log file not written (disk full?)
- AuditLogger throws exception

**Primary Owner**: Platform Engineer (platform@company.com)
**Response Window**: 24 hours
**Escalation**: Engineering Manager after 48 hours

**Response Playbook**:
1. **0-4 hours**: Check auditLogger health:
   - Is log file writable?
   - Is disk full?
   - Is log rotation working?
2. **4-8 hours**: Review application logs for auditLogger errors
3. **8-24 hours**: Investigate root cause:
   - Disk space issue? (clean up old logs)
   - Permission issue? (fix file permissions)
   - Bug in auditLogger? (fix and deploy)
4. **24-48 hours**: Implement fix, verify audit logging resumes

**Escalation Path**:
- 48 hours: Engineering Manager
- 72 hours: VP Engineering (if compliance risk)

**Compliance Impact**:
- Audit logs required for GDPR Article 30 (records of processing)
- Missing logs may indicate security incident (investigate)
- Notify security team if gap >24 hours

---

## On-Call Rotation

### Schedule
- **Primary On-Call**: Weekly rotation (Monday-Monday)
- **Secondary On-Call**: Weekly rotation (offset by 1 week)
- **Holidays**: Extended rotation (2 weeks for major holidays)

### On-Call Responsibilities
- Respond to alerts within response window
- Execute rollback procedures when needed
- Communicate status in #incidents Slack channel
- Write incident report within 24 hours of resolution
- Participate in post-incident review

### On-Call Handoff
- **Sunday 5pm**: Outgoing on-call posts handoff summary
- **Monday 9am**: Incoming on-call acknowledges and reviews open incidents
- **Handoff includes**: Open alerts, ongoing investigations, known issues

---

## Communication Channels

### Real-Time Alerts
- **PagerDuty**: Critical and High severity alerts
- **Slack #alerts**: All alert notifications
- **Slack #incidents**: Incident coordination and status updates

### Status Updates
- **Stakeholders**: Engineering Manager, Product Manager, Customer Success
- **Update Frequency**: Every 30 minutes for Critical, hourly for High
- **Update Template**:
  ```
  [INCIDENT] Funnel Dashboard SLO Breach
  Status: INVESTIGATING | MITIGATED | RESOLVED
  Impact: [USER IMPACT]
  ETA: [RESOLUTION TIME]
  Owner: [ON-CALL NAME]
  ```

### Post-Incident Communication
- **Incident Report**: Published to #engineering within 24 hours
- **Post-Incident Review**: Scheduled within 3 business days
- **Runbook Update**: Published within 1 week

---

## Metrics and Review

### Weekly Metrics
- Alert count by severity
- Mean time to acknowledge (MTTA)
- Mean time to resolve (MTTR)
- False positive rate
- Rollback count

### Monthly Review
- Review ownership matrix (any changes needed?)
- Review response windows (are they realistic?)
- Review escalation paths (were they followed?)
- Update runbooks based on lessons learned

### Quarterly Review
- Deep dive on recurring incidents
- Optimize alert thresholds
- Review and update this document
- Training for new team members

---

## Training Requirements

### New Team Member Onboarding
- [ ] Read this ownership matrix
- [ ] Read rollout runbook
- [ ] Shadow on-call engineer for 1 week
- [ ] Execute mock rollback in staging
- [ ] Review past incident reports (last 3 months)

### Ongoing Training
- [ ] Quarterly runbook review session
- [ ] Post-incident review attendance (all team members)
- [ ] Annual disaster recovery drill

---

## Document Ownership

**Maintained By**: Backend Team Lead
**Review Cycle**: Quarterly
**Last Review**: 2026-02-16
**Next Review**: 2026-05-16

**Change Log**:
- 2026-02-16: Initial version (section 08 implementation)
