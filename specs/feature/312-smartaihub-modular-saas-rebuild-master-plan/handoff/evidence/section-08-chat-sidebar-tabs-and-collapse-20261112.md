# SPEC-312 Section 08 — Chat sidebar tabs and collapse

**Recorded:** 2026-11-12 (Asia/Bangkok)
**Canonical source:** `smartaihub-platform/main` at `e2e6d6bfedebfc2dc37cf98281e302b39c1820c4`
**Development target:** `modular-debian-dev` — `https://aimarkethubs.com`, Debian systemd with local Workerd, PostgreSQL `smartspec`.

## Change

The Chat left panel now switches between separate **เมนู** and **ประวัติแชต** tabs, showing only the selected panel. Workspace controls and the signed-in account footer remain available while expanded. A labelled, accessible control collapses the panel to a narrow left rail; expanding restores the previously selected tab. This keeps the existing conversation/history and navigation flows while giving the central Chat area more width.

Owned source paths:

- `modules/chat/src/ui/ChatWorkspace.tsx`
- `modules/chat/src/ui/styles.css`
- `modules/chat/src/ui/workspace.test.tsx`

SPEC-312 revision R1.11 and implementation section 08 record the behavior and acceptance criteria.

## Verification

- `pnpm --filter @smartaihub/chat test -- workspace.test.tsx` — passed, 3 files / 31 tests. Includes tab switching, history visibility, collapse/expand, and restoring the selected tab.
- `pnpm --filter @smartaihub/chat typecheck` — passed.
- `pnpm --filter @smartaihub/chat build` — passed (Vite output and Wrangler dry-run).
- Exact-source release builds passed for Core, Shell and Chat with `corepack pnpm@10.4.1`; Wrangler deployment dry-runs passed.
- Public release smoke returned HTTP 200 for shell root, login, Chat health and Chat module manifest; unauthenticated Chat session correctly returned 401. The latest manifest and versioned Chat JS/CSS returned 200 with a browser user agent. The delivered JS contains the Thai collapse/expand and history-tab labels; CSS contains the collapsed-sidebar and tab styles.
- Release receipt: `/home/dev/modular-development-releases/modular-debian-dev-e2e6d6bfedebfc2dc37cf98281e302b39c1820c4-sidebar-tabs/release-manifest.json`; SHA-256 `515b0bfd186a480a24965e2337802e89304eb51c3085dcc8b2bd76bb59a1cdc2`. Receipt records source SHA, target, runtime, build digests, deployment timestamp, smoke results and rollback service/port.
- `apps/web/scripts/deployment-targets.json` maps the active modular development release to the new receipt and rollback configuration. `smartaihub.app` and `smartsihub.com` were not deployed or changed.

## Acceptance still open

The source tests and public smoke do not prove the authenticated browser presentation. Verify the deployed Chat panel with a normal signed-in session at desktop, tablet and mobile sizes, including tab switching, history selection, account/workspace access, collapse and expansion, and ensuring the composer and theme control remain reachable. Leave overall responsive UI acceptance partial until this visual/interaction review is recorded. No authenticated browser session, user-data mutation, provider call, or credit-ledger mutation was used for this release proof.
