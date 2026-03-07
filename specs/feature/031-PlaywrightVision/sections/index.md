<!-- PROJECT_CONFIG
runtime: python-uv
test_command: cd python-backend && pytest
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-exceptions-and-url-validator
section-02-browser-pool
section-03-selector-cache
section-04-script-generator
section-05-self-healing-executor
section-06-orchestrator
section-07-celery-tasks
section-08-fastapi-endpoints
section-09-trpc-router-and-db-schema
section-10-frontend-components
section-11-admin-settings-and-navigation
section-12-templates-db-and-polish
END_MANIFEST -->

# Implementation Sections Index

Feature 031-PlaywrightVision: Automation Copilot

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-exceptions-and-url-validator | - | 02, 03, 04, 05 | Yes |
| section-02-browser-pool | 01 | 04, 05 | Yes (with 03) |
| section-03-selector-cache | 01 | 04, 05 | Yes (with 02) |
| section-04-script-generator | 01, 02, 03 | 05, 06 | No |
| section-05-self-healing-executor | 01, 02, 03, 04 | 06 | No |
| section-06-orchestrator | 04, 05 | 07 | No |
| section-07-celery-tasks | 06 | 08 | No |
| section-08-fastapi-endpoints | 07 | 09 | No |
| section-09-trpc-router-and-db-schema | 08 | 10 | No |
| section-10-frontend-components | 09 | 11 | No |
| section-11-admin-settings-and-navigation | 10 | 12 | No |
| section-12-templates-db-and-polish | 11 | - | No |

## Execution Order

1. **Batch 1:** section-01-exceptions-and-url-validator (no dependencies)
2. **Batch 2:** section-02-browser-pool, section-03-selector-cache (parallel after 01)
3. **Batch 3:** section-04-script-generator (after 02 AND 03)
4. **Batch 4:** section-05-self-healing-executor (after 04)
5. **Batch 5:** section-06-orchestrator (after 05)
6. **Batch 6:** section-07-celery-tasks (after 06)
7. **Batch 7:** section-08-fastapi-endpoints (after 07)
8. **Batch 8:** section-09-trpc-router-and-db-schema (after 08)
9. **Batch 9:** section-10-frontend-components (after 09)
10. **Batch 10:** section-11-admin-settings-and-navigation, section-12-templates-db-and-polish (parallel after 10)

## Section Summaries

### section-01-exceptions-and-url-validator
**Plan sections:** 3.1, 3.2
**Wave:** 1 (Python Backend Core)

Custom exception hierarchy (11 classes extending AutomationError) and SSRF URL validator with DNS rebinding protection. Security-critical foundation module.

### section-02-browser-pool
**Plan sections:** 3.3
**Wave:** 1

Playwright browser instance pool with per-tenant concurrency limits, asyncio semaphore, Redis counters, idle timeout. Worker-scoped lifecycle via Celery worker_process_init signal.

### section-03-selector-cache
**Plan sections:** 3.4
**Wave:** 1

Redis-backed cache for verified Playwright action lists. Cache key uses tenant namespace + sha256 hashes. TTL refresh on successful use, heal tracking.

### section-04-script-generator
**Plan sections:** 3.5
**Wave:** 1

Core Vision LLM integration: captures page screenshots with numbered overlays, sends to Vision LLM, maps identified elements to multi-strategy selectors, validates against live DOM. Includes page.route() SSRF defense-in-depth.

### section-05-self-healing-executor
**Plan sections:** 3.6
**Wave:** 1

Executes PlaywrightScript with structured retry loop. Diagnoses failures via Vision LLM screenshot analysis, generates replacement selectors, retries up to 3 times. Updates cache on heal success/failure.

### section-06-orchestrator
**Plan sections:** 3.7
**Wave:** 1

Top-level AutomationCopilot service that routes user intent (browser_rpa, workflow, agency, hybrid) to appropriate executor. Intent analysis via structured LLM call. Thin wrappers for workflow/agency builders.

### section-07-celery-tasks
**Plan sections:** 3.8
**Wave:** 2

Two Celery tasks (analyze + execute) with Redis status tracking. Beat schedule for browser pool health watchdog and credit reconciliation. BrowserPool worker-scoped initialization.

### section-08-fastapi-endpoints
**Plan sections:** 4
**Wave:** 2

Five FastAPI endpoints with X-Internal-Token auth: analyze, status, execute, cancel, templates. Error response format, tenant isolation, timestamp cursor pagination.

### section-09-trpc-router-and-db-schema
**Plan sections:** 5.1, 5.2, 5.3, 7.1
**Wave:** 3

tRPC router (4 procedures), callPythonBackend helper, Zod schemas. Credit pre-reserve + refund flow. automationExecutions DB table + browser_automation enum migration. Rate limiting on analyze.

### section-10-frontend-components
**Plan sections:** 6.1, 6.2, 6.3
**Wave:** 4

AutomationChatModal (state machine: idle -> analyzing -> clarification -> preview -> executing -> success/failed), AutomationPreviewPanel (step list with confidence), AutomationStepTracker (real-time progress).

### section-11-admin-settings-and-navigation
**Plan sections:** 6.4, 6.5, 6.6
**Wave:** 4

Vision model admin dropdown, tenant allowed_domains settings with empty-list warning, sidebar navigation entry, WorkflowEditor web_automation node type.

### section-12-templates-db-and-polish
**Plan sections:** 7.2, Wave 5
**Wave:** 5

automationTemplates DB table + migration. Template save/load UI. Template marketplace queries (public + usage count sorting).
