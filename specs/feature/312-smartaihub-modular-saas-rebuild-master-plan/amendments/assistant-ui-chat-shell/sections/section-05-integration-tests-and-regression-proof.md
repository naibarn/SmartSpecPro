# Section 05 — integration tests and regression proof

## Deliverable

Extend existing Chat Vitest coverage for adapter mappings and critical user flows, then run focused Chat package tests, typecheck and build/Wrangler dry-run. Add only tests supported by the actual test harness and do not claim authenticated behavior from mocked transport.

## Owned paths

- `smartaihub-platform/modules/chat/src/ui/*.test.tsx`
- `smartaihub-platform/modules/chat/src/ui/*.test.ts`
- New adapter-focused tests in `modules/chat/src/ui/`

## Acceptance

- Verify stable thread/message IDs, multiple thread selection, Core send/poll/result mapping, attachments, retry and no automatic resubmission on remount/reconnect.
- Preserve existing workspace, provider catalog, queue/credit UI, attachment and responsive tests.
- Confirm no accidental provider/API key, tenant header, server-only import or retired system was added to the client module.
- Run Chat typecheck/build and check produced module remains independently consumable by Shell.

## Prerequisites and gaps

Browser authentication/MFA may not be available to this process; browser UAT must be reported separately from tests and health checks.

## Implementation evidence — 2026-11-15

- `pnpm --filter @smartaihub/chat exec vitest run --config vitest.config.ts --reporter=dot`: **40 passed / 40 passed**, 6 test files.
- `pnpm --filter @smartaihub/chat typecheck`: passed.
- `pnpm --filter @smartaihub/chat build`: passed; Wrangler dry-run resolved `CHAT_TARGET_ID=modular-debian-dev` and `CORE_BASE_URL=https://aimarkethubs.com`.
- The Vite main client chunk is `514.68 kB` minified, above the configured 500 kB warning threshold; retain as a performance follow-up.
- Modular release controller verified local Core/Chat/Shell health and public Shell root/login, Chat health and module manifest; the unauthenticated Chat session returned the expected `401`.
- Public versioned Chat JavaScript and CSS assets both returned `200`; detailed deployment receipt and exact-source artifact digests are recorded in [release evidence](implementation/evidence/modular-debian-dev-release-e31402e.md).
- Authenticated browser attempt and per-scenario PASS/BLOCKED/NOT TESTED matrix: [UAT report](implementation/evidence/authenticated-uat-20261115.md). Orca reported accessibility/screenshots unsupported; no authenticated request was made.
- Test/build source: `e31402ecbbd12fe0c3bc23ae00dac89286c52a43`.

## Follow-up evidence — exact source `ad04c244c3996cc81220d7efae0f0c536dd07f4b`

- Chat suite is now **43/43** across 7 files; the added regression verifies that the published Chat module manifest describes the existing Core-authenticated workspace-scoped write, attachment and queued-turn authority accurately. It does not prove an authenticated live send succeeds.
- Chat package typecheck passed. Core, Shell and Chat builds plus Wrangler dry-runs passed from the exact canonical source; the existing 516.91 kB minified Chat main-chunk warning remains.
- Core auth/queue tests remain 39/39 on the unchanged Core code from source `48708cc`; the exact results are preserved in `implementation/evidence/chat-shell-audit-checks-20261115.md`.
- The exact-source runtime evidence is [the `ad04c24` DEV receipt](implementation/evidence/modular-debian-dev-release-ad04c24.md). Public health/assets and unauthenticated denial pass; authenticated send, attachment round-trip and responsive screenshot UAT remain blocked. See [current UAT status](implementation/evidence/authenticated-uat-20261115.md).
