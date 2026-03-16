# Risk Register — SmartSpecPro Codebase Security Scan
Last updated: 2026-03-16
Status: IN PROGRESS (2 agents pending)

## Findings

### tRPC Routers (Complete)

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| T03 | HIGH | IDOR | apps/web/server/routers/scheduledMessages.ts | 688 | getAnalytics accepts scheduleId without ownership check — any user can read another's schedule logs | OPEN |
| T04 | HIGH | SECRET_EXPOSURE | apps/web/server/routers/users.ts | 131-140 | Admin get uses wildcard select() exposing passwordHash, twoFactorSecret, recoveryCodes | OPEN |
| T01 | MEDIUM | VITE_SECRET | apps/web/server/_core/env.ts | 3,35,39 | VITE_ prefix env vars in server code risk client bundle exposure | OPEN |
| T02 | MEDIUM | VITE_SECRET | 7 server files | various | VITE_PYTHON_BACKEND_URL in 7 server files | OPEN |
| T05 | MEDIUM | IDOR | apps/web/server/routers/googleDrive.ts | - | UPDATE WHERE lacks tenantId/userId guard | OPEN |
| T06 | MEDIUM | IDOR | apps/web/server/routers/oneDrive.ts | - | UPDATE WHERE lacks tenantId/userId guard | OPEN |

### Frontend + LLM (Complete)

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| FE01 | CRITICAL | JWT_ISSUE | client/src/services/authService.ts | 44,67 | JWT stored in localStorage — XSS = full account takeover | OPEN |
| FE02 | CRITICAL | SECRET_EXPOSURE | client/src/_core/hooks/useAuth.ts | 45-48 | User object (email, is_admin) written to localStorage every render | OPEN |
| FE03 | CRITICAL | XSS | presentation-canvas/CanvasObjects.tsx + 3 files | 289+ | dangerouslySetInnerHTML with unsanitized SVG from database — stored XSS | OPEN |
| FE04 | HIGH | AUTH_BYPASS | client/src/App.tsx | 149-175 | Admin routes have no auth wrapper — rely on per-page hooks | OPEN |
| FE05 | HIGH | CORS | server/_core/index.ts | 126 | .smartspec.pro in CORS whitelist but production is smartaihub.app | OPEN |
| FE06 | HIGH | PROMPT_INJECTION | server/services/aiPresentationService.ts | 8930-8955 | User topic interpolated into LLM prompt without XML delimiters | OPEN |
| FE07 | MEDIUM | SECRET_EXPOSURE | client/src/services/authService.ts | 283,292 | User API keys stored in localStorage plaintext | OPEN |
| FE08 | MEDIUM | VITE_SECRET | client/src/components/Map.tsx | 91 | VITE_FRONTEND_FORGE_API_KEY in client bundle | OPEN |

### Python Backend (Complete)

| ID | Severity | Category | File | Line | Description | Status |
|----|----------|----------|------|------|-------------|--------|
| F01 | HIGH | SQL_INJECTION | python-backend/app/orchestrator/.../database_query_executor.py | 288 | f-string in text() for SET statement_timeout | OPEN |
| F02 | HIGH | SQL_INJECTION | python-backend/app/orchestrator/.../index_manager.py | 154-168 | DDL SQL with f-string interpolation for CREATE INDEX | OPEN |
| F03 | HIGH | SECRET_EXPOSURE | python-backend/app/tasks/agency_creator_task.py | 101,159,170,185 | Full JWT passed as Celery task arg + stored in Redis | OPEN |
| F04 | HIGH | SECRET_EXPOSURE | python-backend/app/tasks/automation_copilot_task.py | 78,157 | JWT in Celery args | OPEN |
| F05 | HIGH | SECRET_EXPOSURE | python-backend/app/services/media_provider_service.py | 24 | Hardcoded fallback encryption key in source code | OPEN |
| F06 | MEDIUM | SECRET_EXPOSURE | python-backend/app/api/tenant_current.py | 122 | print(f"...{e}") may leak DATABASE_URL | OPEN |
| F07 | MEDIUM | SECRET_EXPOSURE | python-backend/app/api/telegram_webhook.py | 256 | print(f"...{e}") may leak DB connection string | OPEN |
| F08 | MEDIUM | SECRET_EXPOSURE | python-backend/app/core/redis_client.py | 47,64,85 | print(f"...{e}") may leak Redis URL with password | OPEN |
| F09 | MEDIUM | SECRET_EXPOSURE | python-backend/app/kilo/memory_extractor.py | 199,223,359,408,426 | 5x print(f"...{e}") in production paths | OPEN |
| F10 | MEDIUM | SECRET_EXPOSURE | python-backend/app/api/artifacts.py | 45 | print(f"...{e}") leaks file path | OPEN |

### Python Clean Areas
- Celery: JSON serializer (no pickle) ✓
- No subprocess.run(shell=True) ✓
- No yaml.load() without SafeLoader ✓
- No os.environ serialized in HTTP responses ✓
- No open SSRF proxy ✓
- All user endpoints have auth ✓
- LLM prompts use correct user role message ✓

## Clean Areas
- credits.ts, apiKeys.ts, videoEditorProjects.ts, mediaJobs.ts — all clean
- No SQL injection found — Drizzle parameterized queries throughout
- agency.ts, library.ts, artifact.ts — proper tenant isolation
