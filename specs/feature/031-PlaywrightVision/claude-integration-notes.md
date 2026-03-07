# Integration Notes: Opus Review Feedback

**Reviewed:** 2026-03-06
**Reviewer:** Claude Opus (subagent)
**Total findings:** 22 (3 critical, 3 high, 6 medium, 10 low/missing)

---

## Integrating (will update claude-plan.md)

### Critical

**1. `browser_automation` enum value does not exist yet**
- INTEGRATING: The plan incorrectly states this is an existing enum value. It must be added via schema migration OR the plan should use `"other"` until the enum is extended.
- Decision: Add `browser_automation` to `creditSourceTypeEnum` as part of Wave 5 (DB schema). Use `"other"` in Waves 1-4 until migration is applied. Update plan section 11 and 5.2.

**2. Celery execute task time limits too tight**
- INTEGRATING: 90s soft limit is insufficient for browser launch + navigation + multiple Vision LLM calls + healing. Increasing to `soft_time_limit=300, time_limit=360`.
- Update section 3.8.

**3. SSRF TOCTOU vulnerability (DNS rebinding)**
- INTEGRATING: The pre-navigation DNS check is necessary but insufficient since the browser resolves DNS independently. Adding Playwright `route()` API interception as a secondary defense layer that validates all outbound requests at the browser level.
- Update section 3.2 and 3.5.

### High

**4. BrowserPool lifecycle in Celery workers**
- INTEGRATING: The pool cannot live as a FastAPI lifespan dependency when execution happens in Celery workers. Changing architecture: BrowserPool will be initialized per-Celery-worker using `worker_process_init` signal, stored as a module-level singleton within each worker process.
- Update section 3.3 and 3.8.

**5. Credit refund unreliable if user closes browser**
- INTEGRATING: Adding a Celery beat reconciliation task that scans for completed executions with unreturned credit reservations (older than 10 minutes) and issues refunds automatically.
- Update section 5.2 and add beat schedule entry in 3.8.

**6. `page.evaluate()` policy needs system-script exception**
- INTEGRATING: Adding explicit clarification that system-authored overlay injection scripts are permitted. Only user/LLM-derived scripts are prohibited.
- Update section 8.1.

### Medium

**7. Redis cancel key needs TTL**
- INTEGRATING: Adding TTL 3600s to the cancel key, matching status key TTL.
- Update section 4.

**8. Empty allowed_domains UX**
- INTEGRATING: Adding admin notification/warning in the Automation Copilot settings panel when no domains are configured.
- Update section 6.4.

**10. Selector cache hash truncation too short**
- INTEGRATING: Increasing from `[:16]` to `[:32]` (128-bit collision space).
- Update section 3.4.

**11. No rate limiting on /analyze endpoint**
- INTEGRATING: Adding per-user rate limit (5 requests/minute) at the tRPC layer using existing rate limiter patterns.
- Update section 5.1.

**12. Wave ordering puts DB schema last**
- INTEGRATING: Adding a note that Waves 1-4 operate in Redis-only mode. Moving DB schema to Wave 3 (alongside tRPC) to ensure durable audit trail is available sooner. Template persistence stays in Wave 5.
- Update section 10.

**14. Missing Playwright browser binary installation**
- INTEGRATING: Adding `playwright install chromium` to prerequisites and Dockerfile/systemd notes.
- Update section 2 (project structure prerequisites).

---

## NOT Integrating (with reasoning)

**9. `hybrid` intent type underspecified**
- NOT INTEGRATING: The hybrid type is intentionally deferred to implementation phase. The LLM prompt for intent analysis will include examples of hybrid classification. Over-specifying this at the plan level would be premature — the implementer needs to experiment with prompt engineering.

**13. getStatus as query with side effects (refund)**
- NOT INTEGRATING: This is a pragmatic trade-off. The refund logic in getStatus is idempotent (runs once per execution via a `refunded` flag). Splitting into a separate mutation adds complexity without real benefit. The beat reconciliation task (item 5) serves as the safety net.

**15. Vision fallback to text_only_analysis**
- NOT INTEGRATING: Text-only analysis is a graceful degradation, not a guarantee. It uses the page's accessibility tree and DOM structure to attempt selector generation. While less accurate, it can still succeed for simple pages. Raising an error immediately would give users no option. The confidence threshold (< 0.5) already gates low-quality results.

**16. Browser memory impact**
- NOT INTEGRATING at plan level. This is an operational concern addressed by the existing monitoring stack. The pool's max 10 contexts provides an implicit memory cap. A memory monitoring note would be documentation, not implementation planning.

**17. `_build_workflow` / `_build_agency` output schemas**
- NOT INTEGRATING: These are thin wrappers that create workflow/agency definitions using the existing format from `workflow_generator.py` and `agency_creator_task.py`. The implementer should read those existing files and match the format. Documenting the format in the plan would duplicate existing code.

**18. `callLLMStructured` is Node.js, not Python**
- NOT INTEGRATING as a plan change. The plan says "using the existing `callLLMStructured` pattern" — meaning the same conceptual pattern (structured LLM call with JSON schema), not the literal function. The Python implementation uses `gateway_unified.py`. This is clear enough for implementation.

**19. Screenshot cleanup**
- NOT INTEGRATING: Screenshots are passed as base64 strings in memory during execution and stored in the Redis status JSON (TTL 1 hour). They are not persisted to disk or S3 during execution. The `automation_executions` table stores only `screenshotsTaken` count, not the actual images. This is already implicit in the plan.

**20. SPA wait strategy**
- NOT INTEGRATING at plan level. The `networkidle` wait is a sensible default. Playwright's `networkidle` works for most sites. For SPAs that never truly idle, the existing timeout (30s default) will fire. The self-healing loop handles the case where elements aren't yet visible. This is an implementation detail better handled during development.

**21. Tenant isolation test in BrowserPool**
- NOT INTEGRATING as a new test case — the existing test suite already verifies that `BrowserContext` objects are isolated (Playwright's guarantee), and the test for Redis counter per-tenant verification covers the tenant key isolation. Adding a cross-tenant cookie test would be testing Playwright's isolation guarantees, not our code.

**22. Playwright version pinning vs existing installation**
- NOT INTEGRATING: Both the existing presentation renderer and the new automation copilot use the same `playwright` package from `requirements.txt`. There is no version conflict risk since they share the same installation. The browser pool pattern is compatible with per-task usage patterns.
