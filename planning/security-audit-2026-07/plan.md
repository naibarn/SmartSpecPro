# Security Audit Remediation — 2026-07-05

Source: full-repo security audit (this session). Findings prioritized Critical → Low.

## Status legend
- [ ] todo  · [~] in progress · [x] done · [!] requires user action (destructive/outward-facing)

## Critical
- [~] **C1** `python-backend/app/api/v1/skills.py` — unauth + path traversal via `workspace`. Add auth dep + sandbox `workspace` to an allow-listed root. (Python agent)
- [~] **C2** `python-backend/app/api/v1/auth_generator.py` — unauth arbitrary file write via `output_dir` + `npx` subprocess. Add auth + per-user temp sandbox. (Python agent)
- [!] **C3** PUBLIC repo + JWT/TLS private keys in git history. Keys already rotated (current keys not in history). REQUIRES USER: (1) confirm/flip repo visibility, (2) purge history (git filter-repo) + force-push, (3) invalidate old JWT-signed tokens / confirm old key untrusted, (4) rotate TLS pair if deployed.

## High
- [~] **H1** `python-backend/app/api/internal_provider.py` — returns decrypted provider keys. Return masked/`configured` or proxy server-side. (Python agent)
- [~] **H2** `apps/web/server/routers/users.ts:transferCredits` — no transaction/idempotency. Wrap in db.transaction + idempotencyKey. (Node agent)
- [ ] **H3** dep: `@babel/core` GHSA-4x5r-pxfx-6jf8 (arbitrary file read). Bump. (deps pass)

## Medium
- [~] **M1** `python-backend/app/api/virtual_admin.py` — no app-layer auth (nginx-blocked, defense-in-depth). Add localhost/token auth. (Python agent)
- [ ] **M2** `apps/web/server/routers/media.ts` — check-then-spend race on synchronous generate paths. Reserve-then-reconcile. DEFERRED: touches multiple live money paths; needs dedicated pass + tests.
- [~] **M3** `media_jobs.py` / `orchestrator.py` — auth fail-open when token env unset. Fail closed. (Python agent)
- [~] **M4** `apps/web/server/_core/trpc.ts` — `domainAdminProcedure` no auto tenant-scope. DEFERRED: architectural refactor across ~18 routers; safe today. Track separately.
- [x] **M5** `tmp/db-backups/*.sql` tracked + `tmp/` not ignored. git rm --cached + gitignore. (inline)
- [~] **M6** `python-backend/app/api/telegram_webhook.py` — bot token may leak via `print(e)`. Use logger + sanitize. (Python agent)
- [ ] **M7** deps: `python-multipart==0.0.6`, `aiohttp==3.9.1`, `cryptography==42.0.0`. Bump + `pip-audit` in CI. (deps pass)

## Low
- [~] **L1** `python-backend/app/api/v1/health.py` `/health/database` unauth. Add superuser dep. (Python agent)
- [ ] **L2** `apps/web/server/routers/adminOps.ts:dailyLlmUsage` — sql.raw manual escape → parameterize with inArray. (Node agent)
- [ ] **L3** `publicMediaApi.ts` pay-after-spend. DEFERRED with M2.
- [ ] **L4** `ssrfValidation.ts` DNS-rebind TOCTOU. Pin validated IP. DEFERRED (needs agent HTTP change).
- [ ] **L5** `skills.ts:loadSkillInputDefaults` path containment (defense-in-depth). (Node agent, optional)
- [ ] **L9** delete dead `llm_openai_compat.py`/`routes.py`; resolve dual lockfile in apps/web. (deps pass)

## Verification
- Python: `cd python-backend && ruff check app/ && pytest -q` on touched modules.
- Node: `cd apps/web && pnpm check` (tsc) + targeted vitest for credit/admin routers.
- Do NOT push; hold for user review (C3 privacy decision pending).
