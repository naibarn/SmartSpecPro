# SPEC-308 R1.2 Implementation Plan

## Goal and authority
- Implement the uploaded SPEC-308 R1.2 as an opt-in SmartAIHub shared/core surface.
- Normative source: `specs/feature/308 - SmartAIHub Cooperative Dual Surface/spec.md` (digest `81477c8fc0bf065ab95cae8b866a763741eccee5b8d051e437992d76685e71b9`).
- Baseline: `origin/main` `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`; this revision has no tracked SPEC-308 yet. The registry lists ID 308 as next safe; no collision or previous handoff found.
- Scope: client presentation and interaction coordination only. No notification backend, schema, migration, delivery, authorization, chat, task-control, or feedback authority changes.
- Scope/risk: large/high (cross-surface UI, authorization-sensitive attention projection, responsive/accessibility requirements).
- Completion does not imply release, production deployment, or user acceptance. Production remains explicitly gated.

## Definition of done
- All applicable AC-308-001..036 have fresh evidence in the canonical requirement ledger; no claim derives from prose/mockup alone.
- Five original mascot variants, exact Bell/Chat/Feedback/Task Control parity, separate balloon routing, explicit fail-closed opt-in, privacy-safe preferences, accessibility and responsive acceptance.
- Focused tests, browser screenshots at required/extended sizes where possible, 12 distinct gap-audit lenses, independent review convergence, generated handoff/index validation, PR and exact canonical integration SHA.
- If a runtime or required approval gate cannot be satisfied, preserve a durable partial state and report that gate; never report COMPLETE.

## WP0 evidence / source map
- `GlobalAlerts.tsx`: single Bell owner, authentic count, existing SSE and polling, mark-read actions, safe links, urgent surfaces, job-completion toast. No second transport/query permitted.
- SSE route: authenticated user-scoped projection. `id` is stable notification-row identity, not a unique occurrence ID; only newly seen distinct notification IDs can drive cosmetic attention. Do not claim per-occurrence coverage.
- `FeedbackButton.tsx`: existing Chat / Task Control / Feedback dialog, guest/auth rules, draft/upload/error/emergency/urgent flows and draggable launcher.
- `App.tsx`: GlobalAlerts and FeedbackButton are existing siblings under common providers; minimal coordinator is possible without duplicate mounts.
- Feature flags: tenant defaults are often true. New flag must default false and be read through resolved/error-aware status; unknown/error/off disables visual additions. No DB migration.
- WP0 canonical import: generated handoff initialized from 66 normative rows; generated projections now pass `index --check`. Target-specific validate is structurally valid and correctly not completion-eligible.
- Existing pattern decision: reuse the current Bell, FeedbackButton Dialog, settings surface, notification popover/route and project primitives. No replacement notification/chat pattern.

## UI/UX contract
### Target user / JTBD
- Role: authenticated SmartAIHub user (plus guest where existing launcher permits); detect genuine notifications and discover Chat/Feedback without changing authorization.
- Goal: Bell and reminder open notifications; mascot opens the existing Chat/Feedback dialog; all controls remain useful when the feature is off.
- Entry: existing global top Bell and bottom FeedbackButton.
- Success: unambiguous actions, visible desktop/tablet label, compact mobile hit target and no lost legacy flow.

### Surface inventory and component map
| Surface | Existing owner | Intended change |
|---|---|---|
| Bell and notification popover | `GlobalAlerts.tsx` | Preserve data/handlers; add only bounded motion/open intent projection |
| Chat/Task Control/Feedback launcher | `FeedbackButton.tsx` | Preserve Dialog and all three tabs; decorate trigger and add separate balloon sibling |
| Sibling composition / attention context | `App.tsx` | One small UI-only coordinator if needed; no extra transport |
| Mascot renderer/assets | new `client/src/components/assistant-mascot/*` | Five original SVG shapes, common renderer/expression contract |
| Attention policy | new pure `client/src/lib/notificationAttention.ts` | Stable-ID dedupe, silent baseline, bounded coalescing/cooldown |
| Flags/preferences/settings | existing shared flag and settings owners | explicit off-by-default tenant flag + global false-by-default allow; local validated user+tenant preferences only |

### State and responsive contract
| State / tier | Expected behavior |
|---|---|
| loading/unknown/error | exact legacy surfaces; no preference identity bleed; no decorative timers |
| feature disabled / kill switch | original Bell + FeedbackButton/Dialog, no coordinator attention |
| enabled / quiet | static Bell with authentic badge; static selected mascot |
| verified new notification | one bounded Bell episode; at most one generic reminder; no payload content |
| empty / no recent | existing Bell states unchanged; no fake attention |
| mobile <768px | header Bell, ≥44px compact launcher, two-line max balloon; suppress when unsafe/keyboard/modal |
| tablet 768–1023px | visible full `AI Chat & Feedback` label at normal width |
| desktop ≥1024px | bottom launcher with persistent full label |
| focus/hover/disabled | visible focus; explicit target names; reduced-motion and disable settings suppress motion independently |

### Accessibility / copy / visual direction
- Reuse existing product components and semantic tokens; no global reset or new dependency. Astryx discovery selected AppShell as page shell, but the app already owns its shell, so reuse the existing shell and use only scoped primitives where compatible. No new standalone page is introduced.
- Visual direction: calm, friendly, restrained; single event-driven micro-motion; no continuous animation.
- TH/EN copy comes from versioned i18n: `มีแจ้งเตือนใหม่ อย่าลืมเข้าดู` / `You have a new notification — take a look.` and `ดูแจ้งเตือน` / `View notifications`.
- Keyboard and screen reader distinguish Bell, mascot, reminder CTA and dismiss. Reduced motion disables all decoration. Buttons are not nested.
- Browser evidence must follow `orchestra/references/ui-browser-verification.md`; required viewports 390x844, 768x1024, 1440x900; extended 360x800, 1024x768, 1280x800 plus 320px and 200% zoom.

## Work packages and ownership
| WP | Owner | Exact write scope | Dependency / completion predicate |
|---|---|---|---|
| WP0 Registry/source audit | conductor | SPEC-308 spec/handoff/status projections; evidence | conflict-free ID, source map, handoff/index checks |
| WP1 Mascot art/renderer | subagent A | new mascot directory only + its unit tests | five unique original variants; no shared Bell/Feedback/App edits |
| WP2 Attention reducer | subagent B | new pure attention reducer file + its unit tests | silent initial state, stable-ID dedupe and bounded episodes; no transport |
| WP3 Bell decorator | conductor | GlobalAlerts + its test | parity and separate notification open intent |
| WP4 Launcher/settings/flag | conductor | FeedbackButton; featureFlags and its admin registry/tests; dedicated preferences/settings component | fail closed and preserve existing dialog/flows |
| WP5 Coordinator/balloon | conductor | App.tsx + new coordinator/balloon/i18n files/tests | separate targets and no private payload |
| WP6 Responsive/a11y | conductor | scoped CSS/component adjustments + browser evidence | viewport/keyboard/safe-area evidence |
| WP7 Integration/QA | conductor | handoff/evidence/traceability | 12 unique review lenses, all required gates, PR, canonical receipts |

Parallel writer limit: two. WP1 and WP2 are isolated paths; conduct WP3–WP7 after those contracts stabilize. Do not allocate shared `GlobalAlerts.tsx`, `FeedbackButton.tsx`, `App.tsx`, feature flag registry, or handoff to subagents.

## Fast and heavy verification
- Fast gate per checkpoint: changed-scope parse/compile, `git diff --check`, conflict status, secret scan, SPEC handoff/index checks.
- Focused tests: existing `GlobalAlerts.notificationBell.test.tsx`, `FeedbackButton.test.tsx`, new mascot/reducer/coordinator/feature flag tests.
- Browser proof: screenshots and route/control interaction on required viewports; mockup inspection is visual guidance only.
- Forbidden here: repository-wide `npm run typecheck`; no full monorepo build in implementation session. Heavy post-integration checks are tied to exact integrated SHA.

## Open gates / residuals
- Baseline live browser screenshots and authorization fixture not captured yet.
- Verified notification row-level SSE authorization is established; grouped occurrence identity is not, so per-occurrence animation is explicitly out of scope.
- Production rollout and production authority are not requested and are not performed.
