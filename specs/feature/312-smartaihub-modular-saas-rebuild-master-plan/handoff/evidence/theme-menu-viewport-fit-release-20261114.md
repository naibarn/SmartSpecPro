# SPEC-312 R1.15 — Theme menu viewport fit

**Recorded:** 2026-11-14 (Asia/Bangkok)
**Canonical source:** `smartaihub-platform/main@137dc60748aa88cfc19c23ae3e0b09bce60fcb91` (integrated and equal to `origin/main`)
**Development target:** `modular-debian-dev` — `https://aimarkethubs.com`, Debian systemd with local Workerd, PostgreSQL `smartspec`.

## Cause and fix

The fixed desktop theme control sits at the lower-right. Astryx Selector's default selected-item overlay aligned the selected row with the trigger and let the list extend below the viewport. The Chat selector now uses Astryx `placement="above"`; its layer positioning flips to the opposite side when the upper side does not have enough room. The adaptive mobile presentation and existing in-flow mobile control remain unchanged.

## Verification and release

- `pnpm --filter @smartaihub/chat typecheck` — passed.
- `pnpm --filter @smartaihub/chat build` — passed; Vite build and Wrangler dry-run passed.
- Exact-source Core, Shell and Chat builds plus Wrangler dry-runs from the canonical source lease — passed.
- Modular release controller — `DEPLOYED_AND_VERIFIED` at `2026-11-14T00:35:04.810899Z`; local Core/Chat/Shell health, Chat manifest and entry returned 200, and an unauthenticated Chat session returned the expected 401. Public Shell root/login, Chat health and manifest returned 200, and an unauthenticated Chat session returned the expected 401.
- The public module manifest points to Chat version `0.1.0`; all six reachable JavaScript/CSS assets were byte-for-byte identical to the release artifact. The new Chat entry is `/modules/chat/0.1.0/assets/main-BbhcBH3S.js` (SHA-256 `a749e87ec84d21fa7df4258760a4a6f0ce5e5fc4cd624ad30df2bf829cd31b37`); the CSS is `/modules/chat/0.1.0/assets/main-ZM5lKS0N.css` (SHA-256 `4965c541b0447db96b4c66fd683fc4c157a605fbb314253979a70b43b602e3f8`). The built entry contains the explicit `above` placement.
- Release manifest SHA-256: `5c0486b1c1e00a429ac643599ce01f1356fde90aa9da8068b77d0bf4bafcaac7`.
- Release: `/home/dev/modular-development-releases/modular-debian-dev-137dc60748aa88cfc19c23ae3e0b09bce60fcb91-theme-menu-viewport`.
- `apps/web/scripts/deployment-targets.json` now records this active release and rollback config. `smartaihub.app` and production `smartsihub.com` were not changed; no database migration was part of this UI fix.
- No automated tests were run. Authenticated rendered visual review is not available in this execution, so confirm the menu visually at desktop and compact viewports before closing responsive acceptance. The user may need to hard-reload `/chat` to fetch the new versioned entry.
