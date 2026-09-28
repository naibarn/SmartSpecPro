# Decision Log

## Depth

`standard` quick plan: the work spans two UI surfaces plus one server/data
boundary, but reuses existing mutations and needs no schema migration.

## Decisions

- Prefer a visible Admin action in Media History gallery cards over relying on a
  dropdown that users cannot discover.
- Keep the existing durable import pipeline rather than sending provider URLs
  directly to public Gallery.
- Keep delete database-only and tenant-scoped; storage cleanup is a separate
  lifecycle concern.
- Make the delete affordance usable for broken previews without adding
  automatic destructive URL probing.

## Review status

Self-review checklist: scope, permission boundary, tenant isolation, broken-link
behavior, localization, focused tests, and dirty-worktree preservation are all
covered by the plan and section files.
