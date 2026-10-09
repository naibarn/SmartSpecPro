# SPEC-308 implementation continuation evidence

- Canonical source for the PR branch: `origin/main` `2087ba88555cc22901b76abbeccbe066857fa819`.
- Current SPEC-308 source head: `0274d008320aa5223609e25715cdf52df9af89ed` on PR #399. This is implementation evidence only; it is not integrated and has no fresh test result yet.
- Canonical Spec digest: `81477c8fc0bf065ab95cae8b866a763741eccee5b8d051e437992d76685e71b9`.
- All 66 requirement rows remain `OPEN` / `UNVERIFIED`; no requirement status was changed by this continuation.

## Implemented continuation deltas

| Requirement | Source / test mapping | Current evidence state |
|---|---|---|
| `REQ-CF1C7A726AA8`, `AC-308-003` | `AssistantAppearancePreferences.tsx` now exposes the five mascot styles as accessible radio previews. `apps/web/tests/e2e/spec-308-dual-surface.spec.ts` asserts five named choices and selection. | Source and deterministic browser assertions are present at PR source head `757696001ae1e2fda36507fe1e730dbbaa5870ae`; tests have not been run on the current integrated PR head. |
| `REQ-85CE8E62EB17` | The same E2E spec checks appearance changes do not call notification delivery preference mutations. | Assertion added; unexecuted; remains OPEN. |
| `AC-308-017` | Demo reminder display/dismissal checks the mocked tRPC call log stays unchanged and no read mutation occurs. | Assertion added; unexecuted and simulated; remains OPEN. |
| `REQ-72B6A3690568`, `AC-308-018`, `AC-308-021` | `FeedbackButton.tsx` suppresses decorative balloons for open dialog, drag, hidden document, virtual keyboard, focused editable controls, modal/alert dialog; route changes dismiss current attention/hint. Focused predicate tests were added. | Implementation and tests committed at `0274d008320aa5223609e25715cdf52df9af89ed`; tests have not run. Arbitrary fixed-control collision still needs browser layout measurement. |

The branch also reconciles to canonical `origin/main` through a normal merge. `tools.spec_handoff` `validate --all` and `index --check` passed before this update on the reconciled feature branch; the current source commit has not yet received a fresh full verification run.

## Open implementation and authority gaps

- The authenticated notification stream and notification list are user-scoped and do not expose an active-tenant binding. `GlobalAlerts.tsx` therefore still projects new signals as generic/normal and does not use priority or grouped-occurrence fields for decorative attention. Do not change this until the Runtime Owner confirms the intended user-wide versus tenant-scoped authorization contract.
- The approved non-production app/runtime and authorized test identity are not provisioned. Deterministic mocks are simulation, not live acceptance.
- PR #403 live MCP smoke still lacks its approved endpoint and identity/token authority. PR #405 mandatory production audit remains FAIL on the single Moderate `sprintf-js@1.1.3` advisory until Security/Runtime Owner disposition.
- The PR #399 latest exact head needs fresh consolidated browser, focused, accessibility, responsive, privacy, and performance verification. Existing captures and prior 10/10 simulation are stale for this head.

No production flag, security threshold, or deployment state was changed. Keep all 66 requirements OPEN until exact-SHA evidence supports row-level closure.
