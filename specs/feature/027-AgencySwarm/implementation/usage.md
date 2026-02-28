# Agency-Swarm Feature: Usage Guide

## Overview

The Agency-Swarm feature adds multi-agent AI team capabilities to SmartSpecPro. Users can create teams of AI agents that collaborate on tasks via structured communication flows. The feature includes a visual builder, pre-built templates, SSE streaming, workflow integration, and admin controls.

## Feature Flags

All agency features are gated behind feature flags in `system_settings`:

| Flag | Purpose | Default |
|------|---------|---------|
| `AGENCY_SWARM_ENABLED` | Master toggle — gates ALL agency endpoints | `false` |
| `AGENCY_BUILDER_ENABLED` | Canvas builder UI | `false` |
| `AGENCY_TEMPLATES_ENABLED` | Starter template gallery | `false` |
| `AGENCY_WORKFLOW_NODE_ENABLED` | Workflow node integration | `false` |
| `AGENCY_SKILL_TRIGGER_ENABLED` | Skill auto-trigger | `false` |

### Enabling for a Tenant

```sql
-- Enable all agency flags for a specific tenant
UPDATE system_settings
SET value = 'true'
WHERE category = 'feature_flags'
  AND key IN (
    'AGENCY_SWARM_ENABLED',
    'AGENCY_BUILDER_ENABLED',
    'AGENCY_TEMPLATES_ENABLED',
    'AGENCY_WORKFLOW_NODE_ENABLED',
    'AGENCY_SKILL_TRIGGER_ENABLED'
  )
  AND "tenantId" = '<tenant-id>';
```

### Disabling (Kill Switch)

```sql
UPDATE system_settings
SET value = 'false'
WHERE category = 'feature_flags'
  AND key = 'AGENCY_SWARM_ENABLED';
```

## Architecture

### Data Flow

```
Client (React) → tRPC Router → Agency Bridge → Python FastAPI → agency-swarm
                                                     ↓
                                              PostgreSQL (agencies, agents, runs, messages)
                                                     ↓
                                              SSE Stream → Express Proxy → Client
```

### Key Components

| Layer | Component | File(s) |
|-------|-----------|---------|
| Database | 8 tables (Drizzle + SQLAlchemy) | `apps/web/drizzle/schema.ts`, `python-backend/app/models/agency.py` |
| Python | AgencySwarmAdapter | `python-backend/app/services/agency_adapter.py` |
| Python | AgencyService (lifecycle) | `python-backend/app/services/agency_service.py` |
| Python | FastAPI router | `python-backend/app/routers/agency_router.py` |
| Node.js | tRPC agency router | `apps/web/server/routers/agency.ts` |
| Node.js | Agency bridge (HTTP) | `apps/web/server/services/agencyBridge.ts` |
| Node.js | SSE proxy | `apps/web/server/routes/agencyStream.ts` |
| Frontend | AgencyChat page | `apps/web/client/src/pages/AgencyChat.tsx` |
| Frontend | AgencyBuilder page | `apps/web/client/src/pages/AgencyBuilder.tsx` |
| Frontend | AgencyBrowser page | `apps/web/client/src/pages/AgencyBrowser.tsx` |
| Frontend | AgencyTemplates page | `apps/web/client/src/pages/AgencyTemplates.tsx` |
| Admin | AgencyAdminPanel | `apps/web/client/src/components/admin/AgencyAdminPanel.tsx` |
| Templates | 4 starter templates | `apps/web/skills/agency-templates/*.json` |
| Workflow | AgencyExecutor node | `python-backend/app/orchestrator/node_executors/agency_executor.py` |

## User-Facing Features

### 1. Agency Browser (`/agencies`)
Lists all agencies the user has created. Supports grid/list view with status badges.

### 2. Agency Templates (`/agencies/templates`)
Gallery of 4 pre-built agency templates:
- **Research Agency** — CEO, Researcher, Writer (research tasks)
- **Content Writer Agency** — Editor, Writer, Reviewer (content production)
- **Spec Writer Agency** — PM, Architect, Writer (technical specs)
- **Code Review Agency** — Reviewer, Tester, Reporter (code analysis)

Click "Use Template" to create a new agency from a template. The agency starts in `draft` status and can be customized in the builder.

### 3. Agency Builder (`/agencies/:id/edit`)
Visual canvas for designing multi-agent teams:
- Add/remove agents with drag-and-drop
- Configure agent properties (name, model, instructions, tools)
- Draw communication flows between agents
- Set agency-wide settings (credit multiplier, max runtime, fallback safety)

### 4. Agency Chat (`/agencies/:id`)
Run an agency and interact with it:
- Send messages to the entry-point agent
- View real-time streaming responses via SSE
- See the activity panel showing agent-to-agent communication
- View conversation history

### 5. Workflow Integration
Agency teams can be used as nodes in the visual workflow editor. The `AgencyExecutor` node:
- Accepts input from upstream nodes
- Runs the agency as a sub-task
- Passes results to downstream nodes

## Admin Features

### Admin Panel (Settings > Agency)
Located in the Admin Settings page with 5 tabs:

1. **Overview** — Agency count per tenant, active runs
2. **Quotas** — Per-tenant limits on agencies, agents, runs
3. **Tools** — Whitelist/blacklist tools available to agents
4. **Metrics** — Run counts, success/failure rates, latency
5. **Kill Switch** — Emergency stop for running agency operations

### Monitoring

```bash
# Check agency run errors
grep '"agency_run_failed"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# Check active runs
psql "$DATABASE_URL" -c "SELECT id, agency_id, status, started_at FROM agency_runs WHERE status = 'running';"

# Credit usage
psql "$DATABASE_URL" -c "SELECT agency_id, SUM(total_credits_used) FROM agency_runs WHERE started_at > NOW() - INTERVAL '24 hours' GROUP BY agency_id;"
```

### Data Retention
The `agencyArchival` service handles data lifecycle:
- Hot data: Recent messages (configurable retention period)
- Cold storage: Archived runs and messages
- Purge: Batched deletion of expired data (1000-row batches)

## API Endpoints

### tRPC Procedures (`agency.*`)

| Procedure | Type | Auth | Description |
|-----------|------|------|-------------|
| `list` | query | user | List user's agencies |
| `get` | query | user | Get agency by ID |
| `create` | mutation | user | Create new agency |
| `update` | mutation | user | Update agency settings |
| `delete` | mutation | user | Delete agency |
| `listTemplates` | query | user | Get available templates |
| `createFromTemplate` | mutation | user (rate-limited 5/day) | Create agency from template |
| `adminGetMetrics` | query | admin | Get agency metrics |
| `adminGetAlerts` | query | admin | Get agency alerts |
| `adminSetQuotas` | mutation | admin | Set tenant quotas |
| `adminKillRun` | mutation | admin | Kill running agency |
| `adminGetToolWhitelist` | query | admin | Get tool whitelist |
| `adminSetToolWhitelist` | mutation | admin | Set tool whitelist |

### Python FastAPI (`/api/v1/agencies/`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/run` | POST | Start an agency run |
| `/stream/{run_id}` | GET (SSE) | Stream run results |
| `/runs` | GET | List runs for an agency |
| `/runs/{run_id}/cancel` | POST | Cancel a running run |

## Commits

| Section | Commit | Description |
|---------|--------|-------------|
| 01 | `2aaaee5` | Pre-validation: Python 3.12, feature flags |
| 02 | `784c958` | Database schema: 8 tables |
| 03 | `0d1b290` | Python adapter: agency-swarm wrapper |
| 04 | `9105854` | Python services: lifecycle, persistence, credits |
| 05 | `ebc5a43` | Python router: FastAPI endpoints |
| 06 | `4b04484` | Node.js integration: tRPC, bridge |
| 07 | `eb59ceb` | SSE streaming: proxy, heartbeat |
| 08 | `04c5b68` | Frontend chat: AgencyChat, AgencyBrowser |
| 09 | `711eb33` | Frontend builder: AgencyBuilder canvas |
| 10 | `91ed9c5` | Workflow integration: AgencyExecutor node |
| 11 | `b9c4336` | Admin observability: metrics, quotas, kill switch |
| 12 | `169e9f1` | Templates & rollout: 4 templates, gallery page |

## Staged Rollout Plan

See `specs/feature/027-AgencySwarm/sections/section-12-templates-rollout.md` for the full rollout plan:

1. **Stage 1 (Internal)** — Enable for dev tenant, monitor 7 days
2. **Stage 2 (Beta)** — Enable for 3-5 selected tenants
3. **Stage 3 (GA)** — Enable for all tenants

## Security Notes

- All agency endpoints gated by `assertAgencyEnabled(tenantId)` — master kill switch
- Template creation rate-limited to 5/day per user
- Communication flow agent names validated on creation (throws on mismatch)
- SQL injection fixed: all raw queries use Drizzle parameterized `sql` tagged templates
- Admin procedures use `adminProcedure` middleware (role check)
- Quota updates wrapped in `db.transaction()` for atomicity
- Batched deletes prevent unbounded DELETE operations
