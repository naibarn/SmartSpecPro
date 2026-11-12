# Modular Chat workspace mockup release — 2026-11-12

## Integrated source and target

- Source: `smartaihub-platform/main@651e7f6ec7f8f85a77c84eff81de02acc0f95f4f`, pushed and reconciled with `origin/main`.
- Target: `modular-debian-dev` / `https://aimarkethubs.com`, development Debian systemd with local Workerd, shared PostgreSQL `smartspec`.
- Release: `/home/dev/modular-development-releases/modular-debian-dev-651e7f6ec7f8f85a77c84eff81de02acc0f95f4f-chat-workspace-mockup`.
- Release manifest SHA-256: `fbb982f5eaa0d76d2b1e5a0891117a10f0fea175ec2588ea665f33f33ee2bcae`.
- The target release controller returned `DEPLOYED_AND_VERIFIED` at `2026-11-12T07:52:24.708298+00:00`. Rollback service `smartspec-dev-web.service:3100`, prior tunnel configuration, and service drop-ins were retained.
- No release was made to legacy `smartaihub.app` or future production `smartsihub.com`.

## UI changes

- Reworked the Chat module around the supplied SmartSIHub workspace mockup: branded left rail, workspace selection and creation, conversation history, Chat/Agents/Mini Apps/Task Control/Mission Control/Marketplace/Settings, Public Website and Admin placeholders, toolbar model selection and status, conversation inspector, welcome prompt tiles, and responsive tablet/mobile drawers.
- Removed the redundant shell brand header; sign-out is wired into the account area in the left rail.
- Added Astryx Light, Balance and Dark theme selection at the lower-right and reserved space at tablet/mobile sizes so it does not cover the composer.
- Added image and file pickers with removable selections. The current Chat API has no upload contract, so submitting selected files is blocked with a clear message; no upload is claimed.
- Split Chat UI vendor chunks. The production build emitted the Chat entry at 43.67 KB, React at 221.72 KB, Astryx at 325.53 KB, icons at 9.90 KB, StyleX at 1.49 KB, and CSS at 9.69 KB. Vite emitted no oversized chunk warning.

## Verification

- Chat package typecheck — PASS.
- Chat package tests — 30 passed.
- SaaS Shell typecheck — PASS.
- ChatPage and Shell routing tests — 7 passed.
- Exact-source Core, Shell and Chat builds plus Wrangler dry-runs — PASS.
- Release controller local smoke — Core 200, Chat 200, Shell 200, unauthenticated Chat session 401, module manifest 200, entry 200.
- Release controller public smoke — Shell root/login 200, Chat health 200, unauthenticated Chat session 401, module manifest 200.
- Local Workerd check fetched all 6 statically reachable Chat JavaScript/CSS assets and received 200 for each.

## Remaining acceptance

- Authenticated browser interaction and visual review at desktop, tablet and mobile sizes were not performed on this release. The health checks and responsive CSS are not visual UAT.
- Image/file selection is implemented, but actual upload and multimodal submission require a separately scoped authenticated upload contract and server-side validation.
- The existing authenticated paid-turn/credit UAT, Workerd Queue redelivery and Durable Object restart/contention proof remain open. No provider request or credit mutation was made during this UI release.
