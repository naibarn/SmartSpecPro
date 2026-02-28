# Section 01 Code Review Interview

## User Decisions

1. **FastAPI upgrade**: Keep upgrade to >=0.115.0 (resolves starlette conflict from agency-swarm)
2. **Sibling Dockerfiles**: Upgrade both to python:3.12-slim for consistency
3. **Feature flag test**: Use monkeypatch for robustness

## Auto-Fixes Applied

4. Add Anthropic provider contract tests (AsyncAnthropic importability)
5. Add agency-swarm importability test
6. Add missing test_tool_call_output_type
7. Fix unused import warning with # noqa: F401
8. Update .env.example with AGENCY_SWARM_ENABLED=false

## Let Go

9. Sandbox dispatch no-op test (Zod validation is Node.js side)
10. File-scanning relative paths (pytest runs from python-backend/)
11. pyproject.toml 3.11 classifier (keeping for compatibility)
