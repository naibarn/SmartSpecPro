---
name: Feature 046 Virtual Admin celery-health endpoint audit
description: Security audit of python-backend/app/api/virtual_admin.py and nginx firewall config for the /api/internal/virtual-admin/celery-health endpoint
type: project
---

Audit date: 2026-03-18
Branch: codex/feature-044-multimodal-chat-memory

## Files audited
- `python-backend/app/api/virtual_admin.py`
- `python-backend/app/main.py`
- `nginx/conf.d/dev-host.conf`

## Findings summary

**No CRITICAL findings.**

| ID  | Sev    | Location                              | Issue |
|-----|--------|---------------------------------------|-------|
| F01 | HIGH   | virtual_admin.py:47–55               | `"error": str(e)` in response can leak broker URL / connection strings |
| F02 | HIGH   | virtual_admin.py:29                  | `broker_url` read per-request from live Celery config — serialization risk |
| F03 | MEDIUM | virtual_admin.py:32–37               | Redis conn not closed on llen() exception — connection leak |
| F04 | MEDIUM | virtual_admin.py:14                  | No auth dependency — endpoint relies solely on nginx deny block |
| F05 | MEDIUM | main.py:339                          | uvicorn `host="0.0.0.0"` — bypasses nginx if port 8000 reachable directly |
| F06 | MEDIUM | virtual_admin.py:23–24               | Celery inspect.active()/stats() may block event loop; timeout not per-call |
| F07 | LOW    | nginx:259–262, 515–518               | Correct but non-obvious: `/api/internal/` deny works via longest-prefix match |
| F08 | LOW    | virtual_admin.py:39,48               | f-string exception logging may embed Redis URL in log line |

## Key architectural note
nginx correctly blocks `/api/internal/` via longest-prefix matching (18 chars > 5 chars for `/api/`).
Both HTTP (:80) and HTTPS (:443) server blocks have the deny rule.
The single-layer risk is that uvicorn may be bound to 0.0.0.0 — check systemd unit for `--host 127.0.0.1`.

**Why:** Confirming the systemd ExecStart uses --host 127.0.0.1 is the most important follow-up action.
**How to apply:** In future audits, always check uvicorn bind address in systemd unit alongside nginx rules.
