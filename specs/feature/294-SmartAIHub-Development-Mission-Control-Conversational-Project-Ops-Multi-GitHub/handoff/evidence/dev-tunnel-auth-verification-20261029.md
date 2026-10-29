# Development tunnel authenticated verification boundary

Date: 2026-10-29 (Asia/Bangkok)

Observed checkout/runtime source: `f4fb4a75d2cc634c9bc1e139d14948eb0ac00a72`.

## Observations

- `smartspec-dev-web.service` restarted through the repository's supported
  `dev:web:restart` command and reported a healthy development origin at
  checkout `f4fb4a75d2cc634c9bc1e139d14948eb0ac00a72`.
- The `aimarkethubs.com` development tunnel served all three fresh `/login`
  loads with HTTP 200, all three Home-to-Login SPA/back-forward scenarios, the
  development tenant and its branding assets. Anonymous protected diagnostics
  correctly returned 403.
- The repository's authenticated browser verifier stopped at Admin login with
  HTTP 401. Read-only comparison confirmed the configured verifier account
  exists in the development database, is an enabled Admin, and the password in
  `~/.config/smartspec-dev/admin-login.txt` does not match its stored password
  hash. No password, hash, or account identifier is retained in this evidence.

## Next action

The development owner should refresh `~/.config/smartspec-dev/admin-login.txt`
with the current development Admin password (or reset that development account
through its existing recovery flow), then rerun `pnpm run dev:web:verify` and
the authenticated Task Control/Chat browser acceptance. No production or
application password was changed.

This local verifier credential mismatch does not explain the earlier hosted
`chat.getMessages` 500; the hosted endpoint's server-side cause remains
unverified.
