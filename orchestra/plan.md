# Orchestra Plan

## Task
สร้างระบบ Server Monitoring ครบวงจร: แก้ scripts ที่ broken, เพิ่ม DB schema เก็บ metrics/alerts,
tRPC router, Python Celery health task, และ Admin UI หน้า /admin/monitoring

## Classification
- scope: medium
- risk: high
- affected_domains: [infrastructure, database, backend-trpc, frontend, python-celery]
- estimated_file_count: 18
- chosen_route: multi-agent waves
- task_summary: Full monitoring stack — fix scripts, DB schema, backend API, Python collector, Admin UI
- security_gate_required: true (new tRPC router + new internal FastAPI endpoint)

## Context: Current Issues Found
1. health-check.sh cron (every 5min) — checks service UP/DOWN only, no alert, no HTTP error rate
2. system-crash-monitor.sh cron (every 1min) — BROKEN, reads missing .tmp file
3. VIRTUAL_ADMIN_ENABLED not set — Guardian disabled
4. All alert webhooks empty (SLACK_WEBHOOK_URL, DISCORD_WEBHOOK_URL, ALERT_WEBHOOK_URL)
5. Critical production bug: service restarts loop until RAM exhausted — no proactive detection

## Wave Plan

### Wave 1 (parallel): DB Schema + Infrastructure Scripts
- [DB] ssp-database: Add monitoringChecks, monitoringAlerts, systemMetricsHistory tables to drizzle/schema.ts, run db:push
- [INFRA] ssp-infrastructure: Fix system-crash-monitor.sh, upgrade health-check.sh (add memory/error-rate), enable VIRTUAL_ADMIN_ENABLED, create alert-monitor systemd service

### Wave 2 (parallel): Backend Services + Python Celery Task
- [BACKEND] ssp-backend: Create monitoring.ts tRPC router + monitoringService.ts (depends on Wave 1 DB schema)
- [PYTHON] ssp-python: Create system_health_task.py Celery beat task + register in celery_app.py (depends on Wave 1)

### Wave 3: Frontend Admin UI
- [FRONTEND] ssp-frontend: Create AdminMonitoring.tsx page + wire route in App.tsx (depends on Wave 2 tRPC)

## Contracts (see contracts.md)
