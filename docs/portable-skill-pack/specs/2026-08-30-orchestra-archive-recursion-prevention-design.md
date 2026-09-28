# Orchestra Archive Recursion Prevention

## Problem

The Orchestra lifecycle currently describes moving the live `orchestra/` directory
to `orchestra/archive/<timestamp>/`. That destination is inside the source tree.
Implementations that copy or package the tree can therefore recurse through
`archive/`, producing deeply nested duplicate archives and filling `/tmp`.

## Approved Scope

- Add one project-local archive utility with fail-closed path and concurrency guards.
- Store archived sessions in a sibling `.orchestra-archive/<UTC timestamp>/` directory.
- Update the project and installed Orchestra instructions to use the utility.
- Add regression tests for self-nesting, symlinks, collisions, timestamp traversal,
  and successful sibling archival.
- Do not delete or rewrite existing persistent backups or the active `orchestra/`
  session as part of this change.

## Design

`ops/orchestra-archive/orchestra-archive-safe.sh` accepts a source directory,
an archive-root, and an optional UTC timestamp. It resolves existing path
components with `realpath`, rejects a source symlink, rejects an archive root
inside the source, requires the archive root to be the source's sibling
`.orchestra-archive`, validates the timestamp, and refuses an existing target.
It takes a non-blocking `flock` on a sibling lock file, creates the archive root,
then performs one same-filesystem `mv`. No tar stream, recursive copy, or
temporary staging file is created.

The lifecycle instructions will archive with:

```bash
ops/orchestra-archive/orchestra-archive-safe.sh \
  --source "$(pwd -P)/orchestra" \
  --archive-root "$(pwd -P)/.orchestra-archive"
mkdir -p "$(pwd -P)/orchestra"
```

If validation fails, the utility exits without changing the source tree. This
preserves recovery data and makes an unsafe lifecycle transition visible rather
than silently generating more duplicate data.

## Alternatives and Trade-offs

1. **Sibling atomic move (chosen):** minimal I/O and no temporary archive payload;
   it preserves all existing session files and makes self-nesting impossible.
2. **Tar archive outside the source:** supports one-file transport, but requires
   enough destination space and can recreate the `/tmp` pressure seen here.
3. **Keep `orchestra/archive/` with exclusions:** retains the old layout, but
   every caller must correctly implement exclusion rules and can regress when new
   copy/pack code is added.

## Acceptance Criteria

- A destination under the source is rejected without modifying the source.
- A sibling archive succeeds and preserves file contents.
- Existing destinations, symlink roots, invalid timestamps, and concurrent runs
  are rejected without overwrite.
- The updated instructions contain no fresh-start command that places the
  archive under `orchestra/`.
- Focused shell tests pass and `/tmp` remains writable after the change.

## Operational Notes

The existing nested archive and database backups remain untouched. They require a
separate retention decision because some are rollback artifacts. The existing
systemd temporary cleanup remains responsible for allowlisted temporary prefixes;
this change prevents the archive producer from creating a new recursive payload.
