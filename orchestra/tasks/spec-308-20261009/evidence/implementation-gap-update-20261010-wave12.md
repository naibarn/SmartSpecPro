# SPEC-308 continuation wave 12 — browser geometry and current gates

## Changes implemented

- On drag completion, `FeedbackButton` now positions the reminder from the committed custom launcher coordinates plus measured launcher dimensions. The DOM rectangle remains the anchor for docked placement. This avoids using an intermediate pointer-move rectangle after React commits the final drag position.
- The isolated “unverified SSE does not replace demo hint” browser scenario pauses its clock at a future fixed time only after the authenticated launcher and notification baseline are ready. This keeps the mobile demo dismissal timer deterministic without freezing the page's auth/setup timers.

## Verification

- PR #399 head `0fdda9580ff80988266f7677980991481637c076`, based on `224fa6cd8ce122ee178f3a6040c32269f0f814a0` at dispatch.
- Mocked browser workflow run [38009610472](https://github.com/naibarn/SmartSpecPro/actions/runs/38009610472): PASS, 18/18 Chromium simulations. Artifact includes 37 responsive/browser screenshots and Playwright JSON. This is a deterministic mocked authenticated simulation only; it is not live acceptance.
- PR #399 contract/security workflow run [38009610509](https://github.com/naibarn/SmartSpecPro/actions/runs/38009610509): FAIL before mandatory audit because canonical-main MCP tests still have the existing database-session fixture and retired `agencyMcpService` import failures (44 failed / 76 passed). PR #403 owns that fixture repair. Live smoke fails closed because the approved `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN` are unavailable. No gate was skipped or weakened.
- PR #403 remains blocked by the mandatory production audit and missing live MCP authority. PR #405 compatibility regressions pass, but the full audit still reports the unpatched Moderate `sprintf-js@1.1.3`; Security Owner and Media/Runtime Owner disposition is required.

## Requirement and lifecycle state

- All 66 requirement rows remain OPEN; no requirement is marked PASS from this mocked run. It only adds supporting evidence for the already-mapped browser behaviors.
- Canonical integration SHA remains unset. Live authenticated acceptance on an approved non-production runtime/test identity and Feature-049 notification authorization remain pending. Production feature flags remain OFF.
- Next workunit remains `WP_SECURITY_BASELINE_DEPENDENCY_REMEDIATION`, then reconcile #403, then #399 in that order. External authority is needed for the `sprintf-js` disposition and MCP/runtime identities.
