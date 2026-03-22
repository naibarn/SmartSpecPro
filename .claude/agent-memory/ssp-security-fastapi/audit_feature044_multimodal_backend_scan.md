---
name: Feature 044 multimodal backend security scan
description: Full python-backend scan (api/, tasks/, services/, core/) for SQL injection, command injection, unsafe deserialization, secrets exposure, SSRF, and missing auth — branch codex/feature-044-multimodal-chat-memory
type: project
---

Full scan of all python-backend layers on branch codex/feature-044-multimodal-chat-memory (2026-03-16).

**Why:** Pre-merge security audit dispatched by orchestra as CMD-6 parallel specialist.

**How to apply:** These findings are concrete bugs to fix before merge. Reference line numbers may drift; verify before patching.

## Confirmed Findings

### HIGH — SQL Injection (f-string in text())
- `python-backend/app/orchestrator/node_executors/data_executors/database_query_executor.py:288`
  `text(f"SET statement_timeout = '{timeout_seconds * 1000}'")`
  `timeout_seconds` is cast from `int(config.get("timeout", 30))` which clamps it, so exploitation requires a type confusion bug upstream. Low practical risk but pattern is wrong — use parameterized form.

### HIGH — SQL Injection (f-string DDL)
- `python-backend/app/orchestrator/vector_store/index_manager.py:154-168`
  `CREATE INDEX IF NOT EXISTS {index_name} ON {table_name} ...` — `table_name` is validated by regex at `create_index()` but `column_name` and config numeric fields (`config.lists`, `config.m`, `config.ef_construction`) are interpolated without validation beyond the initial regex on column_name.
- `python-backend/app/orchestrator/vector_store/index_manager.py:202`
  `DROP INDEX IF EXISTS {index_name}` — `index_name` is looked up from internal `_indexes` dict (populated only via `create_index` which validates `table_name` + derives `index_name`). Low actual risk.
- `python-backend/app/tasks/browser_policy_maintenance_tasks.py:114-123`
  `CREATE TABLE IF NOT EXISTS "{window.table_name}"` — `window.table_name` is derived from a regex-validated partition name (`_PARTITION_NAME_RE`). Low actual risk.
- `python-backend/app/tasks/browser_policy_maintenance_tasks.py:143`
  `DROP TABLE IF EXISTS "{partition_name}"` — similarly regex-validated. Low actual risk.

### HIGH — Celery task receives raw JWT
- `python-backend/app/tasks/agency_creator_task.py` — `user_jwt` passed as Celery task argument and stored in Redis state key `_user_jwt` (line 185). Full bearer token persists in Redis at rest and in Celery broker.
- `python-backend/app/tasks/automation_copilot_task.py:78,157` — same pattern.

### MEDIUM — print() logging in production code
- `python-backend/app/api/tenant_current.py:122` — prints DB exception (may include connection string fragments)
- `python-backend/app/api/telegram_webhook.py:256,269`
- `python-backend/app/api/artifacts.py:45`
- `python-backend/app/kilo/memory_extractor.py:199,223,359,408,426`
- `python-backend/app/core/redis_client.py:47,64,85` — Redis connection failure; URL in exception

### MEDIUM — Hardcoded fallback encryption key
- `python-backend/app/services/media_provider_service.py:24`
  `_RAW_KEY = os.environ.get("LLM_ENCRYPTION_KEY") or ... or "smartspec-media-key-32chars!"`
  Known plaintext fallback key in source.

## Not Found / Confirmed Safe
- Celery serializer: confirmed JSON-only (`task_serializer="json"`, `accept_content=["json"]`) — no pickle.
- `os.environ` serialized in response: not found.
- `subprocess.run(shell=True)` / `os.system()`: not found in api/tasks/services/core (only in orchestrator quality_gates validator as a detected pattern string, and `create_subprocess_exec` which is safe).
- `eval()`/`exec()` with user input in api/tasks/services/core: not found. Orchestrator executor uses RestrictedPython sandbox.
- SSRF via user-controlled URL: `control_plane_proxy.py` proxies to a fixed `CONTROL_PLANE_URL` env var; `presentation_import.py` `slides_url` is passed to a Celery task (not fetched directly); no open-redirect fetch found in api layer.
- Missing `Depends(get_current_user)`: all public endpoints (health, webhooks, tenant_current) appear intentionally public; all user-data endpoints carry auth dependency.
