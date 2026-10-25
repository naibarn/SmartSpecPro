# Section 05 — Materialize Buildable V1 Source

- **Requirement IDs:** V1-Baseline, V1-Source
- **Objective:** Convert the exact retained V1 structured source into a standalone, independently buildable project in its existing dedicated GitHub repository without LLM regeneration.
- **Owned paths:** Existing App repository `pruksacharttk/smartaihub-app-e6f0be051fd22e09bc4c5dff`; generated project files only.
- **Prerequisites:** Owner-confirmed V1 acceptance and exact source/artifact digests; preserve V1 deployment row and data.
- **Deliverables:** Static source tree, zero-runtime-dependency build, app-scoped storage compatibility adapter, source provenance and immutable Git revision.
- **Verification:** `npm run build`; focused Playwright checks for income/expense, summary/chart, reload, import/export, retained seed data and mobile viewport.
- **Completion predicate:** Build succeeds from retained V1 source, all V1 actions remain equivalent, and GitHub read-back digests match the committed files.
- **Evidence:** Existing V1 snapshot/artifact pins, materialized Git SHA, source-tree/artifact digests, Playwright screenshots and result summary.

## Verified outcome

- V1 remains production deployment version 1 for App `app_e6f0be051fd22e09bc4c5dff`; owner `23`, tenant `tenant-ZCSKEM9s`, migration `OWNER_CONFIRMED` (0 imported, 2 preserved).
- Immutable V1 ledger: DevelopmentRun `run-e6f0be051fd22e09bc4c5dffafc52749766efc13`; source `136c7c849ec0b7771fe45a5ed652a784033a8f120bd6bc04289bbc727f107f66`; deployed artifact `6e93c6c1baebdbb1f9cfa4643357ff9c634f1d4a312f9207192161a6e6e632e4`.
- Original repository revision: `6571218b2d769125fb736d294cf550bbec5455f6`. Buildable V1 project is committed/read-back verified on private repository `main` at `7b90395508e8a7084026d7dafc80a8e4b2360493`.
- Standalone V1 build manifest artifact digest: `8a0cb0448552ebf35f2cc72f11092f086e64134e0a2d71d1a269017b3f333abd`; Playwright Chromium passed six checks covering language/currency, income/expense totals and chart, reload/data retention, export, import merge and mobile/no browser errors.
- Build archive SHA-256: `4c3b2d7336c212ce49e6d5a6e2b9ca25795c857f3b0000d926225b10eec073cd`.
