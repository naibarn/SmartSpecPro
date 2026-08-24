# Research Notes

- `Privacy.tsx` and `Terms.tsx` are standalone hard-coded English pages with markdown-like
  markers rendered as plain text.
- `useScopedTranslation` exposes the active `en`/`th` locale without requiring a new namespace.
- `/contact` uses `publicSite` translations and publishes `smartaihubapp@gmail.com`, Line,
  Nakhon Ratchasima, Thailand, and a 24-hour business-day response target.
- The worktree has broad unrelated dirty changes, including Contact and i18n files; the owned
  implementation set must remain limited to the legal content/pages/tests and planning artifacts.
- The official PDPC GPPC Privacy Notice example emphasizes controller identity, purposes,
  data categories, processing bases, retention, rights, and contact details.
- No database, auth, tenant boundary, or server API changes are required.
