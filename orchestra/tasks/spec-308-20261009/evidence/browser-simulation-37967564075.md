# SPEC-308 integrated-base browser simulation

- Canonical base at run time: `origin/main` `338adeb0605d160081a2ee995d0f639ad3850d9a`.
- Exact PR #399 source SHA checked out by CI: `6146063781ac3fb2b060e48b4892fdc870d000d2`.
- Workflow run: [37967564075](https://github.com/naibarn/SmartSpecPro/actions/runs/37967564075), conclusion `SUCCESS`.
- Result: 12 Playwright tests passed using one Chromium worker. Dependency installation, generated schema build, Chromium install, and UI-only Vite startup also passed.
- Environment: deterministic mock identity/tenant, mocked API responses and loopback Vite UI. No production secret or backend session was used.
- This is simulated evidence only. It does not establish live authenticated acceptance, server-side tenant authorization, production behavior, or deployment approval.

## Coverage

- Authenticated mock Chat/Feedback launcher, dialog tabs and draft preservation.
- Tenant flag rollback while Chat/Feedback remain open; drafts, submit action and Task Control remain available, and no chat create/send, feedback submit, or notification-read mutation occurs. Legacy launcher is checked after modal close because the open modal hides its trigger from the accessibility tree.
- No horizontal overflow at 320, 360, 390, 767, 768 and 1440 CSS pixels.
- Bell event animation and existing Bell action.
- Five Settings choices, tenant-scoped local appearance storage, balloon dismiss with no tRPC/read call, and balloon CTA to the existing Bell.

Six full-page responsive screenshots are stored beside this note as `screenshots/*-authenticated-ci-simulation.png`. Requirement mapping was updated for only covered rows; all 66 canonical requirements remain `OPEN` / `UNVERIFIED` because substantial acceptance, accessibility, performance, cross-route and live-runtime evidence is still missing.
