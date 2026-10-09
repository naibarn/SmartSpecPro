# SPEC-308 implementation continuation — 2026-10-10

## Current checkpoint

- Canonical development base: `origin/main` `df776f6fca6dde82afde3ed88a54fd80f4a68d27`.
- PR #399 source branch is `codex/spec-308-dual-surface-20261009`; implementation/test-design head `9432a1ec4dbb4412c06d8cb49d6da426831d1ada`.
- Added deterministic E2E coverage for turning the tenant mascot flag off while the Chat & Feedback dialog is open. It waits for the shared tenant query to become stale, returns browser focus to trigger the normal refetch, verifies the mock served `false`, and checks the legacy launcher, open dialog, Chat draft, Feedback title/description, enabled submit action and Task Control tab remain available. It checks that rollback does not create/send Chat, submit Feedback, or mark notifications read.
- Existing `FeedbackButtonContent` remains mounted while the gate result changes, so its Chat/Feedback state and existing actions are retained. No production behavior change was needed for this scenario; test coverage was added.
- This is deterministic mock coverage only. The new E2E test was not run, and it does not establish live authenticated or tenant-isolation acceptance.
- Local code check: `git show --check` passed for the two new E2E commits. No application tests, audit, build or typecheck were run locally in this implementation-first phase.

## Parallel PR reconciliation

- PR #403 current head at review time: `1f6a05c8478a790d4a99c210cf9acc9a073ae663`. No additional evidence-backed workflow or fixture code change remained. Automatic CI run `37963193183` had install, schema build and focused MCP tests passing; `check:mcp146` and security/audit jobs were still pending when inspected. Live MCP failed closed because the approved endpoint/token are unavailable.
- PR #405 current head at review time: `ec94f99f432ba37ab3cce8637994b24d9f7deac5`. `api-generator` manifest and lockfile both declare `js-yaml` `^4.3.2` and resolve `4.3.2`. Automatic compatibility regressions passed; mandatory audit remains failed on `sprintf-js@1.1.3` Moderate. A Security Owner disposition is required; any ONNX/WSL2 compatibility run requires Runtime Owner approval.

## Open gates

- All 66 SPEC-308 ledger rows remain `OPEN` / `UNVERIFIED`; no bulk or unsupported pass updates were made.
- PR #399 has not been integrated. Current exact-head consolidated verification remains pending.
- Live MCP endpoint/token authority, approved non-production SmartSpecPro runtime and test identity, and Security/Runtime Owner disposition for `sprintf-js` remain unavailable.
- Keep production flags off. No production deployment or release acceptance occurred.
