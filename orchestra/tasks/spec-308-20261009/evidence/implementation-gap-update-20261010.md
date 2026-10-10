# SPEC-308 implementation gap closure — 2026-10-10

## Source and CI context

- Canonical `origin/main`: `002265277a4a8846167abc7aaa178d5911d3020d`.
- Previous PR #399 source under review: `38945eef14f405e3606a068f457efb1820269254`.
- Current implementation checkpoint: `cfaf435a87f528ca3360a4be99405641b8059ccf` (local commit, not yet the remote PR head).
- Browser run `37971045023` failed only in the Playwright step: 12 passed, 4 failed. Install, generated schema build, Chromium, and Vite startup passed. Failures were the normal Bell motion assertion and three reminder balloon assertions. The exact run record is `pr-ci-37971045023.json`.
- MCP run `37971044599` failed focused baseline tests because `DATABASE_URL` was unset and obsolete tests imported retired `agencyMcpService`. PR #403 owns the fixture repair. The live gate lacks approved `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN`; its exact run record is `pr-ci-37971044599.json`.

## Implemented in the current worktree

- Prevent stale user/tenant appearance preferences from rendering while the current identity's local settings load in both Settings and the persistent launcher.
- Advance notification-attention scope generations on identity changes, clearing seen IDs, cooldowns, active episodes, and timers; require a fresh baseline before new-scope arrivals can trigger. Event payloads are accepted only for the active identity key.
- Use the canonical English and Thai names for all five mascot choices as visible and accessible labels; retain stable IDs and persisted values.
- Disable reminder and onboarding entrance animation when the user selects motion `off`, while retaining static copy and controls.
- Make demo and notification browser interactions wait for the launcher feature state and notification baseline so the simulation doesn't dispatch before its consumers are ready.
- Add source tests for reducer scope changes, accessible Settings names, and manual motion-off balloon behavior. These tests have not been run, per the requested single consolidated verification round.

## Requirement effect

These code changes address portions of `REQ-CF1C7A726AA8`, `AC-308-002`, `AC-308-003`, `AC-308-020`, `AC-308-023`, `AC-308-025`, `AC-308-035`, and `AC-308-036`. Their canonical ledger states remain OPEN/UNVERIFIED pending the consolidated exact-SHA test round and required runtime acceptance. No requirement was marked PASS.

## Remaining boundaries

- Exact-source browser and focused tests are pending.
- PR #403 live MCP evidence needs an approved endpoint and token; production MCP security gate must remain unchanged.
- PR #405's mandatory audit residual `sprintf-js@1.1.3` still needs Security Owner disposition; any ONNX/WSL2 runtime test needs Runtime Owner approval.
- SPEC-308 live authenticated acceptance still needs an approved non-production endpoint and authorized tenant/user.
- Production flags remain OFF; no deployment occurred.
