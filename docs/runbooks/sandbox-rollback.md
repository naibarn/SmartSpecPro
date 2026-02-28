# OpenSandbox Rollback Strategy Runbook

Operational reference for rolling back the OpenSandbox integration at any phase.

## Rollback Tiers

### Tier 1: Full Sandbox Disable (fastest, any phase)

**Use when:** OpenSandbox server is down, critical bug in sandbox dispatch, or data integrity concern.

**Steps:**

1. Set `OPENSANDBOX_ENABLED=false` in environment variables
2. Restart services:
   ```bash
   sudo systemctl restart smartspec-backend.service
   sudo systemctl restart smartspec-web.service
   ```
3. In-flight sandbox jobs remain in their current state. The stuck job reconciler will mark them as `failed` after timeout
4. All new workloads immediately use legacy subprocess paths
5. Verify services are healthy:
   ```bash
   curl -s http://localhost:8000/health
   curl -s http://localhost:3000/api/health
   ```
6. Monitor JSONL audit logs for any `sandbox_dispatch_failed` events (should now be absent):
   ```bash
   grep 'sandbox_dispatch_failed' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl
   ```

**Recovery time:** ~2 minutes (service restart time)

---

### Tier 2: Per-Feature Disable (selective, Phase 5+)

**Use when:** Sandbox works for most features but one feature type has issues.

**Steps:**

1. Set the per-feature flag to `false`:
   - Media issues: `SANDBOX_REQUIRE_FOR_MEDIA=false`
   - Skill issues: `SANDBOX_REQUIRE_FOR_SKILLS=false`
2. Restart the affected service:
   ```bash
   sudo systemctl restart smartspec-backend.service
   sudo systemctl restart smartspec-web.service
   ```
3. The specific feature type falls back to legacy while others remain on sandbox
4. Verify by creating a job of the affected type and confirming it uses the legacy path

**Recovery time:** ~2 minutes

---

### Tier 3: Tenant-Level Disable (targeted, Phase 5+)

**Use when:** A specific tenant experiences sandbox issues.

**Steps:**

1. Update `tenant_sandbox_policies` for the affected tenant:
   ```sql
   UPDATE tenant_sandbox_policies
   SET max_concurrent_sandboxes = 0
   WHERE tenant_id = '<TENANT_ID>';
   ```
2. This blocks all new sandbox jobs for that tenant without affecting others
3. Jobs already in-flight continue to completion
4. To re-enable: set `max_concurrent_sandboxes` back to the previous value

**Recovery time:** Immediate (no restart needed)

---

## Emergency Override

If `DISPATCH_MODE=required` and sandbox is completely unavailable:

1. Set `OPENSANDBOX_ENABLED=false` — this **OVERRIDES** `DISPATCH_MODE=required`
2. All sandbox-mode workloads fall back to legacy even though `required` is set
3. This is the escape hatch for catastrophic sandbox failure

```bash
# Emergency override
export OPENSANDBOX_ENABLED=false
sudo systemctl restart smartspec-backend.service
sudo systemctl restart smartspec-web.service
```

---

## Monitoring During Rollback

After any rollback, monitor these signals:

1. **JSONL audit logs** — No `sandbox_dispatch_failed` events after rollback
2. **Celery queues** — `sandbox` queue should drain (no new jobs)
3. **Stuck job reconciler** — Will mark in-flight sandbox jobs as `failed` within 5-10 minutes
4. **Service health** — Both `/health` endpoints return 200

```bash
# Quick health check
curl -s http://localhost:8000/health && echo "Backend OK"
curl -s http://localhost:3000/api/health && echo "Web OK"

# Check sandbox queue is draining
celery -A app.core.celery_app inspect active -Q sandbox

# Check stuck job detection
journalctl -u smartspec-backend.service | grep stuck_job_detected | tail -5
```

---

## Rollback Decision Matrix

| Symptom | Tier | Action |
|---------|------|--------|
| OpenSandbox server unreachable | Tier 1 | `OPENSANDBOX_ENABLED=false` |
| Sandbox jobs failing for one feature | Tier 2 | Disable per-feature flag |
| One tenant reporting issues | Tier 3 | Set `max_concurrent_sandboxes=0` |
| Circuit breaker open > 5 minutes | Tier 1 | `OPENSANDBOX_ENABLED=false` |
| Cost tracking anomaly | Tier 2 | Disable affected feature |
| Data integrity concern | Tier 1 | `OPENSANDBOX_ENABLED=false` + investigate |

---

## Post-Rollback Checklist

- [ ] All services healthy (200 on health endpoints)
- [ ] No new sandbox jobs being created (check `sandbox_jobs` table)
- [ ] Legacy execution paths functioning correctly
- [ ] Alert team of rollback and reason
- [ ] Create incident ticket with root cause analysis
- [ ] Plan re-enablement after fix is verified
