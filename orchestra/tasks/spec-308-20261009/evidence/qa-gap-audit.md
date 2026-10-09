# SPEC-308 QA loop log

Baseline under review: worktree branch `codex/spec-308-dual-surface-20261009`, reconciled with latest `origin/main` `c7a4fbd1ff09214b462e8660b2626049d87f01c7`. Source commit `a430a747cf4991cbb7fbbdf5351dad984f29231b`; tests rerun at branch merge tip `5ff91647b53d040ea93c59e90e208d27b645b568`: 8 files / 83 tests passed with Happy DOM. Repository typecheck was not run per `AGENTS.md`.

These are twelve separate requirement lenses. They establish focused source/test evidence, not production acceptance.

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

## Fixes made during the loop

- Replaced undefined mascot color variables with the app's real `--primary`, `--primary-foreground`, and `--foreground` tokens.
- Isolated tenant flag hooks behind the explicit global allow so legacy tests/runtime do not require a new query provider when the surface is globally off.
- Added same-tab preference synchronization so a Settings change immediately updates the existing launcher.
- Added a baseline request/response handshake so late flag resolution cannot leave the reducer permanently uninitialized.
- Added Bell-unavailable fallback and tab visibility reactivation handling.
- Replaced new settings layout wrappers with Astryx VStack/HStack/Heading/Text/Button primitives and moved the balloon layout to a scoped class using app/Astryx tokens.
- Responsive browser inspection caught that `--spacing-20` was not defined in the active theme; the balloon offset now uses `--spacing-10 * 2`, and all three viewport positions were recaptured.

## Gates not established by these rounds

- The normal app server cannot pass startup preflight because this task worktree has no `DATABASE_URL`; `CONTROL_PLANE_API_KEY` was also not configured. No authenticated end-to-end run or authenticated Bell screenshot is available.
- Browser screenshots used Vite client with a mocked `tenant/current` response and guest route; only component crops are retained. A transient local system-error toast was hidden for those crops. This is not an authenticated runtime screenshot or a production-like visual acceptance.
- Feature settings and all five options were not exercised in a real authenticated browser session. No runtime/browser test validates balloon click while preserving a live unsaved feedback draft.
- SSE supplies stable row IDs but no occurrence ID. Repeated updates to a grouped row intentionally do not produce a second visual episode. Critical-category-specific escalation is not inferred from title or metadata and remains unimplemented pending a trusted category contract.
- No merge, production rollout, acceptance, or deploy occurred. SPEC-308 remains partial until the required integration and runtime gates pass.
