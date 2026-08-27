# Review Findings

Two clean targeted review passes completed.

## Pass 1: behavior and security

- Reply uploads accept multiple images, cap each request at five files, and
  server-side `addComment` binds only same-ticket, current-uploader, unlinked
  image attachments.
- Admin and owner close permissions are tenant/ownership scoped. Closed tickets
  reject replies and uploads, and non-closed status changes cannot reopen them.
- User detail and attachment retrieval exclude attachments linked to internal
  comments, while admin detail retains them. The managed-storage authorization
  boundary also blocks direct reads of internal-note media for ticket owners.
- Read ordering and overdue calculations exclude closed tickets after review
  found that closed rows could otherwise display as unread.

## Pass 2: UI and delivery

- Ticket and reply images use the authenticated media component, visible 120px
  previews, multi-image reply galleries, focus states, keyboard ticket selection,
  and a viewport-sized viewer with close and arrow navigation.
- Focused tests pass: 6 tests across media and auto-close; router tenant-scope
  suite passes 9 tests. Prettier and `git diff --check` pass.
- Full web typecheck still reports unrelated pre-existing baseline errors in
  vertical-drama schema consumers, `server/db.ts`, and
  `shared/comfyControlContracts.ts`; no changed Feedback Hub paths appeared in
  the filtered output.
- Live authenticated browser and database migration/deployment checks remain
  release-gated and are documented in `orchestra/ui-browser-evidence.md`.
- Astryx discovery was attempted but the repository does not contain the
  referenced CLI module (`@astryxdesign/cli/bin/astryx.mjs`); existing shadcn
  components and local Tailwind conventions were retained.
