# SmartSpec Python Backend

FastAPI async backend serving as LLM gateway, media generation orchestrator, and AI task processor.

## Structure

```
python-backend/
├── app/
│   ├── main.py              # FastAPI app entry point
│   ├── api/v1/              # API route handlers
│   │   └── media_generation.py  # Media generation endpoints
│   ├── core/                # Core configuration
│   │   ├── celery_app.py    # Celery worker configuration
│   │   ├── csrf.py          # CSRF protection
│   │   └── openapi.py       # OpenAPI schema config
│   ├── services/            # Business logic
│   │   └── media_task_service.py  # Media task orchestration
│   ├── tasks/               # Celery background tasks
│   │   └── media_tasks.py   # Media generation tasks
│   ├── models/              # SQLAlchemy models
│   └── llm_proxy/           # LLM provider abstraction
├── tests/                   # pytest test suite
├── requirements.txt         # Python dependencies
├── pyproject.toml           # Tool configuration (pytest, black, ruff, mypy)
├── Dockerfile               # Multi-stage production build
└── .env                     # Environment variables (not committed)
```

## Commands

```bash
# Development
uvicorn app.main:app --reload --port 8000

# Background worker
celery -A app.core.celery_app worker -l info

# Task monitoring
celery -A app.core.celery_app flower --port=5555

# Testing (80% coverage enforced)
pytest                          # Full suite
pytest -m unit                  # Unit tests only
pytest -m integration           # Integration tests only
pytest -k test_media            # Pattern matching

# Code quality
black app/ tests/               # Format (100 char width)
isort app/ tests/               # Sort imports
ruff check app/                 # Lint
mypy app/                       # Type check
```

## Code Style

| Tool | Config |
|------|--------|
| Black | 100 char line length, Python 3.11/3.12 target |
| isort | Black-compatible profile, trailing commas |
| Ruff | E, W, F, I, B, C4, UP rules (E501 ignored) |
| mypy | Gradual typing, `ignore_missing_imports=true` |

## Testing

- **Framework**: pytest 7+ with asyncio auto mode
- **Coverage**: 80% minimum (`--cov-fail-under=80`)
- **Reports**: HTML at `.spec/reports/coverage/html/`, JSON output
- **Markers**: `unit`, `integration`, `e2e`, `slow`, `auth`, `credits`, `llm`, `payment`
- **Async**: All async tests auto-detected (asyncio_mode = auto)

## Key Dependencies

- **FastAPI** + **Uvicorn**: Async web framework
- **SQLAlchemy 2** + **asyncpg**: Async ORM and PostgreSQL driver
- **Alembic**: Database migrations
- **Celery** + **Redis**: Background task processing
- **LangChain** + **LangGraph**: LLM orchestration
- **OpenAI/Anthropic/Google/Groq SDKs**: Multi-provider LLM support
- **boto3**: S3/R2 storage integration
- **Pydantic 2**: Request/response validation

## Architecture Patterns

- **Async-first**: All API endpoints and DB operations use async/await
- **Celery tasks**: Long-running media generation tasks run in background workers
- **Service layer**: Business logic separated in `app/services/`
- **Multi-provider LLM**: Abstracted via `app/llm_proxy/` with unified interface
- **Task status polling**: Client polls for task completion via API

### Encryption Systems

Two encryption modules exist:

| Module | Purpose | Key |
|--------|---------|-----|
| `app/core/encryption.py` (Fernet) | Python-only encrypted fields | `ENCRYPTION_MASTER_KEY` |
| `app/core/smartspecweb_crypto.py` | Decrypt data encrypted by Node.js web app | `LLM_ENCRYPTION_KEY` |

Use `smartspecweb_crypto.decrypt_smartspecweb()` to read API keys stored by the web app.
Use `encryption_service.encrypt()` for Python-only secrets.

See root CLAUDE.md for full encryption safety rules.

## Environment Variables

Required: `DATABASE_URL`, `REDIS_URL`, LLM API keys (OPENAI_API_KEY, etc.)
See the `.env` file (not committed) for all configuration options.

## Debugging: Python Backend Specifics

Follow the root CLAUDE.md Debugging Protocol. Additionally for this backend:

### API endpoint bugs
1. Check the FastAPI error response — Pydantic validation errors include field-level details
2. Read the route handler in `app/api/v1/` and trace into the service layer
3. For async bugs: check for missing `await` keywords (common cause of "coroutine was never awaited")
4. Use `pytest -k test_name -s` to see print/log output during test runs

### Celery task bugs
1. Check Celery worker logs — task failures include full tracebacks
2. Verify Redis is running and accessible (`redis-cli ping`)
3. For tasks stuck in PENDING: check if the worker is actually consuming from the right queue
4. For serialization errors: ensure task arguments are JSON-serializable (no datetime, model objects)

### Database bugs
1. For migration errors: check Alembic version history (`alembic history`)
2. For async session bugs: ensure sessions are used within `async with` context
3. For "relation does not exist": migration may not have run — `alembic upgrade head`

### Alembic Migration Safety (MANDATORY)

Follow the root CLAUDE.md Database Safety Protocol. For Alembic specifically:

**Before creating or running a migration:**
```bash
# 1. Backup affected tables
mkdir -p ../.db-backups
pg_dump "$DATABASE_URL" --data-only --table=TABLE_NAME \
  --file="../.db-backups/TABLE_NAME_$(date +%Y%m%d_%H%M%S).sql"

# 2. Record row counts
psql "$DATABASE_URL" -c "SELECT count(*) FROM TABLE_NAME;"

# 3. Review the generated migration file BEFORE running it
alembic revision --autogenerate -m "description"
# READ the file in migrations/versions/ — check for DROP statements
```

**After running `alembic upgrade head`:**
```bash
# 4. Verify row counts match
psql "$DATABASE_URL" -c "SELECT count(*) FROM TABLE_NAME;"

# 5. If counts decreased → restore immediately
psql "$DATABASE_URL" < "../.db-backups/TABLE_NAME_TIMESTAMP.sql"
```

**Dangerous Alembic patterns:**
- Autogenerated migrations may include unexpected DROP — always review before running
- `op.drop_column()` and `op.drop_table()` → data loss, needs backup + user approval
- Column type changes with `alter_column()` → may truncate or fail on existing data
- Always include `downgrade()` function for rollback capability

### Common Python pitfalls
- **ImportError in Celery**: Worker imports app differently than FastAPI — use absolute imports
- **asyncpg connection pool**: Exhausted pool → check for session leaks (missing `await session.close()`)
- **Pydantic V2 breaking changes**: `.dict()` → `.model_dump()`, `validator` → `field_validator`
- **Coverage below 80%**: Add unit tests for new code, or add to omit list in pyproject.toml if truly untestable
