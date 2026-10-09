# SPEC-308 QA loop log

Baseline under review: worktree branch `codex/spec-308-dual-surface-20261009`, reconciled with latest `origin/main` `c7a4fbd1ff09214b462e8660b2626049d87f01c7`. Responsive fixes were implemented at `64dc5fb3c9c2fec61b909a1c956346d7476258ef`; tests rerun at that SHA: 8 files / 83 tests passed with Happy DOM. Repository typecheck was not run per `AGENTS.md`.

These are fourteen separate requirement lenses. They establish focused source/test evidence, not production acceptance.

| Round | QA lens | Finding and action | Retest / evidence | Result |
|---|---|---|---|---|
| 1 | Spec identity, registry, canonical source | Rechecked latest `origin/main`, registry, source and handoff before import; ID 308 was unallocated and latest spec was the uploaded R1.2. | WP0 import commit `e6a7243`; handoff validation and index checks passed. | PASS |
| 2 | Existing notification ownership | Confirmed one Bell, one authenticated SSE, current polling/query, current read actions, and `/notifications` route. Added explicit open intent on that Bell and existing-route fallback. | `GlobalAlerts.notificationBell.test.tsx`, including explicit intent and unavailable-bell fallback. | PASS |
| 3 | Existing Chat / Task Control / Feedback ownership | Kept the existing `FeedbackButton` dialog and guest/auth, chat creation, urgent feedback, upload and draft logic. Mascot remains the same DialogTrigger. | Existing `FeedbackButton.test.tsx`, 16 tests pass. | PASS |
| 4 | Feature gate and recovery | Tenant flag defaults false; deployment visual allow is exact `true`; hook status must resolve without error. Missing/error/off remains legacy UI. | Feature gate and shared flag tests. | PASS |
| 5 | Mascot asset/render contract | Five local original SVG variants share a decorative, non-focusable renderer; actual app tokens replace undefined Astryx variables. | `AssistantMascot.test.tsx`, 5 tests pass. | PASS |
| 6 | Preference schema and identity separation | Version 2 preferences validate known style/motion values and scope storage by tenant + user; invalid version, malformed JSON and unavailable storage fall back safely. | `assistantMascotPreferences.test.ts`, 4 tests pass. | PASS |
| 7 | Notification privacy and repeated rows | Cosmetic projection carries only stable row ID, generic trusted category/severity and in-memory ordering. Duplicate SSE row is ignored; raw title/body/metadata do not enter projection. | New SSE projection test plus attention reducer dedupe, reorder and scope tests. | PASS |
| 8 | Silent hydration / historical unread | Initial recent rows form a silent baseline; only later distinct live authorized SSE row IDs can create a normal generic episode. Count and polling changes do not create an episode. | `notificationAttention.test.ts`, 7 tests; baseline event and live SSE source review. | PASS |
| 9 | Balloon action and dismissal side effects | CTA sends only the explicit Bell intent; if Bell cannot be shown it routes to `/notifications`. Dismiss has no mark-read or Chat operation. | Bell intent/fallback tests; source assertion that CTA dispatches the notification event only. | PASS |
| 10 | Responsive launcher and reminder | Found undefined `--spacing-20`, fixed to existing token multiplication and recaptured. Launcher is 44×44 at 320/390px; label visible at 768/1440px. Balloons stay within all four viewports. | Component crops in `evidence/screenshots/` at 320×800, 390×844, 768×1024, 1440×900. | PASS (component capture only) |
| 11 | Motion, focus, timers and visibility | Bell animation is single-shot and guarded by user motion preference and OS reduced-motion. Attention deadlines clean up; focus, hidden tab, open dialog and dragging suspend attention. | Reducer timing/focus tests and reduced-motion helper test; CSS/source inspection. | PASS (no assistive-tech/browser interaction run) |
| 12 | Full focused regression / artifact integrity | Re-ran all changed-surface and legacy bell/launcher suites on merge tip `5ff91647`; validated both locale JSON files. | 8 files / 83 tests pass; `python3 -m json.tool` for EN/TH; scoped `git diff --check` passed before commit. | PASS |
| 13 | Mobile breakpoint and bounded reminder geometry | Recapture showed the prior “fits viewport” check was weaker than SPEC-308: balloons were 288px at 320px, and long launcher label could be hidden by the onboarding preference. Bounded mobile reminder surfaces to 216px, aligned 640–767px hints with the right-docked launcher, made the desktop/tablet label persistent, and implemented the optional one-time mobile Chat onboarding hint with separate CTA/dismiss targets. | Playwright component captures at 320/360/375/390/767/768/1024/1440px; mobile hint CTA opened the guest Chat dialog; hidden below 768px and shown from 768px. Latest captures in `ui-capture.md`. | PASS (mocked guest runtime) |
| 14 | Motion and onboarding preference | Added a one-shot mascot greeting only for a visible new notification, guarded by the user motion setting and OS reduced-motion. Renamed the setting to accurately control onboarding; onboarding and notification hints do not stack. | Focused regression 8 files / 83 tests; local Playwright confirmed onboarding and notification balloon are separate surfaces. | PASS (no physical-device assistive-tech run) |

## Fixes made during the loop

- Replaced undefined mascot color variables with the app's real `--primary`, `--primary-foreground`, and `--foreground` tokens.
- Isolated tenant flag hooks behind the explicit global allow so legacy tests/runtime do not require a new query provider when the surface is globally off.
- Added same-tab preference synchronization so a Settings change immediately updates the existing launcher.
- Added a baseline request/response handshake so late flag resolution cannot leave the reducer permanently uninitialized.
- Added Bell-unavailable fallback and tab visibility reactivation handling.
- Replaced new settings layout wrappers with Astryx VStack/HStack/Heading/Text/Button primitives and moved the balloon layout to a scoped class using app/Astryx tokens.
- Responsive browser inspection caught that `--spacing-20` was not defined in the active theme; the balloon offset now uses `--spacing-10 * 2`, and all three viewport positions were recaptured.
- A second viewport audit caught oversized mobile balloon geometry and the label/onboarding conflation. Mobile hint/balloon width now uses the defined `--spacing-12` token scale, and the desktop/tablet label no longer depends on onboarding preference.
- The optional mobile onboarding hint is session-scoped per user+tenant (guest hint is generic), dismissible, and opens the existing Chat dialog only after explicit user activation.

## Gates not established by these rounds

- The normal app server cannot pass startup preflight because this task worktree has no `DATABASE_URL`; `CONTROL_PLANE_API_KEY` was also not configured. No authenticated end-to-end run or authenticated Bell screenshot is available.
- Browser screenshots used Vite client with a mocked `tenant/current` response and guest route; only component crops are retained. A transient local system-error toast was hidden for those crops. This is not an authenticated runtime screenshot or a production-like visual acceptance.
- Feature settings and all five options were not exercised in a real authenticated browser session. No runtime/browser test validates balloon click while preserving a live unsaved feedback draft.
- SSE supplies stable row IDs but no occurrence ID. Repeated updates to a grouped row intentionally do not produce a second visual episode. Critical-category-specific escalation is not inferred from title or metadata and remains unimplemented pending a trusted category contract.
- No merge, production rollout, acceptance, or deploy occurred. SPEC-308 remains partial until the required integration and runtime gates pass.

## Continuation QA — isolated browser, 2026-10-09

Exact source SHA tested: `95fcf3e1392a34392020ca7c11c200fe8b641736` (PR #399 head). The test fixture and screenshots are committed and bound in `evidence/isolated-browser-simulation.md`.

| Dimension | Result | Evidence / boundary |
|---|---|---|
| 1. Mocked authenticated bootstrap | PASS | Stable synthetic user/tenant through intercepted API responses. |
| 2. Mascot renderer on launcher | PASS | Launcher exposes the current `droplet` style renderer. |
| 3. Existing launcher action | PASS | Launcher opens the existing AI Chat & Feedback dialog. |
| 4. Chat tab visibility | PASS | Existing Chat tab remains selected and usable. |
| 5. Feedback tab visibility | PASS | Existing Feedback tab renders. |
| 6. Feedback draft preservation | PASS | Unsent title persists across tab changes. |
| 7. Chat draft preservation | PASS | Unsent text persists across Chat ↔ Task Control ↔ Chat. |
| 8. Reduced-motion media query | PASS | Chromium emulates `prefers-reduced-motion: reduce`; launcher remains available. |
| 9. 320px mobile geometry | PASS | No document horizontal overflow; full-page screenshot captured. |
| 10. 360px mobile geometry | PASS | No document horizontal overflow; full-page screenshot captured. |
| 11. 390px mobile geometry | PASS | No document horizontal overflow; full-page screenshot captured. |
| 12. 767px breakpoint edge | PASS | No document horizontal overflow; screenshot captured. |
| 13. 768px tablet breakpoint edge | PASS | No document horizontal overflow; screenshot captured. |
| 14. 1440px desktop geometry | PASS | No document horizontal overflow; screenshot captured. |

Command: isolated Playwright Chromium spec; result **7 tests passed**. Exact command, synthetic identity, screenshot paths, and evidence limits are in `evidence/isolated-browser-simulation.md`.

These dimensions are simulated UI checks, not live authenticated acceptance. Bell data/read interactions and authenticated Settings are not established by this run; they remain in the focused component suite and external runtime gate respectively. No ledger row is closed by this continuation because the requirements require additional live, integrated, accessibility, security, or performance evidence.
