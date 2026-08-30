# Research Notes

## Repository findings

- SocratiCode MCP tools were unavailable; discovery used targeted `rg`/`sed`.
- `apps/web/server/_core/trpc.ts` already exposes `adminProcedure`.
- `apps/web/server/routers.ts` is the app router registry.
- BullMQ jobs are initialized from `apps/web/server/_core/index.ts`; Redis helper is `services/redis.ts`.
- Existing Express downloads stream local files and use session-authenticated route patterns.
- `adm-zip` is already a dependency and used by server services.
- `RequireAdmin` guards `/admin/*`; admin navigation is resolved by shared menu definitions through `useMenuItems.ts`.
- Existing migration journal reaches tag `0240_vertical_drama_draft_series_link`; worktree has unrelated untracked migration files, so the new migration must be explicit and scoped.
- Worktree is heavily dirty with unrelated generated/runtime/media changes; preserve all unrelated paths.

## Risk scan

- Backup contains highly sensitive data, especially `full` application export and PostgreSQL dump.
- Download path must never be client-controlled; use artifact enum, job lookup, realpath containment and expiry.
- `pg_dump` availability is a deployment prerequisite and cannot be proven by unit tests alone.
- Local filesystem storage is acceptable for the first version but has a multi-instance limitation; document as residual risk.
- Dynamic table export must quote catalog-derived identifiers and redact by explicit field policy.
- PostgreSQL client supports cursor batches; use it so application export does not buffer an entire table in memory.

## Relevant commands/patterns

- Node tests: `cd apps/web && pnpm test <paths> --run`
- Typecheck: `cd apps/web && pnpm typecheck` if available; baseline-wide failures must be separated
- UI browser evidence follows `skills/orchestra/references/ui-browser-verification.md`.
