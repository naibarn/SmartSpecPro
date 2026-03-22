---
name: Feature 047 — Team Orchestrator API / Memory Embedding / Help Screenshot security audit (v2)
description: Full security audit of team_orchestrator_api.py, help_screenshot.py, team_orchestrator.py, agency_result_envelope.py, memory_embedding.py, summary_generator.py, media_tasks.py, celery_app.py, database.py, main.py (2026-03-18 re-audit after fixes)
type: project
---

Audit date: 2026-03-18 (second pass — all prior CRITICAL/HIGH issues from first audit were resolved)
Branch: codex/feature-044-multimodal-chat-memory

Files audited:
- python-backend/app/api/team_orchestrator_api.py
- python-backend/app/api/help_screenshot.py
- python-backend/app/services/team_orchestrator.py
- python-backend/app/services/agency_result_envelope.py
- python-backend/app/services/memory_embedding.py
- python-backend/app/services/summary_generator.py
- python-backend/app/tasks/media_tasks.py
- python-backend/app/core/celery_app.py
- python-backend/app/core/database.py
- python-backend/app/main.py
- python-backend/tests/test_team_orchestrator_security.py
- python-backend/tests/test_help_screenshot.py

## Remaining findings (post-fix)

**F01 — MEDIUM — help_screenshot.py:150** — Exception detail (raw `exc` object) interpolated into HTTP 500 response detail string.
`detail=f"Screenshot capture failed: {exc}"` — while this endpoint is internal-only, the exception string could expose internal path fragments or error info to the Node.js gateway layer.
Fix: return `"Screenshot capture failed"` (static); log `exc_info=True` server-side.

**F02 — MEDIUM — team_orchestrator.py:15 / summary_generator.py:9 / memory_embedding.py:9** — Three new service modules use stdlib `logging` instead of the project-standard `structlog`. Mixed logger types bypass the structured log pipeline.
Fix: replace `import logging` / `logging.getLogger(__name__)` with `import structlog` / `structlog.get_logger(__name__)`.

**F03 — LOW — memory_embedding.py:59** — Embedding stored as Python repr string `str(list[float])` rather than proper pgvector wire format.
`{"embedding": str(embedding)}` is fragile. Fix: pass `list` directly (pgvector asyncpg driver accepts it) or cast in SQL.

**F04 — LOW — help_screenshot.py:117–119** — `HELP_ASSETS_DIR` env var used as filesystem root without path-traversal guard. `feature_name`/`step` are regex-validated but env var itself is trusted. Low risk (operator-set only). No code fix required; document that `HELP_ASSETS_DIR` must be scoped to uploads tree.

## Clean items (no issues found)

- SQL injection: all DB calls use ORM selects or `text()` with named bind params.
- Auth: router-level `Depends(_verify_proxy_token)` and `Depends(_verify_internal_token)` protect all routes with constant-time comparison.
- LLM prompt injection: `_build_messages()` isolates persona_context and transcript into `role: "user"` messages only.
- Error leakage: team_orchestrator.py returns generic `"[Agent turn unavailable]"` on exception.
- Celery: no secrets passed as task arguments — API keys fetched from DB inside task body.
- `os.environ` serialization: none found.
- `print()` logging: none in audited service/task files.
- `agency_result_envelope.py`: pure validation, `extra="forbid"`, no injection surface.
- `database.py`: sanitizes DB URL before logging.
- Tests: comprehensive security test coverage for all findings.

**Why:** These were all part of the Virtual AI Office Orchestrator feature (Feature 044/047). The prior CRITICAL/HIGH findings (missing auth, bare SQL, prompt injection into system msg, exception leak) were all fixed before this second pass.
