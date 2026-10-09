# SPEC-308 implementation continuation — 2026-10-10, wave 4

## Candidate and reconciliation

- Refreshed `origin/main`: `6dcd7934332db7929904f8da642915751a6bb79`.
- PR #399 source implementation commit: `2d554f2097d230d957cbfbacfcd822bdb62b9568`.
- PR #399 exact workflow candidate: `583f65404dddc9b722d9abc4b63b41e10c44c728`.
- PR #403 head: `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; PR #405 head: `868a5600ff770be91885666b7f584835e03fc690`. Their worktrees were not changed.

## Implemented

- Bell Recent summary reads the already-running bounded `limit: 10` poll result before the dropdown opens; no notification query, transport, or read mutation was added. The SSE cosmetic attention test now confirms an unverified payload remains silent.
- Settings validates every preference patch against the allowed style/motion/boolean values and refuses to save defaults while the active identity's preference data is still hydrating.
- Mascot renderer falls back to the recognizable `chat` style at 32px with calm expression when malformed runtime values bypass its TypeScript props. Tests cover 20 style/expression combinations and the malformed-value fallback.
- Chat, Task Control and Feedback dialog tabs now have selected-state tab stops, associated tabpanel IDs/names, and manual arrow/Home/End keyboard focus movement. Moving focus does not auto-create a Chat conversation; Enter/Space activates the focused native button.
- The focused unit suites are now part of the existing PR #399 browser workflow. Paths cover Bell, mascot, Feedback, Settings, notification preferences, attention reducer and preference/feature-gate helpers.

## Verification evidence and limits

- `git diff --check`: PASS before implementation commit; canonical `spec_handoff validate --all`: PASS; `index --write` and `index --check`: PASS (473 records, 315 canonical Specs, no drift).
- Local focused Vitest command exited before test discovery because the isolated worktree has no `node_modules` (`vitest: not found`). No install was attempted because the shared filesystem had only about 513 MB free.
- GitHub Actions run `37981327003` was the exact candidate `583f65404dddc9b722d9abc4b63b41e10c44c728`; its test-path forwarding defect was later corrected. Run `37983209928` on `2fec9d4b4b4e889951fcd20efe253855d0f6c43c` then proved focused file selection was fixed but exposed test-fixture/accessibility expectation failures; see wave 5 evidence. Do not interpret the skipped browser stage as a browser pass.
- Prior mocked browser evidence run `37979594088` passed 17/17 on ancestor source SHA `4f16c72d105d75d8b4779350bd77e6aa845cd899`; it remains simulated evidence and predates the current source hardening. Screenshots from that run are retained in `evidence/screenshots/` and do not establish live acceptance.
- MCP workflow run `37981327020` fails on PR #403-owned baseline: test errors include absent `DATABASE_URL`-dependent session results and stale imports of retired `agencyMcpService`. The live-contract job fails closed because `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN` are unset. Security and audit steps were skipped after the focused-test failure; no gate was bypassed.

## Requirement and acceptance state

- The canonical writer individually assessed AC-308-002, -003, -008 and -022 as APPLICABLE/CURRENT with PARTIAL implementation evidence. Each remains OPEN with no verification SHA.
- All 66 requirements remain unresolved; no bulk PASS update was made.
- Live Feature-049 tenant/occurrence authorization, approved non-production app runtime and authorized identity, PR #403 live MCP authority, and Security/Runtime Owner disposition for residual `sprintf-js` remain open. Production flags remain OFF.

## Next action

Retrieve and inspect run `37981327003` before deciding on any retry. Fix only a failure proven by its output. Then collect the current CI artifact and update evidence without treating mocks as live authenticated acceptance. Continue normal PR order #405 → #403 → #399 only after each mandatory gate and authority requirement passes.
