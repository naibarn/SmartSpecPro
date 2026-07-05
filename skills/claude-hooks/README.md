# Claude Code-only hook installers

This folder holds installers for **Claude Code project-level hooks** (things wired
through `.claude/settings.json`'s `hooks` key, e.g. `PreToolUse`) plus any
Claude-only settings changes that go with them (e.g. pinning `model` in
`.claude/settings.local.json`). Codex has no equivalent mechanism, so nothing here
is meant to run there.

## Why this is a separate top-level folder, not inside a skill package

- This directory is **intentionally not listed in `skills/mirrored-skills.txt`**.
  Every Codex publish/sync/verify path (`runtime_sync.py`) and the Claude
  `.claude/skills/` symlinking path (`portable_install.py install-claude-skills`)
  enumerate skills strictly from that manifest — an unlisted folder is simply
  invisible to all of them. That's the whole isolation mechanism; no code changes
  to the sync tooling are needed or expected.
- Do **not** move a hook installer like this into a skill's own folder (e.g.
  `skills/orchestra/`) instead. For a flat (non-package-style) skill,
  `materialize_repo_runtime()` in both `portable_install.py` and `runtime_sync.py`
  does a verbatim full-directory copy to the Codex runtime — there is no
  allowlist/denylist to exclude a subfolder. Anything placed inside a manifest
  skill's directory ships to Codex whether it makes sense there or not.
- If a skill ever becomes "package-style" (nested
  `skills/<name>/skills/<name>/SKILL.md`), be aware `PACKAGE_RUNTIME_DIRS` in
  `portable_install.py` / `runtime_sync.py` explicitly copies a top-level `hooks/`
  dir under that skill to the Codex runtime too. Don't use that `hooks/` dir for
  Claude-only content either — keep it here instead.
- `skills/audit-skills.sh` still walks the **entire** `skills/` tree (not just
  manifest entries) for two checks, so this folder is not entirely unsupervised:
  - Never name a file `SKILL.md` anywhere under this tree — the audit validates
    frontmatter/body length on any file with that name, manifest or not.
  - The audit's forbidden-project-name text scan also covers this whole tree.
    Keep installer scripts, docs, and hook comments free of the host project's
    name — refer to "this repo" / "the target repo" generically instead.

## Layout

```
claude-hooks/
  <hook-name>/
    install.sh                       # entry point: bash install.sh [/path/to/repo] [--verify]
    lib/apply_edits.py               # idempotent settings/SKILL.md patcher, if needed
    payload/.claude/hooks/<hook>.sh  # the hook script itself, copied into the target repo
```

Each hook gets its own subfolder named after what the hook does (not after
whatever installer batch introduced it).

## `schema-single-writer/`

Installs a `PreToolUse` hook that blocks edits to this repo's schema/migration
files (Prisma / Drizzle / Alembic) while a parallel agent dispatch wave is active,
plus pins `.claude/settings.local.json`'s `model` to `opus`, plus wires the
`orchestra/.wave-active` lock protocol into `skills/orchestra/SKILL.md`.

```bash
bash skills/claude-hooks/schema-single-writer/install.sh          # install into the current repo
bash skills/claude-hooks/schema-single-writer/install.sh /path/to/repo
bash skills/claude-hooks/schema-single-writer/install.sh --verify # check only, change nothing
```

Idempotent and safe to re-run; every file it edits gets a `<file>.bak.<timestamp>`
backup alongside it first. It refuses to run against a repo that doesn't have
`skills/orchestra/SKILL.md`, to avoid installing in the wrong place.

The hook itself hardcodes this repo's current schema/migration paths
(`control-plane/prisma/schema.prisma`, `apps/web/drizzle/schema.ts` /
`apps/web/drizzle/*.sql`, `python-backend/migrations/*.py`). Installing this into
a repo with a different stack or layout requires editing the `case` statement in
`payload/.claude/hooks/schema-single-writer.sh` to match that repo's actual
schema/migration file locations — it is not auto-detected.

### Keeping the payload in sync

`payload/.claude/hooks/schema-single-writer.sh` here is the portable template.
This repo's own live copy lives at `.claude/hooks/schema-single-writer.sh` (a
plain installed file, not a symlink — same convention as generated
`.claude/agents/ssp-*.md` files). If you edit the live hook to fix a bug or add a
schema surface, copy the change back into this payload path so future installs
elsewhere pick it up too.

### When to use `install.sh` vs. just copying `skills/orchestra/`

- If the target repo already has an up-to-date `skills/orchestra/` (e.g. it's a
  fresh copy of this same portable pack), you only need the hook + settings
  wiring — running `install.sh` there is what you want.
- If the target repo has an older/divergent `skills/orchestra/SKILL.md`,
  `lib/apply_edits.py`'s text-anchor patches may not find their anchors and will
  warn instead of guessing — it never overwrites blindly. In that case, apply the
  `SKILL.md` wiring by hand using `skills/orchestra/references/schema-single-writer.md`
  and `references/rate-limit-safety.md` as the reference for what the finished
  result should look like.
