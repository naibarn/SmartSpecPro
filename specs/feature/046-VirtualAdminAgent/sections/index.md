<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: cd apps/web && pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-schema-system-user
section-02-sensor-framework
section-03-rule-engine
section-04-actuators-approval
section-05-notification-sse
section-06-admin-chat
section-07-feedback-backend
section-08-guardian-dashboard-ui
section-09-feedback-dashboard-ui
section-10-scheduler-watchdog
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-schema-system-user | - | all others | No (foundation) |
| section-02-sensor-framework | section-01 | section-03 | No |
| section-03-rule-engine | section-02 | section-04, section-05 | No |
| section-04-actuators-approval | section-03 | section-06, section-08 | Yes (with section-05) |
| section-05-notification-sse | section-03 | section-08 | Yes (with section-04) |
| section-06-admin-chat | section-04 | - | Yes (with section-07) |
| section-07-feedback-backend | section-01 | section-09 | Yes (with section-06) |
| section-08-guardian-dashboard-ui | section-04, section-05 | - | Yes (with section-09) |
| section-09-feedback-dashboard-ui | section-07 | - | Yes (with section-08) |
| section-10-scheduler-watchdog | section-02 | - | Yes (after section-02) |

## Execution Order (Batches)

1. **Batch 1**: section-01-schema-system-user (foundation — must run first)
2. **Batch 2**: section-02-sensor-framework (depends on schema)
3. **Batch 3**: section-03-rule-engine (depends on sensors)
4. **Batch 4**: section-04-actuators-approval, section-05-notification-sse (parallel — both depend on rules)
5. **Batch 5**: section-06-admin-chat, section-07-feedback-backend, section-10-scheduler-watchdog (parallel — independent)
6. **Batch 6**: section-08-guardian-dashboard-ui, section-09-feedback-dashboard-ui (parallel — frontend)

## Section Summaries

### section-01-schema-system-user
Database schema (6 tables + enums), system user creation, JWT generation, role enum migration. Foundation for all other sections.

### section-02-sensor-framework
Sensor base interface, sensor registry, config loading from DB, 11 sensor implementations (queue, celery, error, LLM, credit, disk, DB, cert, API, media, team).

### section-03-rule-engine
18 deterministic rules, condition evaluation, cooldown management, incident creation with duplicate prevention, per-tenant auto-fix flag check.

### section-04-actuators-approval
12 action types (7 auto + 5 approval-required), approval gate with optimistic locking, concurrent approval protection, TTL expiration, action execution.

### section-05-notification-sse
Multi-channel notification dispatcher (in-app, email, Slack, Telegram), severity-based routing, SSE streaming endpoint via Redis pub/sub, SystemHealthBanner component.

### section-06-admin-chat
Dedicated admin chat with System Guardian, chat command handler (status, incidents, retry, approve), conversation management using existing chat infrastructure.

### section-07-feedback-backend
Feedback tRPC router (user + admin endpoints), auto-processing pipeline (LLM classify, dedup, correlate, prioritize), agent feedback API, rate limiting, tenant isolation.

### section-08-guardian-dashboard-ui
AdminSystemGuardian page: incident timeline, sensor status grid, approval action cards, guardian settings panel, dashboard stats.

### section-09-feedback-dashboard-ui
AdminFeedbackHub page: ticket list with filters, ticket detail view, admin actions (reply, plan, resolve, merge), FeedbackButton + submit modal, stats widget.

### section-10-scheduler-watchdog
Guardian lifecycle (start/stop), sensor interval scheduling with stagger, SIGTERM graceful shutdown, watchdog self-monitoring, external /health endpoint, degraded mode.
