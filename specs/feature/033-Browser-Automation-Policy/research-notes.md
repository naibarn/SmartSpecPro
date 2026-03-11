# Research Notes

## Codebase Recon

### Existing architecture and module boundaries

- The raw browser tool path starts in `apps/web/server/routes/browserTool.ts`, where Node enforces the internal token, tenant feature flag, domain pre-validation for explicit `navigate` actions, Redis concurrency limits, and credit reservation before proxying to Python `POST /api/browser/execute`.
- The Python raw browser endpoint is `python-backend/app/api/browser.py`. It constructs `BrowserSession` from `python-backend/app/services/tools/browser_tool.py` and returns action results plus credit metrics.
- The Automation Copilot path is separate from the raw browser tool. It starts in `apps/web/server/routers/automationCopilot.ts`, proxies to `python-backend/app/api/automation_copilot.py`, then runs Celery tasks in `python-backend/app/tasks/automation_copilot_task.py`, which build scripts with `PlaywrightScriptGenerator` and execute them with `SelfHealingExecutor`.
- Existing human approval infrastructure is already present, but it is wired to workflow execution rather than browser automation. The main pieces are `python-backend/app/models/approval.py`, `python-backend/app/services/approval_db_service.py`, `python-backend/app/api/approvals.py`, `apps/web/server/routers/approvals.ts`, `python-backend/app/orchestrator/node_executors/approval_executor.py`, `python-backend/app/orchestrator/stream_translator.py`, and the frontend approval UIs in `apps/web/client/src/components/workflow/execution/ApprovalPanel.tsx` and `apps/web/client/src/components/chat/JobCard.tsx`.
- Tenant-level gating already exists through `tenants.featureFlags` and Redis-backed checks in `apps/web/shared/featureFlags.ts`, `apps/web/server/services/tenantFeatureFlagService.ts`, and `apps/web/server/services/featureFlags.ts`.

### Browser execution and enforcement findings

- `BrowserSession` has useful security primitives already: SSRF validation, DNS rebinding checks, prompt-injection sanitization for extracted text, output budgets, screenshot caps, session timeout, and audit redaction for secret-like selectors.
- `BrowserSession` also has a real sandbox-backed path through `BrowserSessionFactory`, but `python-backend/app/api/browser.py` does not use the factory. It instantiates `BrowserSession` without a dispatcher, which means the endpoint currently follows the stub/fallback code path for `navigate`, `click`, `fill`, `screenshot`, and extraction methods. If Feature 033 assumes the raw `/api/browser/execute` path is already live-browser-backed, that assumption is not reflected in the current endpoint wiring.
- `SelfHealingExecutor` is the more important live execution path for Copilot. It performs direct Playwright operations such as `click`, `fill`, `select`, and `goto` inside `python-backend/app/services/self_healing_executor.py`.
- Domain/SSRF enforcement is inconsistent across phases. `PlaywrightScriptGenerator` validates the initial URL and installs a route handler while generating the script, but `SelfHealingExecutor` does not install an equivalent route policy during execution. That leaves a gap for navigation caused by `goto`, click-driven redirects, popups, or iframe transitions after script generation.
- `automation_copilot_task.py` broadens `effective_domains` by automatically adding hostnames from requested task URLs and wildcarding the registrable domain. That is convenient for UX but it weakens any assumption that admin-configured allowed domains are the sole authority.
- There is currently no policy interception layer between action generation and action execution. The live executor does not classify actions, classify page sensitivity, request contextual approval, or produce a structured policy decision log.

### Approval, notification, and UX integration findings

- Approval storage is mature enough to reuse. `approval_requests` already stores tenant scope, payload, extra metadata, risk level, approver counts, expiry, and status transitions. Periodic expiration and workflow resume handling already exist in `python-backend/app/tasks/approval_timeout_tasks.py`.
- Realtime approval UX also exists, but only on the workflow SSE path. `approval_required` SSE events are translated in `stream_translator.py` and consumed by `useSSEWorkflowStream.ts`. Copilot does not use SSE for progress; `AutomationChatModal.tsx` polls task status every 2 seconds and only understands coarse states like `analyzing`, `preview_ready`, `generating`, `running`, `success`, and `failed`.
- Because Copilot is polling-based today, policy approvals for browser automation need an explicit transport decision. Reusing workflow-style SSE and approval widgets is possible, but it requires either moving Copilot onto a streaming channel or adding a second notification path for pending policy decisions.
- The existing tRPC approvals router already proxies Python approval APIs with authenticated tenant-scoped access. That reduces UI work for pending approvals, but the browser automation flow still needs a way to create approval requests with the right contextual payload and correlate them back to the executing automation task.

### Tenant attribution, permissions, and security controls

- Tenant feature flags are already available for coarse kill switches: `browserTool` and `automationCopilot` both default to `false` and are read through Redis-backed lookups. This is useful for the global and tenant-level kill-switch requirements in the spec.
- The current `tenant_automation` settings are not actually tenant-scoped in storage. `apps/web/server/routers/systemSettings.ts` reads and writes `system_settings` rows by `(category, key)` only, and `apps/web/drizzle/schema.ts` defines `system_settings` without a `tenantId` column. The admin UI labels these as tenant automation settings, but the persistence model is global. That is a cross-tenant governance risk if policy configuration, allowed domains, or classifier thresholds are stored there.
- Workflow policy infrastructure already exists in the shared database schema: `apps/web/drizzle/schema.ts` defines `policyActionEnum` and `workflow_policy_rules`. That provides a nearby governance pattern and a candidate place to align action semantics, but the table is workflow-oriented and currently appears unused for browser automation.
- The multitenant guardrails for approvals are stronger than for automation settings. Approval APIs require tenant context and filter by tenant ID; automation settings currently do not.

### Database schema, migration, and operational risk

- This feature will almost certainly be additive rather than mutating existing browser tables. That reduces direct data-loss risk, but it introduces cross-stack schema ownership risk because Node uses Drizzle while Python uses SQLAlchemy models against the same Postgres database.
- The existing `policy_action` enum can be reused instead of creating a duplicate allow/deny/require-approval enum. That lowers migration churn and matches the spec’s stated intent to reuse it.
- Approval data already has Python-owned models and APIs. If policy decisions need richer typed payloads or dedicated audit/history tables, the plan should choose a single ownership boundary instead of duplicating the same concept in both Drizzle and SQLAlchemy.
- Monthly partitioning from day one is feasible only if the write-heavy audit table is owned by a clear migration path. The current repo already mixes Drizzle migrations and Python-side operational tasks, so partition creation and maintenance need an explicit owner and runbook.
- Data-loss risk for the likely implementation shape is `low`, because the expected changes are additive tables, indexes, enums, and background jobs. Operational risk is still material for partition management, retention, and approval expiry/recovery flows.

### Existing tests and coverage gaps

- There are already tests for browser domain validation, SSRF behavior, browser session limits, automation-copilot proxy behavior, approval models, approval APIs, approval workflow resume behavior, and self-healing executor behavior.
- There are no tests yet for policy decision classification, sensitive-page detection, contextual approval binding, browser-policy audit storage, cross-origin iframe trust tiers, or Copilot approval UX/state transitions.
- There is no test coverage demonstrating that the live Copilot execution path enforces domain policy after script generation. That gap should be treated as a regression risk area in the implementation plan.

## Web Research

Research run on 2026-03-10.

### 1. Contextual approval UX for risky browser actions

- Anthropic’s computer-use guidance recommends asking a human to confirm important decisions, limiting internet access to allowlisted domains, and defending against prompt-injection-driven tool misuse. That reinforces the plan direction of binding approvals to a specific action and current page context instead of granting blanket approval to a whole browser run. Source: https://docs.anthropic.com/en/docs/build-with-claude/computer-use
- OWASP’s Transaction Authorization guidance emphasizes transaction-specific authorization, integrity of what the user is approving, and the “what you see is what you sign” principle. For this feature, that argues for approval payloads that include normalized action text, page identity, target domain, and a short expiry window so a stale approval cannot be replayed on a changed screen. Source: https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html
- Practical implication for this repo: contextual approval should not be a generic `approve/reject` wrapper around a task. It should carry page fingerprint, action fingerprint, target element or payload summary, domain, tenant, workflow/execution ID, and an approval TTL that invalidates on navigation or DOM context changes.

### 2. Action-risk and sensitive-page classification

- OWASP transaction-authorization guidance is consistent with a classifier that escalates user-visible consequence, not just HTTP destination. The relevant design principle is to classify by consequence and user-visible transaction meaning, which aligns with the spec’s action-based model better than domain-only allowlists. Source: https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html
- Anthropic’s browser-tool guidance supports deterministic constraints first: domain allowlists, human confirmation for important actions, and explicit handling of prompt injection. That supports keeping the online classifier rule-based by default and reserving LLM assistance for offline review or ambiguous cases. Source: https://docs.anthropic.com/en/docs/build-with-claude/computer-use
- Practical implication for this repo: the classifier should sit before both raw BrowserSession actions and Playwright executor actions, and it should treat secret-entry fields, admin/security settings, payments, and outbound communication as first-class signals even when the URL appears benign.

### 3. Frames, popups, redirects, and trust boundaries

- Playwright documents frames and popups as separate interaction surfaces that require explicit handling. Frames are not just regular DOM nodes, and popups are emitted as dedicated events. That supports the spec’s separate trust treatment for top page, same-origin iframe, and cross-origin iframe, and it also means approval invalidation should trigger on popup creation or frame navigation, not only main-page navigation. Sources: https://playwright.dev/docs/frames and https://playwright.dev/docs/pages
- Playwright’s actionability model also assumes the caller explicitly waits for the right target before acting. In policy terms, that means enforcement should happen on the actual actionable target after Playwright resolves the element, not only on the planner’s earlier guess. Source: https://playwright.dev/docs/actionability
- Practical implication for this repo: the live execution path should add frame/popup/navigation observers and route-level checks during execution, not just during script generation. Otherwise the executor can drift into a different trust surface after the original URL check.

### 4. PostgreSQL partitioning and pg_partman operations

- PostgreSQL’s declarative partitioning guidance supports time-based partitioning for large append-heavy tables and expects operational planning for partition creation, pruning, and constraint/index management. Source: https://www.postgresql.org/docs/current/ddl-partitioning.html
- `pg_partman` documentation emphasizes premake/maintenance behavior and built-in retention management for native partitions. That matches the spec decision to use monthly partitions from day one plus automated maintenance. Source: https://pgxn.org/dist/pg_partman/doc/pg_partman.html
- Practical implication for this repo: if `browser_policy_decisions` is expected to receive one row per action, monthly partitions are reasonable, but the plan must include ownership for initial parent-table DDL, partition bootstrap, scheduled maintenance, retention policy, and verification/repair when maintenance falls behind.

### 5. Rollout metrics, precision, and false-positive gates

- Google’s current ML classification guidance is directly applicable to browser-policy rollout metrics: precision is the right metric when false positives are costly, false-positive rate is the right metric when false alarms hurt user trust, and thresholds must be tuned with explicit tradeoffs instead of raw accuracy. Source: https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall
- Practical implication for this feature: the spec’s go/no-go gate should keep precision and false-positive rate as primary metrics, but the plan should also define the labeled evaluation set, manual review process for disputed decisions, and separate metrics by action tier so “read-only” noise does not hide “commit” mistakes.

### 6. Multitenant policy configuration and isolation

- Microsoft’s multitenant configuration guidance recommends key-prefix or store-per-tenant patterns depending on isolation needs. Shared stores are acceptable only when the application consistently scopes reads and writes per tenant. Source: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/app-configuration
- Azure’s broader multitenant deployment guidance recommends feature flags and deployment rings for progressive exposure. That matches this feature’s phased rollout strategy and argues against hard-coding policy rollout state into a global table without tenant scoping. Source: https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/deployment-configuration
- Practical implication for this repo: the current `system_settings` table is a weak fit for tenant-specific browser policy config because it has no tenant key. Reuse should favor `tenants.featureFlags`, an explicitly tenant-keyed policy table, or a tenant-scoped rule catalog over global `(category, key)` settings.

## Testing

### Existing test frameworks and commands

- The web app uses `vitest` via `apps/web/package.json` with `npm test` mapped to `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 vitest run`.
- The Python backend uses `pytest` via `python-backend/pyproject.toml`, with tests under `python-backend/tests/` and coverage enforcement enabled through `--cov=app` and `--cov-fail-under=80`.

### Test file locations and naming conventions

- Web server tests commonly live in `apps/web/server/__tests__/`, `apps/web/server/routers/__tests__/`, and adjacent `*.test.ts` files for route-level units.
- Python tests live in `python-backend/tests/` with `test_*.py` naming, plus subfolders such as `tests/integration/`, `tests/security/`, `tests/services/`, and `tests/multitenancy/`.

### Relevant patterns for this feature

- Web router and service tests use `vitest` mocks heavily and often test extracted pure functions or proxy-layer behavior directly, as shown in `apps/web/server/__tests__/browserToolDomainValidation.test.ts` and `apps/web/server/routers/__tests__/automationCopilot.test.ts`.
- Python approval tests currently include lightweight model and service smoke tests in `python-backend/tests/test_approval_gates.py`, while more behavioral automation tests live alongside browser executor and security tests such as `test_browser_tool.py`, `test_browser_security.py`, and `test_web_automation_executor_impl.py`.
- The repo already distinguishes unit, integration, e2e, and security concerns with pytest markers, so Browser Automation Policy tests should follow that split rather than inventing a new test taxonomy.
