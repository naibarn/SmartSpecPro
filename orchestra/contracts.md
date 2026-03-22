# Orchestra Contracts

## Wave 1: Security Audit (Read-Only)

All Wave 1 agents are READ-ONLY. No file modifications.

### Agent A (ssp-security-trpc)
- Ownership: apps/web/server/routers/*.ts, apps/web/server/services/*.ts
- Output: Security findings with severity ratings

### Agent B (ssp-security-fastapi)
- Ownership: python-backend/app/api/*.py, python-backend/app/services/*.py
- Output: Security findings with severity ratings

### Agent C (ssp-security-frontend)
- Ownership: apps/web/client/src/**/*.tsx
- Output: Security findings with severity ratings

### Interface
Each agent produces findings in format:
- Severity: CRITICAL / HIGH / MEDIUM / LOW
- File: absolute path
- Line: line number(s)
- Finding: description
- Recommendation: fix suggestion
