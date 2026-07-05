# DB Schema Single-Writer Discipline

Read this whenever a task may change any database schema or migration. Applies to
**all hosts** (Claude Code, Codex, OpenCode) — it is host-agnostic good practice.

This repository has **three** independent schema surfaces. Treat each as a
single-writer resource:

| ORM     | Schema file                        | Migrations                       |
|---------|------------------------------------|----------------------------------|
| Prisma  | `control-plane/prisma/schema.prisma` | Prisma migrate output            |
| Drizzle | `apps/web/drizzle/schema.ts`         | `apps/web/drizzle/*.sql`         |
| Alembic | `python-backend/app` models          | `python-backend/migrations/*.py` |

## Rules

1. **Single writer per surface.** Only the conductor changes a schema/migration,
   and only serially. Never place two schema-touching tasks in the same wave, and
   never let a sub-agent edit a schema file.
2. **Serialize before fan-out.** If a task needs schema changes, the conductor
   makes ALL of them in one sequential step and runs the migration + client
   regeneration to completion (`prisma generate`, `drizzle-kit generate`, alembic
   `upgrade head`) BEFORE dispatching any parallel implementation wave that depends
   on the new fields.
3. **Sub-agents escalate, never edit.** A dispatched agent that discovers it needs
   a schema change stops and returns `NEEDS_SCHEMA_CHANGE: <one-line description>`
   in its Result Report. The conductor batches these and applies them serially.
4. **Cross-ORM consistency.** A conceptual model change (e.g. a new column used by
   both the web app and the Python backend) may touch two surfaces. The conductor
   edits each surface itself, one at a time, and records the mapping in
   `orchestra/decisions.md`.

## Wave marker lifecycle (enforced by the hook)

The `.claude/hooks/schema-single-writer.sh` PreToolUse hook hard-blocks schema
edits while a wave is active. To keep the hook and the workflow in sync:

- **Before dispatching an implementation wave:** `touch orchestra/.wave-active`.
- **After integrating and closing the wave:** `rm -f orchestra/.wave-active`.
- Do schema/migration edits only while `orchestra/.wave-active` does NOT exist.

This makes the invariant mechanical: if a wave is running, the schema is locked;
schema work happens only in the serial gaps between waves.

## Wave-planning integration

In `references/wave-planning.md`, when assigning tasks to waves, additionally
verify: no wave contains a schema/migration edit, and any schema change required
by the plan is scheduled as a conductor-owned serial step between waves. Record the
schema step explicitly in `orchestra/plan.md`.
