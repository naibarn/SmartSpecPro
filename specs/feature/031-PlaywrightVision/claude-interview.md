# Interview Transcript: Feature 031-PlaywrightVision

Conducted as part of deep-plan workflow. 2 rounds, 8 questions total.

---

## Round 1

### Q1: Implementation priority — what MUST work in the first deliverable?

**Answer:** Full stack with phased scope:
- AutomationChatModal for typing commands
- API/tRPC to send commands to backend
- Backend runs AutomationCopilot / PlaywrightScriptGenerator / SelfHealingExecutor / BrowserPool
- Basic status: generating / running / success / failed
- Basic preview/log/result UI
- Agency/workflow full integration (as specified in spec)

**Implication:** This is a complete end-to-end implementation of the core automation pipeline, including frontend chat UI and backend engine. No features deferred.

---

### Q2: Which Vision LLM should be the primary?

**Answer:** Configurable via admin settings.

**Implication:** A new admin setting (in `system_settings`) controls which vision model is used for screenshot-to-selector. The system should support at minimum GPT-4o and Claude Vision models. The vision LLM selection should respect the existing multi-provider LLM routing system.

---

### Q3: Is playwright-python already installed and configured?

**Answer:** Already installed and ready. Playwright is in requirements.txt and browser binaries are installed on the server.

**Implication:** No OS dependency installation step needed. Can proceed directly to implementation. Tests can assume Playwright is available, but CI mocking is still recommended for unit tests.

---

### Q4: DB schema migration workflow for `automation_templates` table?

**Answer:** Schema changes need separate PR/review. Create migration SQL separately so it can be reviewed before being applied.

**Implication:**
- Follow the existing Database Safety Protocol (backup → migrate → verify)
- Generate Drizzle migration SQL files but document them separately for review
- Do NOT auto-apply with `pnpm db:push` — create the SQL and let the team review first
- This applies to: `automation_templates`, `automation_sessions`, any new PostgreSQL tables

---

## Round 2

### Q5: Credit flow — how are credits charged for Python-direct Playwright?

**Answer:** Implement both: reserve upfront + Python reports actuals.

**Implication:**
- Node.js tRPC router pre-reserves a max budget (e.g., 100 credits) before dispatching to Python Celery task
- Python tracks actual Vision LLM token usage + Playwright session duration during task execution
- At task completion, Python reports actual cost back to Node.js via callback or status update
- Node.js calculates refund: `refundCredits(userId, reservedAmount - actualCost)`
- This matches the spec Section 10 design (Python credit client calling Node.js credit API)
- Use `sourceType: "browser_automation"` for credit transactions

---

### Q6: Where does the `allowed_domains` whitelist come from?

**Answer:** Tenant-level setting.

**Implication:**
- Each tenant has their own `allowed_domains` list stored in tenant settings or `system_settings` table with tenant scope
- The Admin UI (existing tenant settings page) gets a new section for "Automation Allowed Domains"
- Python `BrowserPool.acquire()` passes `tenant_allowed_domains` to SSRF validation
- Empty list = deny all (existing behavior preserved)
- This is a per-tenant admin configuration, not set by end users

---

### Q7: Should SelectorCache use PostgreSQL backup in addition to Redis?

**Answer:** Redis-only is fine.

**Implication:**
- `SelectorCache` stores verified selectors only in Redis with TTL (7 days per spec)
- No PostgreSQL `selector_cache` table needed
- Cache miss = regenerate via Vision LLM (acceptable UX trade-off)
- Redis key format: `selcache:{tenant_id}:{url_hash}:{goal_hash}` (per spec)
- No persistent DB table for selector cache — simplifies implementation

---

### Q8: Where is AutomationChatModal accessible from?

**Answer:** Follow spec exactly — AutomationChatModal + `web_automation` node in WorkflowEditor + sidebar entry.

**Implication:**
- New sidebar navigation entry for "Automation Copilot"
- `AutomationChatModal.tsx` — primary chat interface (component in `automation/`)
- `AutomationPreviewPanel.tsx` — shows plan before execute
- `AutomationStepTracker.tsx` — real-time progress during generate + execute
- `web_automation` node added to WorkflowEditor node registry
- Entry points: sidebar + Agency Builder + Workflow Editor (all three per spec section 4.4)

---

## Key Decisions Summary

| Decision | Choice |
|---|---|
| Implementation scope | Full stack end-to-end (backend + frontend) |
| Vision LLM | Configurable via admin settings (not hardcoded) |
| Playwright status | Already installed — no setup needed |
| DB migration approach | Separate SQL for review — not auto-applied |
| Credit flow | Reserve upfront (Node.js) + report actuals (Python) + refund difference |
| Allowed domains | Tenant-level setting (admin configurable per tenant) |
| Selector persistence | Redis-only (no PostgreSQL backup) |
| Frontend entry points | Sidebar + Agency Builder + WorkflowEditor (per spec 4.4) |
