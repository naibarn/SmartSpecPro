# Modular Chat entry and responsive recovery — 2026-11-10

## Root cause and change

The authenticated shell reached `/chat`, but the Chat module loader rejected its Vite bundle because the previous HTML build entry omitted the exported `mount()` function. After changing the Chat build to preserve its JS entry export, the module stylesheet was still absent because Vite placed it on an imported shared chunk and the shell loader read CSS only from the entry itself. Platform commits `7931d5295ce22134e0c1e0ed60d5b6adb2a9c037` and `754166301ebb4f6d63f776bebcfe16d23a7b4e9e` fix the entry and traverse imported chunks for CSS. The shell now displays a loading state and gives Retry a fresh mount attempt with visible feedback. Layout rules cover the shell and Chat module at desktop, tablet, and small-screen breakpoints.

## Release

- Canonical platform source: `smartaihub-platform` `main` at `754166301ebb4f6d63f776bebcfe16d23a7b4e9e`.
- Target: `modular-debian-dev`, `https://aimarkethubs.com`, Debian with local Workerd.
- Release: `modular-debian-dev-754166301ebb4f6d63f776bebcfe16d23a7b4e9e-chat-css-loader`.
- Release manifest digest: `sha256:19fe5b35d3718550e16108d45d942bb1c74808677ea867b1ab3dfa70d64e6c0a`.
- Deployment controller result: `DEPLOYED_AND_VERIFIED` at `2026-11-10T14:41:15.676079Z`.
- Only the `aimarkethubs.com` development target was updated. Shared `smartspec` account/database data and legacy `smartaihub.app` were not changed; production `smartsihub.com` remains inactive.

## Verification

- Shell tests: 9/9 passed; Chat tests: 25/25 passed.
- `typecheck:shell`, `typecheck:chat`, and independent Core, Chat, and Shell builds passed.
- Local Core, Chat, and Shell health: 200; unauthenticated Chat session: 401; Chat manifest and module entry: 200.
- Public Shell root/login, Chat health, and module manifest: 200; unauthenticated Chat session: 401.
- Fetched public assets confirm the Chat entry exports `mount`, the imported shared stylesheet is reachable, and Shell/Chat responsive breakpoint rules are present. The Retry control is included in the deployed shell bundle.
- Authenticated browser interaction and visual viewport checks on desktop/tablet/mobile were not run: no local Chromium/Playwright browser was available and the computer sidecar had exited. The browser-based human UAT remains open.

## Remaining action

Hard-refresh `/chat` while signed in; confirm Chat opens and Retry responds, then visually check desktop, tablet, and mobile. If it still fails, report only the time and visible error text. Keep customer membership/data UAT, matched Legacy/Core performance evidence, and production-isolation proof open; keep `smartsihub.com` inactive.
