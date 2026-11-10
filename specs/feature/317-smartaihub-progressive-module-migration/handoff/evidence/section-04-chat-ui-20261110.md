# Section 04 — Independently built Chat UI evidence

- Source: `smartaihub-platform@6c1b97a65f860ba5d9dadb06e188fa53316efbdb`
- Profile: `package`; checked 2026-11-10.
- `pnpm run test:chat` — PASS, 24 tests; `pnpm run typecheck:chat` — PASS; `pnpm run build:chat` — PASS for Chat plus the small contracts dependency only.
- Chat UI includes conversation/history, composer, typed response blocks, and artifact preview surfaces. It displays unavailable state instead of invented messages/results; sending stays disabled while provider and persistence are not ready.
- Local Playwright checked six viewport sizes and confirmed `/chat`, no horizontal overflow or JavaScript errors, and responsive history/artifact panels. Core/Auth/Chat responses were mocked.
- Current Chat output: JS 222.40 kB / 69.24 kB gzip; CSS 3.14 kB / 0.91 kB gzip; Worker dry-run 56.20 KiB / 13.59 KiB gzip.
- Screenshot evidence: `section-05-browser-20261110/smartaihub-chat-small-mobile.png` and `smartaihub-chat-desktop.png`.

These checks prove the local UI/module behavior only. They do not establish real-account login, persisted conversations, live provider streaming, hosted target health, or human acceptance.
