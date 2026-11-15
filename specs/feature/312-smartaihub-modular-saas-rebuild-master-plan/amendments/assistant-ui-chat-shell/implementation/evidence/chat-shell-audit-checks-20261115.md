# Chat Shell audit check evidence — 2026-11-15

**Platform source:** `smartaihub-platform@48708cc241ae85e57774fa60d15b88c57c65ce6a` (integrated `origin/main`)
**Scope:** focused Chat UI Markdown change and canonical Chat/Core boundaries.
**Profile:** `package` (scoped checks; no repository-wide `npm run typecheck`).

| Check | Command/scope | Result |
|---|---|---|
| Chat module tests | `pnpm --filter @smartaihub/chat test -- --reporter=dot` | PASS — 6 files, 42 tests |
| Core auth/queue tests | `pnpm --filter @smartaihub/saas-core exec vitest run src/identity/authRoutes.test.ts src/chat/chatService.test.ts src/chat/chatQueueRuntime.test.ts src/chat/chatRepository.test.ts --reporter=dot` | PASS — 3 discovered files, 39 tests. The requested `chatRepository.test.ts` path is absent and therefore was not counted. |
| Chat package typecheck | `pnpm --filter @smartaihub/chat typecheck` | PASS — contracts build and Chat TypeScript compile |
| Chat module build | `pnpm --filter @smartaihub/chat build` | PASS — Vite build, manifest publication and Wrangler dry-run bound to `CHAT_TARGET_ID=modular-debian-dev`, `CORE_BASE_URL=https://aimarkethubs.com` |
| Patch hygiene | `git diff --check` and cached diff check before commit | PASS |
| Browser/authenticated UAT | Supported authenticated browser not available | BLOCKED — see `authenticated-uat-20261115.md`; no user credentials/cookies were used or requested |

## Build observation

Vite emitted a non-blocking chunk warning. The `main` JS chunk was `516.91 kB` minified (`130.21 kB` gzip); `vendor-astryx` was `395.84 kB` minified. This scoped rendering change did not add a dependency. The package build and Wrangler dry-run completed successfully.

## Runtime evidence boundary

The existing release receipt at `e31402ecbbd12fe0c3bc23ae00dac89286c52a43` verifies that SHA only. These checks do not prove SHA `48708cc` is deployed or that authenticated user flows work. No new release was executed as part of this evidence record.
