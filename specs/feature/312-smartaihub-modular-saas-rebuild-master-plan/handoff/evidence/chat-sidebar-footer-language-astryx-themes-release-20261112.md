# SPEC-312 R1.12 — Chat sidebar footer, language and Astryx themes

**Recorded:** 2026-11-12 (Asia/Bangkok)
**Canonical source:** `smartaihub-platform/main@fc97012613dcf65a7ece07c75df9d8aea2f852d5` (integrated and equal to `origin/main`)
**Development target:** `modular-debian-dev` — `https://aimarkethubs.com`, Debian systemd with local Workerd, PostgreSQL `smartspec`.

## Delivered

- The expanded left sidebar now keeps its main content in the flexible/scrolling region and pins its footer below it. The Thai/English segmented control is the first footer item, directly above the account/avatar, profile/settings and sign-out row.
- Locale reads and persists through the existing `smartaihub.locale` key.
- The Chat module now loads the seven themes available in Astryx 0.6.8: Neutral, Butter, Chocolate, Gothic, Matcha, Stone and Y2K. Selecting each option applies its corresponding Astryx theme and saves the selection. Neutral is the default; Gothic selects dark mode. Theme dependencies and CSS are included in the independently built Chat module.
- SPEC-312 was updated to R1.12 and section 09 records the behavior, acceptance and remaining UAT.

## Verification

- `pnpm --filter @smartaihub/chat test` — passed, 4 files / 33 tests. The theme test selects all seven themes and checks the active Astryx theme attribute and persisted preference; the sidebar test checks footer order and persisted language.
- `pnpm --filter @smartaihub/chat typecheck` — passed.
- `pnpm --filter @smartaihub/chat build` — passed; Wrangler dry-run passed. Chat CSS output: 155.44 kB (16.23 kB gzip); Astryx vendor JavaScript: 381.51 kB (117.76 kB gzip).
- Exact-SHA release builds for Core, Shell and Chat passed from the immutable source workspace at `fc97012613dcf65a7ece07c75df9d8aea2f852d5`; Wrangler dry-runs passed.
- Modular Debian release-controller unit tests — 11 passed.
- The deployed versioned Chat JS and CSS returned HTTP 200 and byte-matched the release artifact (JS SHA-256 `577dbfa9d58ce0d411e1481544c08d055dcb0caa120531b6941b03333b0ab621`; CSS SHA-256 `96f0d940455134ebe9850e7640e4ef6e9bbe2448484b2531a145f7a55791f2bf`). Served JS contains all seven theme choices; served CSS contains all seven Astryx theme scopes.
- Release controller result: `DEPLOYED_AND_VERIFIED`. Local Core/Chat/Shell health, Chat entry and manifest returned 200; unauthenticated Chat session returned the expected 401. Public Shell root/login, Chat health and module manifest returned 200; unauthenticated Chat session returned the expected 401.

## Release record

- Release: `/home/dev/modular-development-releases/modular-debian-dev-fc97012613dcf65a7ece07c75df9d8aea2f852d5-sidebar-footer-astryx-themes`
- Receipt: `release-manifest.json`; SHA-256 `f31449e5f991ffe205f2885f13ab6a168d5555ac87483ce6787eb4470e91ba25`.
- Chat artifact digest: `sha256:76ee4453c400ecd964f724f34d31b52c5d134e11e5b2de1d0aa6731bd8bdf3fe`.
- Deployment completed at `2026-11-12T15:50:41.345342+00:00` UTC. `deployment-targets.json` now records this serving release and its rollback configuration. The controller preserved `smartspec-dev-web.service:3100` as rollback.
- Canonical source lease preparation used SmartSpecPro's shared `canonical_source.py` directly because the platform repository does not contain the helper path expected by the convenience wrapper. The first isolated build invocation found no installed dependencies; the exact workspace was installed from the frozen lockfile, a fresh lease was acquired, and Core/Shell/Chat builds then passed. No source files were changed by this recovery.
- `smartaihub.app` and production `smartsihub.com` were not deployed or modified. No database migration, authenticated provider call, account change or credit-ledger mutation was part of this release.

## Acceptance still open

The checks above prove the exact build and public delivery, but not the signed-in visual experience. Keep SPEC-312 acceptance partial until an authenticated user reviews the deployed release at desktop, tablet and mobile sizes: verify the footer remains at the bottom while the selected left-panel tab scrolls, switch language, try each theme and reload, and confirm the Chat composer and theme control remain reachable. Existing Queue/Durable Object resilience, authenticated Chat/credit UAT, truthful Cloud Execution status, authenticated attachment upload and matched Legacy/Core benchmark gaps remain open.
