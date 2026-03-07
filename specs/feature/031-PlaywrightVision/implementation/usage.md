# Feature 031-PlaywrightVision: Usage Guide

## Overview

The Automation Copilot feature enables users to describe web automation tasks in natural language, which are then analyzed, generated, and executed using Playwright browser automation with Vision LLM.

## Architecture

```
React Frontend (AutomationChatModal)
    ↓ tRPC
Node.js Backend (automationCopilotRouter)
    ↓ HTTP (X-Internal-Token)
Python Backend (FastAPI /api/v1/automation-copilot/*)
    ↓ Celery tasks
Automation Pipeline (Copilot → ScriptGenerator → SelfHealingExecutor)
    ↓
Playwright Browser (via BrowserPool)
```

## Key Files

### Python Backend
| File | Purpose |
|------|---------|
| `python-backend/app/services/automation_exceptions.py` | 11 custom exception classes |
| `python-backend/app/services/url_validator.py` | SSRF protection with DNS rebinding defense |
| `python-backend/app/services/browser_pool.py` | Playwright instance pool (10 system, 2 per tenant) |
| `python-backend/app/services/selector_cache.py` | Redis-backed selector cache (7-day TTL) |
| `python-backend/app/services/playwright_script_generator.py` | Vision LLM → Playwright script |
| `python-backend/app/services/self_healing_executor.py` | Execute + diagnose + retry (max 3 attempts) |
| `python-backend/app/services/automation_copilot.py` | Main orchestrator |
| `python-backend/app/tasks/automation_copilot_task.py` | Celery tasks (analyze + execute) |
| `python-backend/app/api/automation_copilot.py` | FastAPI endpoints (5 routes) |

### Node.js Backend
| File | Purpose |
|------|---------|
| `apps/web/shared/automation/contracts.ts` | Shared Zod schemas and types |
| `apps/web/server/routers/automationCopilot.ts` | tRPC router (8 procedures) |

### Frontend
| File | Purpose |
|------|---------|
| `apps/web/client/src/components/automation/AutomationChatModal.tsx` | Main modal (7-state machine) |
| `apps/web/client/src/components/automation/AutomationPreviewPanel.tsx` | Plan preview |
| `apps/web/client/src/components/automation/AutomationStepTracker.tsx` | Execution progress |
| `apps/web/client/src/components/automation/TemplateListPanel.tsx` | Template browser |
| `apps/web/client/src/pages/AutomationPage.tsx` | Route wrapper |

### Infrastructure
| File | Purpose |
|------|---------|
| `packages/shared/src/constants/menu.ts` | Sidebar navigation entry |
| `apps/web/drizzle/schema.ts` | `automationTemplates` table |
| `python-backend/app/orchestrator/node_executors/web_automation_executor.py` | Workflow node stub |

## Feature Flags

- **`automationCopilot`** — Controls sidebar visibility and tRPC access
- Set via Redis: `feature-flag:automationCopilot:{tenantId}` = `"true"`

## Admin Settings

- **Vision Model**: `system_settings` → category `automation`, key `automation_vision_model`
- **Allowed Domains**: `system_settings` → category `tenant_automation`, key `allowed_domains_{tenantId}`

## Security

- SSRF protection with DNS rebinding check on all URLs
- Tenant isolation enforced at every layer (Redis, tRPC, FastAPI, DB)
- No `page.evaluate()` with user/LLM content (ADR-031-002)
- Credit pre-reserve + refund pattern prevents cost overruns
- Feature flag gate on both analyze and execute paths

## Migration Required

After merging, run:
```bash
cd apps/web && pnpm db:push  # Creates automation_templates table
playwright install chromium    # Install browser binaries
```

## Test Summary

| Section | Tests | Framework |
|---------|-------|-----------|
| 01 Exceptions + URL Validator | 17 | pytest |
| 02 Browser Pool | 15 | pytest |
| 03 Selector Cache | 7 | pytest |
| 04 Script Generator | 8 | pytest |
| 05 Self-Healing Executor | 10 | pytest |
| 06 Orchestrator | 6 | pytest |
| 07 Celery Tasks | 5 | pytest |
| 08 FastAPI Endpoints | 11 | pytest |
| 09 tRPC Router | 5 | vitest |
| 10 Frontend Components | 13 | vitest |
| 11 Node Registry | 3 | pytest |
| 12 Templates Schema | 2 | vitest |
| **Total** | **102** | |
