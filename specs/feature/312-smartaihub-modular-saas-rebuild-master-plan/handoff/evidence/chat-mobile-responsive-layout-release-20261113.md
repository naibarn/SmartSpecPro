# SPEC-312 R1.14 — Mobile Chat responsive layout

**Recorded:** 2026-11-13 (Asia/Bangkok)
**Canonical source:** `smartaihub-platform/main@e541abf7fe9010a216b709fa3b0b48dcaec71854` (integrated and equal to `origin/main`)
**Development target:** `modular-debian-dev` — `https://aimarkethubs.com`, Debian systemd with local Workerd, PostgreSQL `smartspec`.

## Delivered

- Chat toolbar controls wrap into deliberate rows at mobile breakpoints; the model selector retains its natural height.
- Example prompt cards become a single column on mobile.
- The theme selector joins normal toolbar flow on mobile, avoiding overlap with the composer; desktop keeps its lower-right placement.
- Mobile welcome content starts near the top of the available Chat area. The composer receives mobile safe-area spacing and the conversation can use its own scroll area.
- The change is limited to Chat UI component wiring and Chat module CSS. It does not change identity, workspace authorization, provider/model admission, Queue execution, credit settlement or target selection.

## Verification

- `pnpm --filter @smartaihub/chat typecheck` — passed.
- `pnpm --filter @smartaihub/chat build` — passed.
- Core, Shell and Chat exact-SHA builds and Wrangler dry-runs — passed.
- Release-controller result: `DEPLOYED_AND_VERIFIED`. Local Core/Chat/Shell health, module entry and manifest returned 200; unauthenticated Chat session returned the expected 401. Public Shell root/login, Chat health and module manifest returned 200; unauthenticated Chat session returned the expected 401.
- Served Chat module manifest SHA-256: `ccee1e9e09a7ebbb22eec42a1e1fb4c796dccf63a7cad008b4e8c4b6632f3356`. Served Vite manifest SHA-256: `7d28e1173aefb1d3a4700054f1bf569130a3c2e07b98097474509b5d04eb7d64`. Fetched Chat entry JavaScript and CSS matched the exact deployed artifact byte-for-byte. Entry SHA-256: `d049d7f353b0e8329f5c43a1c80f5e74ab2436dfe302bf6544cfe4de3044d0a3`; CSS SHA-256: `4965c541b0447db96b4c66fd683fc4c157a605fbb314253979a70b43b602e3f8`.
- No automated tests were run.
- An authenticated rendered visual review at real mobile, tablet and desktop viewport sizes was not available in this environment. The user should review the deployed Chat on a mobile device; keep responsive visual acceptance open until recorded. Asset parity and health checks do not prove the rendered layout is correct.

## Release record

- Release: `/home/dev/modular-development-releases/modular-debian-dev-e541abf7fe9010a216b709fa3b0b48dcaec71854-mobile-chat-layout`
- Receipt: `release-manifest.json`; SHA-256 `20b2f602ec5965c931421a74df8e2c4922331364bd695f6efae4180798c7243c`.
- Core artifact digest: `sha256:ed3b1ba5a6fec2ec20f1a831ae4879f66fb81747205b9368b1d6e4fa7e564933`.
- Shell artifact digest: `sha256:041129176fb72a92957a147dd66ba5bd55aa3012e83a62b10496dba0c98ae17d`.
- Chat artifact digest: `sha256:35a50b97f7e43985244d3522fa9df114f9417b96932b9a542d2a4ad0b73d28f9`.
- Deployed at `2026-11-13T03:08:23.489344Z`.
- `smartaihub.app` and production `smartsihub.com` were not deployed or modified. No database migration was part of this change.

## Acceptance still open

On the deployed exact SHA, verify mobile toolbar wrapping and model-selector height, one-column prompts, conversation scrolling, composer/send reachability and theme placement; then confirm tablet and desktop remain free of overlap and horizontal overflow. Keep SPEC-312 acceptance partial until this rendered review is recorded.
