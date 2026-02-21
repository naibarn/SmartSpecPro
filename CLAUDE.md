# SmartSpecPro

AI-driven specification and media generation platform with multi-provider LLM integration, skills engine, and enterprise admin tooling.

## Architecture

Monorepo managed by **Turborepo** with **pnpm** workspaces (npm fallback):

```
SmartSpecPro/
├── apps/web/           # Main web app (React + Express + tRPC)
├── apps/tauri-shell/   # Desktop app (Tauri wrapper)
├── packages/db/        # Database schemas & ORM types
├── packages/shared/    # Shared constants, types, menu config
├── packages/skills/    # Skill detection, parsing, YAML support
├── packages/ui/        # Shared React UI components (Radix-based)
├── python-backend/     # FastAPI async backend (LLM gateway, Celery tasks)
├── control-plane/      # Centralized management service
├── docker/             # Docker configurations
└── planning/           # Feature planning docs
```

## ⚠️ CRITICAL DEPLOYMENT RULES — MANDATORY

**NEVER violate these rules. They are based on user's explicit requirements to prevent recurring production issues.**

### Domain and Access Rules

**PRODUCTION DOMAIN (ONLY):**
- ✅ **https://smartaihub.app** — This is the ONLY allowed production domain
- ❌ **NEVER use:** smartspec.pro, smartspec.local, smarthubai.app, or any other domain

**Server Environment:**
- This is a **remote server** with **NO browser, NO UI** — accessible via **SSH ONLY**
- Developers access the application **ONLY through the domain** https://smartaihub.app
- **localhost access is NOT available** to end users (only for internal service communication)

**Service Access:**
- Backend API (internal): http://localhost:8000
- Web App (internal): http://localhost:3000
- **Public access (ONLY):** https://smartaihub.app (proxied through Nginx)

**Nginx Requirement:**
- Nginx reverse proxy **MUST be running** for domain access to work
- Nginx is automatically managed by `./run-services.sh`
- Container name: `smartspec-nginx-dev`
- Config: `nginx/conf.d/dev-host.conf`

### Service Management — SINGLE SOURCE OF TRUTH

**Production services are managed by systemd. NO EXCEPTIONS.**

Service files: `/etc/systemd/system/smartspec-{backend,web}.service`
Source of truth: `docker/systemd/smartspec-{backend,web}.service`

**Allowed commands:**
```bash
# Status
./run-services.sh status                          # Check all services
systemctl status smartspec-backend.service         # Backend status
systemctl status smartspec-web.service             # Web status

# Start / Stop / Restart (requires sudo)
sudo systemctl start smartspec-backend.service     # Start backend
sudo systemctl start smartspec-web.service         # Start web
sudo systemctl stop smartspec-backend.service      # Stop backend
sudo systemctl stop smartspec-web.service          # Stop web
sudo systemctl restart smartspec-backend.service   # Restart backend
sudo systemctl restart smartspec-web.service       # Restart web

# After code changes that affect the server
cd apps/web && npm run build                       # Rebuild frontend assets
sudo systemctl restart smartspec-web.service       # Restart to pick up changes

# Logs
journalctl -u smartspec-web.service -f             # Live web logs
journalctl -u smartspec-backend.service -f         # Live backend logs
```

### FORBIDDEN — Service Anti-Patterns

**NEVER do any of the following. These cause port conflicts and restart loops.**

| FORBIDDEN | Why | Do this instead |
|---|---|---|
| `screen -dmS ... uvicorn/tsx` | Conflicts with systemd | `sudo systemctl start` |
| `nohup uvicorn ... &` | Orphan process blocks port | `sudo systemctl start` |
| `pnpm dev` / `npm run dev` in background | Dev mode conflicts with prod | `sudo systemctl restart` |
| `kill $(lsof -t -i:3000)` to "fix" port | Kills systemd-managed process, triggers restart loop | `sudo systemctl stop` first |
| `./run-services.sh start` without sudo | Fails silently on systemctl calls | Use sudo systemctl directly |

### Service Architecture

```
systemd
├── smartspec-infra.service      # PostgreSQL + Redis (Docker)
├── smartspec-backend.service    # Python FastAPI (uvicorn :8000)
│   ├── KillMode=mixed           # Clean shutdown
│   ├── Restart=on-failure       # Auto-recover from crashes only
│   └── ExecStartPre             # Wait for port to be free
├── smartspec-web.service        # Node.js + React (tsx :3000)
│   ├── Requires=backend         # Starts after backend
│   ├── KillMode=mixed
│   └── Restart=on-failure
└── smartspec.target             # Groups all services
```

**Sequential Startup Order (handled by systemd dependencies):**
1. Infrastructure (PostgreSQL, Redis) — `smartspec-infra.service`
2. Nginx reverse proxy — Docker container `smartspec-nginx-dev`
3. Python Backend — `smartspec-backend.service`
4. Web Application — `smartspec-web.service`
5. Celery Workers — manual via `./run-services.sh` or screen

### Modifying Service Files

If you need to change service configuration:
1. Edit source file in `docker/systemd/smartspec-*.service`
2. Copy to systemd: `sudo cp docker/systemd/smartspec-*.service /etc/systemd/system/`
3. Reload: `sudo systemctl daemon-reload`
4. Restart: `sudo systemctl restart smartspec-backend.service smartspec-web.service`

**Validation After ANY Config Change:**
```bash
./scripts/validate-all-configs.sh  # Run this after modifying ANY config file
```

## Quick Reference Commands

### Root-level
```bash
npm run dev:web          # Start web app in dev mode (Turbo)
npm run build            # Build all packages (Turbo)
npm run typecheck        # Type-check all packages (Turbo)
```

### Web App (apps/web/)
```bash
cd apps/web
pnpm dev                 # Dev server on :3000 (tsx watch)
pnpm build               # Vite production build
pnpm test                # Run tests (Vitest)
pnpm test:coverage       # Run tests with coverage
pnpm check               # TypeScript type check
pnpm format              # Prettier format
pnpm db:push             # Generate + run Drizzle migrations
```

### Python Backend (python-backend/)
```bash
cd python-backend
uvicorn app.main:app --reload --port 8000   # Dev server
pytest                                       # Run tests (80% coverage enforced)
black app/ tests/                            # Format code
ruff check app/                              # Lint
mypy app/                                    # Type check
celery -A app.core.celery_app worker -l info # Background worker
```

### Infrastructure
```bash
./dev-local.sh           # Start Docker infra (PostgreSQL, Redis) + local app
./run-services.sh        # Screen-based service manager (start/stop/attach)
docker compose up -d     # Base services (PostgreSQL, MySQL, Redis)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite 7, TailwindCSS 4, Radix UI, Wouter, TanStack Query |
| Backend (Node) | Express 4, tRPC 11, Drizzle ORM, PostgreSQL, IORedis, BullMQ |
| Backend (Python) | FastAPI, SQLAlchemy 2, Celery, LangChain/LangGraph |
| Desktop | Tauri 2 |
| Package Manager | pnpm 10 (web app), npm (root) |
| Build | Turborepo, Vite, tsx |
| Test | Vitest (JS/TS), pytest (Python) |
| DB | PostgreSQL 15 (primary), Redis 7 (cache/queue) |

## Coding Conventions

### TypeScript (apps/web, packages/*)
- **Strict mode** enabled, ES2022 target
- **Prettier**: 80 char width, semicolons, trailing commas
- **Imports**: Use path aliases `@/` (client/src), `@shared/`, `@assets/`
- **Schema**: Drizzle ORM with `pgTable`, camelCase columns
- **API**: tRPC routers for type-safe RPC, Express for HTTP routes
- **State**: TanStack Query for server state, React hooks for local state
- **UI**: Radix UI primitives + CVA variants + Tailwind utility classes
- **Validation**: Zod schemas shared between client and server
- **Auth**: JWT-based with session cookies, `jose` library

### Python (python-backend/)
- **Python 3.11+**, async-first with FastAPI
- **Black**: 100 char line length
- **isort**: Black-compatible profile
- **Ruff**: E, W, F, I, B, C4, UP rules
- **mypy**: Gradual type checking
- **Tests**: pytest with markers (unit, integration, e2e, auth, credits, llm)
- **Coverage**: 80% minimum enforced

## Environment Variables

Copy `.env.example` files and fill in secrets:
- `apps/web/.env` — JWT_SECRET, DATABASE_URL, LLM_ENCRYPTION_KEY, S3 credentials
- `python-backend/.env` — Database, Redis, LLM API keys

**Never commit `.env` files or actual credentials.**

## Key Architectural Patterns

### Multi-Provider LLM System
- Provider registry with health circuit breaker
- Dynamic routing based on model availability and cost
- Credit-based usage tracking per user
- Rate limiting via Bottleneck + BullMQ

### Skills Engine
- Markdown-based skill definitions (`skills/*/skill.md`)
- JSON Schema for inputs (`input.schema.json`) and UI (`ui.schema.json`)
- Skill chaining support
- Detection via `@smartspec/skills` package

### Multi-Tenancy
- Domain-based tenant isolation
- Role hierarchy: user < admin < domain_admin
- Tenant-specific settings and branding

### Media Generation
- Celery task queue for async processing
- BullMQ for Node.js side orchestration
- S3/R2 storage abstraction
- Image and video generation workflows

## Debugging Protocol — MANDATORY

When encountering ANY bug, error, or test failure, you MUST follow this protocol **in order**.
**NEVER jump straight to editing code.** The #1 cause of fix loops is changing code before understanding the problem.

### Phase 1: UNDERSTAND (Do NOT write code yet)

1. **Reproduce** — Run the exact command/test that fails. Copy the full error output.
2. **Read the error** — Parse the error message, stack trace, and file:line references carefully.
3. **Trace the data flow** — Read the relevant source files from entry point → error location. Understand the full call chain.
4. **Identify the root cause** — State it explicitly in one sentence: "The bug is caused by X because Y."
5. **Check for related issues** — Search (Grep) the codebase for similar patterns that may have the same bug.

### Phase 2: PLAN (Still no code edits)

6. **Determine the minimal fix** — What is the smallest change that fixes the root cause? Avoid changing unrelated code.
7. **Predict side effects** — What other code depends on the code you're about to change? List affected files.
8. **Write the test first (if applicable)** — If no test covers this case, write one that currently fails.

### Phase 3: FIX (Now you may edit)

9. **Make ONE focused change** — Do not refactor, improve, or "clean up" nearby code. Fix only the bug.
10. **Run the failing test/command** — Verify it now passes.
11. **Run the full test suite** — `pnpm test` (web) or `pytest` (python). Ensure no regressions.
12. **If it still fails** — STOP. Go back to Phase 1 step 2. Re-read the NEW error. Do NOT guess.

### Hard Rules

- **3-attempt limit**: If the same error persists after 3 fix attempts, STOP and ask the user for guidance. Do not keep trying.
- **No shotgun debugging**: Never change multiple things at once "to see if it helps." One change, one test, one verification.
- **No silent assumptions**: If you're unsure what a variable contains or what a function returns, READ the code or add a log. Never assume.
- **Revert failed fixes**: If a change makes things worse, revert it immediately before trying something else.
- **Read before write**: Always read the current state of a file before editing it. The file may have changed since you last saw it.

### Common Anti-Patterns to AVOID

| Anti-Pattern | What to do instead |
|---|---|
| Changing code without reading the error | Read and quote the exact error message first |
| Fixing a symptom instead of root cause | Trace the call chain to find where it actually breaks |
| Editing 5 files at once for one bug | Change one file, test, then move to the next if needed |
| Adding try/catch to suppress an error | Fix the cause of the error, don't hide it |
| Guessing at types or API shapes | Read the type definition or API source code |
| Re-running the same failing command hoping it works | Analyze what changed (or didn't) between runs |
| "Let me try a different approach" without understanding why the first failed | Explain WHY the first approach failed before switching |

## LLM & Media Debugging Protocol — MANDATORY

When investigating ANY issue related to LLM, media generation, skills, or external API calls:

1. **ALWAYS read the audit logs first** before making assumptions:
   - JSONL files: `apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`
   - grep by traceId: `grep '"traceId":"XXX"' apps/web/logs/audit/audit-*.jsonl | jq .`
   - DB: `SELECT * FROM provider_usage_log WHERE "traceId" = 'XXX'`

2. **Check BOTH request AND response payloads**:
   - What was actually sent to the provider? (model, messages, parameters)
   - What did the provider return? (status, content, usage, errors)
   - Do tokens/cost match expectations?

3. **Verify cost calculation accuracy**:
   - Compare `providerUsageLog.costUsd` vs `creditTransactions.amount`
   - Check `costCalculationMethod` — is it using provider-reported, model-lookup, or default rate?
   - For discrepancies: check model_provider_map pricing

4. **For skill issues**: Check the full chain:
   - `skill_detect` event (was the right skill matched? confidence?)
   - `skill_execute` event (what params were passed?)
   - `media_request` / `llm_request` (what was actually sent to the API?)
   - `media_response` / `llm_response` (what came back?)

5. **For media generation issues**: Check both Node.js and Python logs:
   - Node.js: JSONL audit log (`media_request`, `media_response`)
   - Python: `python-backend/logs/` for Celery task logs
   - External: Check Kie.ai/fal.ai task status via external_task_id

6. **Never guess** — the audit log has the answer. If it doesn't, that's a gap to fix.

### Querying Audit Logs

```bash
# All events for a trace
grep '"traceId":"abc123"' apps/web/logs/audit/audit-2026-02-06.jsonl | jq .

# All errors today
grep '"eventType":"error"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq .

# High latency requests (>5s)
grep '"llm_response"' apps/web/logs/audit/audit-$(date +%Y-%m-%d).jsonl | jq 'select(.timing.totalMs > 5000)'
```

```sql
-- Cost audit: find requests with traceId
SELECT "traceId", "modelUsed", "costUsd", "creditsCharged", "errorMessage"
FROM provider_usage_log
WHERE "createdAt" > NOW() - INTERVAL '7 days'
  AND "traceId" IS NOT NULL
ORDER BY "createdAt" DESC;
```

## Database Safety Protocol — MANDATORY

**Data loss is UNRECOVERABLE and UNACCEPTABLE.** When performing ANY database modification (schema change, migration, ALTER TABLE, DROP, seed, or bulk UPDATE/DELETE), you MUST follow this protocol. No exceptions.

### Backup Directory

All backups go to `.db-backups/` at the project root (git-ignored).
```bash
mkdir -p .db-backups
```

### Step 1: IDENTIFY affected tables

Before writing any migration or schema change, list ALL tables that will be affected:
```
"This migration affects tables: users, skills, llm_providers"
```

### Step 2: BACKUP before ANY change

For EVERY affected table, dump data BEFORE running the migration:
```bash
# Backup specific tables (targeted and fast)
pg_dump "$DATABASE_URL" --data-only --table=TABLE_NAME \
  --file=".db-backups/TABLE_NAME_$(date +%Y%m%d_%H%M%S).sql"

# Full database backup (for large or risky migrations)
pg_dump "$DATABASE_URL" \
  --file=".db-backups/full_backup_$(date +%Y%m%d_%H%M%S).sql"
```

Also capture row counts as a verification baseline:
```bash
psql "$DATABASE_URL" -c "
  SELECT 'TABLE_NAME' as tbl, count(*) as rows FROM TABLE_NAME
  UNION ALL
  SELECT 'OTHER_TABLE', count(*) FROM OTHER_TABLE;
"
```

### Step 3: RUN the migration

Now (and ONLY now) execute the migration:
```bash
# Drizzle (apps/web)
cd apps/web && pnpm db:push

# Alembic (python-backend)
cd python-backend && alembic upgrade head
```

### Step 4: VERIFY data integrity

Immediately after migration, check ALL of these:

```bash
# 1. Row counts — must match pre-migration counts
psql "$DATABASE_URL" -c "
  SELECT 'TABLE_NAME' as tbl, count(*) as rows FROM TABLE_NAME
  UNION ALL
  SELECT 'OTHER_TABLE', count(*) FROM OTHER_TABLE;
"

# 2. Spot-check critical data
psql "$DATABASE_URL" -c "SELECT id, name, email FROM users LIMIT 5;"

# 3. Check for unexpected NULLs in important columns
psql "$DATABASE_URL" -c "
  SELECT count(*) as null_count FROM TABLE_NAME WHERE important_column IS NULL;
"
```

### Step 5: AUTO-RESTORE if data is lost

If row counts DECREASED or critical data is MISSING — restore IMMEDIATELY:
```bash
psql "$DATABASE_URL" < ".db-backups/TABLE_NAME_TIMESTAMP.sql"
```

**Do NOT proceed with further changes.** Investigate why data was lost first.
**Do NOT ask the user to re-enter data.** The backup exists — use it.

### Risk Classification

| Operation | Risk Level | Required Actions |
|-----------|-----------|-----------------|
| ADD COLUMN (nullable) | Low | Row count check only |
| ADD COLUMN with NOT NULL + default | Medium | Backup affected table |
| ALTER COLUMN type change | HIGH | Full table backup + verify data |
| DROP COLUMN | HIGH | Full table backup + user approval |
| DROP TABLE | CRITICAL | Full DB backup + user approval |
| RENAME TABLE / COLUMN | HIGH | Full table backup |
| DELETE / TRUNCATE | CRITICAL | Full table backup + user approval |
| UPDATE (bulk, >10 rows) | HIGH | Full table backup |
| Seed script | Medium | Backup tables being seeded |
| drizzle-kit migrate / alembic upgrade | Medium-HIGH | Backup ALL affected tables |

### Migration Completion Rules — CRITICAL

**Every schema change MUST be followed by a complete migration cycle.** Leaving schema.ts out of sync with the database is a silent bug that will crash at runtime when that code path is first hit.

1. **After editing `drizzle/schema.ts`**: ALWAYS run `cd apps/web && pnpm db:push` (which runs `drizzle-kit generate && drizzle-kit migrate`)
2. **Verify migration applied**: Run `drizzle-kit migrate` and confirm "migrations applied successfully"
3. **If `drizzle-kit migrate` fails**: Apply the SQL manually via `psql` or a Node script, then seed the hash into `drizzle.__drizzle_migrations` so future migrations work
4. **Update the migration journal**: Ensure `drizzle/meta/_journal.json` has an entry for every `.sql` file in `drizzle/`
5. **Never leave a migration for later** — "I'll migrate after testing" is how bugs ship. The migration is part of the change, not a follow-up task
6. **For Python backend (Alembic)**: Same rule — `alembic upgrade head` must run immediately after creating a revision

**Do NOT wait for the user to report a runtime error.** An un-migrated schema change is a guaranteed crash — treat it as a blocking bug that must be fixed before moving on.

### Hard Rules

- **NEVER run DROP TABLE or DROP COLUMN without explicit user approval**
- **NEVER run TRUNCATE or bulk DELETE without backup + user approval**
- **ALWAYS verify row counts after migration** — if even 1 row is unexpectedly missing, restore immediately
- **ALWAYS run migrations immediately after schema changes** — un-migrated schemas are production crashes waiting to happen
- **Keep backups for the current session** — do not delete `.db-backups/` until user confirms
- **When in doubt, take a full backup** — a few MB of SQL dump is cheap; lost data is not
- **If restore needed: restore FIRST, investigate SECOND** — speed of recovery matters

### Recovery Cheat Sheet

```bash
# List available backups
ls -lah .db-backups/

# Restore a specific table (data only)
psql "$DATABASE_URL" < ".db-backups/users_20260206_143000.sql"

# Restore full database
psql "$DATABASE_URL" < ".db-backups/full_backup_20260206_143000.sql"

# If restore fails due to FK constraints, disable triggers temporarily
psql "$DATABASE_URL" -c "SET session_replication_role = 'replica';"
psql "$DATABASE_URL" < ".db-backups/TABLE_NAME_TIMESTAMP.sql"
psql "$DATABASE_URL" -c "SET session_replication_role = 'origin';"
```

## Encryption & Secrets Safety — MANDATORY

### Encryption Architecture

This project uses **3 encryption systems**:

| System | Algorithm | Key Source | Used By |
|--------|-----------|-----------|---------|
| Node.js `crypto.ts` | AES-256-GCM | `LLM_ENCRYPTION_KEY` → SHA-256 | Web app (all API keys, SMTP, Stripe, TOTP) |
| Python `smartspecweb_crypto.py` | AES-256-GCM | `LLM_ENCRYPTION_KEY` → SHA-256 | Python reading Node-encrypted data |
| Python `encryption.py` (Fernet) | AES-128-CBC | `ENCRYPTION_MASTER_KEY` → PBKDF2 | Python-only encrypted fields |

Node.js and `smartspecweb_crypto.py` share the same key (`LLM_ENCRYPTION_KEY`) — Python can read data encrypted by Node.

### Rules for Storing Sensitive Data

- **API keys, passwords, tokens** → Store in columns named `*Encrypted` and use `encrypt()` from `crypto.ts`
- **System settings (SMTP, Stripe, etc.)** → Store in `system_settings` table with `isSensitive: true` (auto-encrypts)
- **User passwords** → Hash with bcrypt or argon2 (NEVER encrypt, NEVER plaintext)
- **TOTP secrets** → Encrypt with `crypto.ts`
- **Recovery codes** → Hash with bcrypt
- **API keys (user-facing)** → Store SHA-256 hash only (like `opencode_api_keys.key_hash`)
- **NEVER store secret API keys in JSON columns** (like `tenants.settings`) — these are plaintext!

### Encryption Key Safety

- **`LLM_ENCRYPTION_KEY` is the master key** — if lost, ALL encrypted data in the database becomes unrecoverable
- **NEVER change `LLM_ENCRYPTION_KEY`** without re-encrypting all data first
- **Backup `.env` separately** from database backups — the backup .sql contains ciphertext that needs this key
- **Database backups (.sql) are safe** — they contain only encrypted ciphertext, not plaintext secrets
- **Exception**: `tenants.settings` JSON may contain plaintext integration keys (being migrated to encrypted storage)

### Secret Exposure Prevention — MANDATORY

**NEVER expose secrets through ANY channel.** These rules apply to all code, agents, logs, and AI interactions.

**Code rules:**
- **NEVER return decrypted secrets in API/tRPC responses** — admin endpoints must return `configured: true/false`, not the actual value
- **NEVER `console.log` / `logger.info` / `print()` secret values** — log only key names, not values
- **NEVER include `process.env` secrets in error messages** returned to clients — sanitize before sending
- **NEVER use `VITE_` prefix for server-only secrets** — `VITE_*` vars are bundled into the client JavaScript
- **NEVER pass secrets as URL query parameters** — use request headers instead
- **NEVER serialize `process.env` or `os.environ`** — only read individual named vars

**AI/LLM rules:**
- **NEVER include `.env` file contents, API keys, passwords, tokens, or encryption keys in prompts sent to LLMs** — whether via the skills engine, chat, or agent orchestration
- **NEVER pass secret values as context to AI agents** (Task tool, subagents, etc.) — pass only key names or `configured: true/false`
- **NEVER log decrypted values in audit trails** that may be sent to LLM for analysis
- If a feature requires an LLM to use an API key (e.g., function calling), pass it **server-side only** through secure headers — never embed in the prompt

**Logging rules:**
- Use structured loggers (`logger.*`) — never `print()` or `console.log` for production code
- Sanitize all error messages: strip connection strings (`postgresql://...`), file paths, token fragments
- Log `user_id` not `user.email` for PII compliance
- Mask partial tokens: never log more than 4 characters of any token/key

### When Adding New Sensitive Fields

```typescript
// CORRECT: Store encrypted in a dedicated column
apiKeyEncrypted: text("apiKeyEncrypted"),  // Use encrypt()/decrypt() from crypto.ts

// CORRECT: Store in system_settings with isSensitive flag
{ category: "integrations", key: "mailchimp_api_key", value: encrypt(apiKey), isSensitive: true }

// WRONG: Never put secrets in JSON columns
settings: json("settings").$type<{ mailchimpApiKey?: string }>()  // PLAINTEXT!
```

## Implementation Planning Protocol — MANDATORY

Complex work (multi-file changes, architecture changes, security fixes, new features) MUST follow this planning protocol. No exceptions.

### When to Create a Plan

| Situation | Plan Required? |
|-----------|---------------|
| Multi-file code changes (3+ files) | YES |
| Security vulnerability fixes | YES — detailed plan with impact analysis |
| New feature implementation | YES |
| Database schema changes | YES (also follow Database Safety Protocol) |
| Architecture/infrastructure changes | YES |
| Single-file bug fix with clear root cause | NO — follow Debugging Protocol instead |
| Comment/doc-only changes | NO |

### Plan Creation Rules

1. **Create a plan file** in `planning/` directory with descriptive name (e.g., `planning/fix-rate-limiting/plan.md`)
2. **Plan must include**: Problem statement, affected files, proposed changes, risk assessment, verification steps
3. **Plan files are permanent** — never delete them. They serve as historical record for future reference
4. **Get user approval** before implementing (use Plan Mode)

### Implementation Rules

1. **Read the plan BEFORE every implementation step** — plans may have been updated
2. **If reality differs from plan** (unexpected code structure, new dependencies, conflicts) → STOP implementation → update the plan first → get re-approval if the change is significant
3. **If you discover additional issues during implementation** → document them in the plan → address them as a separate step
4. **Mark completed steps** in the plan as you go

### Proactive Improvement Protocol

- **Always flag issues you discover** — security vulnerabilities, dead code, performance problems, missing validation
- **Present improvement ideas** when you see opportunities — don't wait to be asked
- **Follow industry standards** (OWASP, 12-factor app, semantic versioning, etc.)
- **For security issues**: Create a detailed fix plan IMMEDIATELY, assess blast radius, ensure no functional regression after fix

## AI Orchestra Agents — MANDATORY Orchestration Protocol

### Overview

SmartSpecPro uses a multi-level AI agent orchestration system for efficient parallel development. The full specification is in `planning/ai-orchestra/architecture.md`.

**This section defines MANDATORY rules.** Inconsistent agent usage degrades quality. Follow these rules every time.

### Rule 1: MANDATORY Agent Dispatch — When Agents Are REQUIRED

You MUST spawn specialized agents for these task types. Do NOT handle them directly.

| Task Type | Mandatory? | Required Agents | Why |
|---|---|---|---|
| **Security audit / vulnerability scan** | **ALWAYS** | CMD-6 (backend-security-coder) per domain | Security needs specialized focus |
| **Multi-file bug** (3+ files, unclear cause) | **ALWAYS** | CMD-7 (error-debugging:debugger) first | Prevent shotgun debugging |
| **New feature** (touches frontend + backend) | **ALWAYS** | Parallel: CMD-1 + CMD-2 analysis → implementation | Ensures cross-layer consistency |
| **Database schema changes** | **ALWAYS** | CMD-4 (Explore) for analysis, then direct implementation | Schema design needs holistic view |
| **Performance investigation** | **ALWAYS** | CMD-7 + relevant domain agents | Need data before optimization |
| **Accessibility audit** | **ALWAYS** | ui-design:accessibility-expert | Specialized WCAG knowledge |
| **Python backend changes** | **ALWAYS** | CMD-3 (python-development:fastapi-pro) | Python expertise + style conventions |
| Single-file fix (clear root cause) | Optional | Handle directly, spawn if complex | Simple fixes don't need agents |
| Documentation-only changes | Never | Handle directly | No agent needed |

### Rule 2: MANDATORY Prompt Structure — Every Agent Gets a Complete Brief

**NEVER send a vague prompt.** Every agent Task prompt MUST include ALL of these sections:

```
TASK: [Specific action — what to do, not what to "look at"]
DOMAIN: [Which commander area: CMD-1 through CMD-8]
FILES: [Exact file paths to read/modify — be specific]
CONTEXT: [What happened before, what the user reported, relevant error messages]
CONSTRAINTS: [What NOT to touch, max scope, coding conventions to follow]
OUTPUT: [Exact deliverable — "modify file X to add Y" or "return analysis of Z"]
```

**Example — BAD (vague, agent won't know what to do):**
```
"Check the frontend for issues"
```

**Example — GOOD (specific, actionable, complete):**
```
TASK: Audit SchedulePanel.tsx for React anti-patterns and missing error handling.
DOMAIN: CMD-1 Frontend
FILES: apps/web/client/src/components/chat/SchedulePanel.tsx (1336 lines)
CONTEXT: User reported UI inconsistencies. Calendar view was recently added.
CONSTRAINTS: Do NOT modify code. Return analysis only with line numbers.
OUTPUT: List of issues found with severity (HIGH/MEDIUM/LOW), affected line numbers, and recommended fix for each.
```

### Rule 3: MANDATORY Result Validation

After EVERY agent completes, the Conductor (main instance) MUST:

1. **Read the agent's output** — Never ignore or skip agent results
2. **Verify actionable items** — If agent found issues, create a TodoWrite list
3. **Cross-check conflicts** — If multiple agents ran in parallel, check their outputs don't conflict
4. **Apply fixes immediately** — Don't defer. If an agent reports a vulnerability, fix it NOW
5. **Report to user** — Summarize what each agent found, what was fixed, what remains

**If an agent returns empty/unhelpful results:**
- Check if the prompt was too vague → re-spawn with better prompt
- Check if the agent type was wrong → try a different subagent_type
- If still empty after 2 attempts → handle directly and note why agent failed

### Rule 4: MANDATORY Parallel Dispatch — Maximize Concurrency

When dispatching multiple agents, ALWAYS send them in a SINGLE message with multiple Task tool calls. Never dispatch agents one-by-one when they're independent.

**BAD (sequential, slow):**
```
Message 1: Task(CMD-1 analysis) → wait for result
Message 2: Task(CMD-2 analysis) → wait for result
Message 3: Task(CMD-6 security) → wait for result
```

**GOOD (parallel, fast):**
```
Message 1: Task(CMD-1 analysis) + Task(CMD-2 analysis) + Task(CMD-6 security) → all run simultaneously
```

### Rule 5: Agent Type Selection Matrix

Use the CORRECT agent type for each task. Wrong agent type = poor results.

| Task | subagent_type | Description prefix |
|------|---------------|-------------------|
| **Frontend analysis** (read-only) | `Explore` | "CMD-1: Analyze..." |
| **Frontend implementation** (write code) | `multi-platform-apps:frontend-developer` | "CMD-1: Build/Fix..." |
| **Backend analysis** (read-only) | `Explore` | "CMD-2: Analyze..." |
| **Backend implementation** (write code) | `multi-platform-apps:backend-architect` | "CMD-2: Build/Fix..." |
| **Backend security audit** | `backend-api-security:backend-security-coder` | "CMD-6: Audit..." |
| **Backend security fix** (write code) | `backend-api-security:backend-security-coder` | "CMD-6: Fix..." |
| **Python analysis** | `Explore` | "CMD-3: Analyze..." |
| **Python implementation** | `python-development:fastapi-pro` | "CMD-3: Build/Fix..." |
| **Database/schema analysis** | `Explore` | "CMD-4: Analyze..." |
| **Infrastructure analysis** | `Explore` | "CMD-5: Analyze..." |
| **Bug debugging** | `error-debugging:debugger` | "CMD-7: Debug..." |
| **Error log analysis** | `error-debugging:error-detective` | "CMD-7: Investigate..." |
| **Accessibility audit** | `ui-design:accessibility-expert` | "CMD-1/A11Y: Audit..." |
| **UI design review** | `ui-design:ui-designer` | "CMD-1/UI: Review..." |
| **General research** | `general-purpose` | "Research: ..." |

### Rule 6: Orchestration Patterns (MUST follow for each task type)

**Pattern A: Security Audit** (user says "ตรวจสอบช่องโหว่" / "check vulnerabilities")
```
Step 1: Spawn 3-4 agents IN PARALLEL:
  - backend-security-coder → audit backend endpoints
  - backend-security-coder → audit Python backend
  - Explore → audit frontend (XSS, auth bypass, data exposure)
  - Explore → audit database (indexes, encrypted columns, access patterns)
Step 2: Collect all findings, deduplicate, prioritize by severity
Step 3: Spawn fix agents IN PARALLEL (group by file to avoid conflicts):
  - backend-security-coder → fix backend vulnerabilities
  - backend-security-coder → fix Python vulnerabilities
  - frontend-developer → fix frontend vulnerabilities
Step 4: TypeScript check + verify fixes
Step 5: Report all changes to user
```

**Pattern B: Bug Fix** (user reports a specific bug)
```
Step 1: Spawn error-debugging:debugger → identify root cause
Step 2: Based on root cause, spawn appropriate Domain Commander to fix
Step 3: Verify fix (run affected test or typecheck)
```

**Pattern C: New Feature** (user requests a new capability)
```
Step 1: Enter Plan Mode
Step 2: Spawn parallel analysis agents (Explore type) for affected domains
Step 3: Synthesize into implementation plan → get user approval
Step 4: Spawn parallel implementation agents (domain-specific types)
Step 5: TypeScript check + tests
Step 6: Security review of new endpoints (if any)
```

**Pattern D: Refactoring** (user wants to restructure code)
```
Step 1: Spawn Explore agents to analyze current structure + dependencies
Step 2: Create refactoring plan → get user approval
Step 3: Implement in dependency order (schema → service → router → UI)
Step 4: Run full test suite
```

### Rule 7: Failure Recovery

| Situation | Action |
|---|---|
| Agent returns empty result | Re-spawn with more specific prompt (add file paths, line numbers) |
| Agent makes wrong changes | Revert changes, re-spawn with corrected constraints |
| Agent conflicts with another agent | Resolve conflict manually, then re-run affected agent |
| Agent times out | Check if task was too large, break into smaller sub-tasks |
| Same error after 3 agent attempts | STOP, ask user for guidance |

### Domain Commanders Reference

| ID | Name | Domain | Key Files |
|----|------|--------|-----------|
| CMD-1 | Frontend Architect | React, UI, Video Editor, Routing | `apps/web/client/src/`, `packages/ui/` |
| CMD-2 | Backend Architect | tRPC, Express, Auth, Services | `apps/web/server/`, `shared/` |
| CMD-3 | Python Engineer | FastAPI, Celery, LLM Gateway | `python-backend/app/` |
| CMD-4 | Database Architect | Schema, Migrations, Queries | `drizzle/schema.ts`, `models/` |
| CMD-5 | Infrastructure Engineer | Docker, Nginx, Deploy | `docker-compose*.yml`, `nginx/` |
| CMD-6 | Security Auditor | Auth, Encryption, Validation | `crypto.ts`, middleware, `security.ts` |
| CMD-7 | Debug Detective | Root Cause Analysis, Tracing | All source + `logs/audit/` |
| CMD-8 | Quality Assurance | Testing, Coverage, Types | `*.test.ts`, `tests/`, tsconfig |

### Parallel Execution Rules

**Parallelize (safe):**
- Independent module analysis (different directories)
- Read-only exploration of different subsystems
- Tests that don't share state
- Creating components in different directories

**Serialize (required):**
- Database migrations (always sequential)
- Dependent file changes (schema → service → router)
- Git operations (stage → commit → push)
- Same-file modifications

**Limits:**
- Max 4 parallel agents
- Max 2 agents editing files simultaneously
- Only 1 agent for DB operations
- Only 1 agent for git operations

### System Map (for agent context)

```
                              ┌─────────────┐
                              │   Nginx      │ :80/:443
                              │ (SSL, proxy) │
                              └──────┬───────┘
                      ┌──────────────┼──────────────┐
                      ▼              ▼               ▼
               ┌─────────────┐ ┌──────────┐ ┌──────────────┐
               │ SmartSpec    │ │ Python   │ │ Control      │
               │ Web :3000    │ │ Backend  │ │ Plane :7070  │
               │ React+tRPC  │ │ :8000    │ │ (Fastify)    │
               └──────┬───────┘ └────┬─────┘ └──────────────┘
                      │              │
                      ▼              ▼
               ┌─────────────┐ ┌──────────┐
               │ PostgreSQL  │ │  Redis   │
               │    :5432    │ │  :6379   │
               └─────────────┘ └────┬─────┘
                                    │
                              ┌─────┴─────┐
                              │  Celery    │
                              │  Workers   │
                              │ media+video│
                              └────────────┘
```

**Data Flow:**
- Client → Nginx → Web (tRPC/Express) → PostgreSQL/Redis
- Web → Python Backend → LLM Providers / Media APIs
- Web → Redis → Celery Workers → FFmpeg / External APIs
- Control Plane → PostgreSQL (sessions, tasks, artifacts)

## Git Conventions

- Commit messages: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `test:`
- Branch from `main`, PR back to `main`
- Never commit secrets, backups (*.sql), or tmp-workspace directories
