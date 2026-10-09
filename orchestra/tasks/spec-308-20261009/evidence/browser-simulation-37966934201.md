# SPEC-308 isolated browser simulation

- Exact source SHA checked out by CI: `214f3d04c8b615609d6da3c18444357fd1d5a363` (PR #399 head at run time).
- Workflow run: [37966934201](https://github.com/naibarn/SmartSpecPro/actions/runs/37966934201), conclusion `SUCCESS`.
- Result: 12 Playwright tests passed with one Chromium worker.
- Environment: UI-only Vite server, deterministic mock authenticated identity and tenant, mocked API responses, no production secrets or backend session.
- This is simulated evidence only; it does not establish live authenticated acceptance, runtime tenant isolation, production behavior, or deployment approval.

## Coverage in this run

1. Authenticated Chat & Feedback launcher, dialog tabs, draft retention, and reduced-motion CSS behavior.
2. Tenant flag rollback while the dialog stays open: Chat/Feedback drafts and submit action remain, Task Control remains available, and no chat create/send, feedback submit, or notification-read mutation is issued. The legacy launcher is checked after closing the modal because modal focus isolation removes its trigger from the accessibility tree while open.
3. No horizontal overflow at 320, 360, 390, 767, 768, and 1440 CSS pixels. Full-page screenshots are committed beside this note.
4. Bell event animation and the existing Bell action.
5. Five settings choices, local appearance persistence, and distinct tenant-scoped storage keys.
6. Balloon dismiss has no tRPC/read side effect; balloon CTA opens the existing notification Bell.

## Responsive screenshots

- `screenshots/320x-authenticated-ci-simulation.png`
- `screenshots/360x-authenticated-ci-simulation.png`
- `screenshots/390x-authenticated-ci-simulation.png`
- `screenshots/767x-authenticated-ci-simulation.png`
- `screenshots/768x-authenticated-ci-simulation.png`
- `screenshots/1440x-authenticated-ci-simulation.png`

All SPEC-308 ledger requirements remain `OPEN`. This run adds evidence to specific rows but does not close them: remaining gaps include live runtime/identity authority, tenant boundary acceptance, other routes and interaction states, accessibility, performance measurements, and independent QA receipts.
