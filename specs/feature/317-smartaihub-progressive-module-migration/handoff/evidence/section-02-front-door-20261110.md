# Section 02 — Chat-first login Shell evidence

- Source: `smartaihub-platform@6c1b97a65f860ba5d9dadb06e188fa53316efbdb`
- Profile: `package`; checked 2026-11-10.
- `pnpm run test:shell` — PASS, 3 tests. Includes successful sign-in routing to Chat and `/dashboard` resolving to Chat.
- `pnpm run typecheck:shell` — PASS.
- `pnpm run build:shell` — PASS; filtered Shell + contracts build only.
- Local Playwright checked six viewport sizes (360×800 through 1440×900). All login flows routed to `/chat`, with no horizontal overflow or JavaScript errors. Core/Auth responses were mocked.
- Screenshot evidence: `section-02-browser-20261110/login-desktop-1440x900.png`, `login-tablet-768x1024.png`, and `login-mobile-390x844.png`.

This does not prove a real existing canonical account can sign in to the hosted `aimarkethubs.com` target. No account was created/reset, and no host traffic was changed.
