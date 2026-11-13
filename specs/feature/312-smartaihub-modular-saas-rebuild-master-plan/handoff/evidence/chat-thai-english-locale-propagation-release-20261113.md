# SPEC-312 R1.13 — Thai/English locale propagation

**Recorded:** 2026-11-13 (Asia/Bangkok)
**Canonical source:** `smartaihub-platform/main@f31c0667d985873c2202f619e19a978bf45c0728` (integrated and equal to `origin/main`)
**Development target:** `modular-debian-dev` — `https://aimarkethubs.com`, Debian systemd with local Workerd, PostgreSQL `smartspec`.

## Delivered

- Chat now reads one shared Thai/English locale across the sidebar, workspace and model controls, conversation history, composer, attachment states, conversation metadata, dates and numeric credit/token values. Provider and model identifiers and user-authored values are preserved.
- Astryx receives the active locale and Thai labels for its generated send/stop, new-message, scroll, attachment expand/collapse, message status and accessibility strings. The shell listens to the same locale event, updates its Chat loading/error/sign-out copy, browser document language and Chat tab title.
- The current locale is stored in `smartaihub.locale` and restored when Chat mounts again.
- SPEC-312 is advanced to R1.13; section 09 and its section index describe the full Chat plus shell behavior.

## Verification

- `pnpm --filter @smartaihub/chat typecheck` — passed.
- `pnpm --filter @smartaihub/saas-shell typecheck` — passed.
- `pnpm --filter @smartaihub/chat build` — passed; Wrangler dry-run passed.
- `pnpm --filter @smartaihub/saas-shell build` — passed; Wrangler dry-run passed.
- Exact-SHA Core, Shell and Chat builds ran from the immutable source workspace at `f31c0667d985873c2202f619e19a978bf45c0728`; each Worker dry-run passed.
- Release build artifact digests: Core `sha256:99d8201455e341925a749edb17bbc997582d83d83f54d056e1c53dc81efe51f0`, Shell `sha256:041129176fb72a92957a147dd66ba5bd55aa3012e83a62b10496dba0c98ae17d`, Chat `sha256:b263e80cfb6fdc86d2ac76dbaad53eb4f6b5b849b07174578440083e06772d44`.
- Release controller result: `DEPLOYED_AND_VERIFIED`. Local Core/Chat/Shell health, Chat manifest/entry and module entry returned 200; unauthenticated Chat session returned the expected 401. Public Shell root/login, Chat health and module manifest returned 200; unauthenticated Chat session returned the expected 401.
- Fetched Chat entry JavaScript and Shell main JavaScript from `aimarkethubs.com` byte-match the deployed artifact. Chat entry SHA-256: `68a8c9ee660d02bbf7f5734a5a82ad77847cb1272b4c5687e34c6965dc3e1d55`; Shell main SHA-256: `a1476a83c29d6d6c8bd13244b68b9149f973e53da654385ef02ca0a71e8146a2`. The served entry assets contain both Thai and English copy and the locale behavior strings.
- No automated tests were run in this session.

## Release record

- Release: `/home/dev/modular-development-releases/modular-debian-dev-f31c0667d985873c2202f619e19a978bf45c0728-locale-propagation`
- Receipt: `release-manifest.json`; SHA-256 `1877dbd7d0348ef3c40769e0defbdafd2c1005ce2fda83ce50697b72b5003b9c`.
- Deployment completed at `2026-11-13T00:21:40.691923+00:00` UTC. `deployment-targets.json` records this as the serving development release. `smartspec-dev-web.service:3100` remains available for rollback.
- `smartaihub.app` and production `smartsihub.com` were not deployed or modified. No database migration or credit-ledger mutation was part of this change.

## Acceptance still open

An authenticated visual/interaction review has not been performed in this session. Keep SPEC-312 acceptance partial until the signed-in user switches Thai/English while Chat is open and confirms all regions, Astryx labels, date/number formatting and preference persistence at desktop, tablet and mobile sizes.
