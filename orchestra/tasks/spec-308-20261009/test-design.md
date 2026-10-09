# SPEC-308 Test Design

| Requirement | Observable behavior | Level/location | RED evidence | GREEN evidence | Residual boundary |
|---|---|---|---|---|---|
| AC-001 canonical identity | registry has one SPEC-308, generated handoff and indices agree | contract/tool: `tools.spec_handoff` | baseline origin lacked canonical 308; before import validate had no row | `init`, `reconcile`, `index --check`, `validate --spec-dir` | final merged SHA must be checked |
| AC-002 five original styles | five visibly different shapes at 24/32/40 | unit + browser snapshot: mascot tests | capture absent before implementation | focused mascot test/screenshot artifact | does not establish legal ownership outside repository authorship |
| AC-003/027 appearance and flags | valid local pref reloads; invalid and unknown gates fall back | unit: settings/flag tests | missing feature/flag/prefs | focused tests cover corrupt, guest, user/tenant switch, undefined/error/off | browser storage behavior still needs runtime check |
| AC-004..006 launcher/dialog | desktop/tablet label; mobile hit target; all styles open same dialog | component tests + browser | existing launcher behavior baseline | FeedbackButton tests preserve 3 tabs, auth, drafts, submit/drag | full authenticated flow may need runtime credentials |
| AC-007..012 Bell parity | count/list/read/routes/toasts remain; only first distinct authorized notification may animate | component + route contract tests | existing Bell tests | Bell regression tests plus negative mount/reconnect/count-only cases | grouped occurrence semantics are not proven |
| AC-013..020 reminder semantics | generic text, separate notification CTA, dismiss/focus/timers/no Chat | reducer/component fake timers | no reducer/coordinator | focused reducer and interaction tests | end-to-end route evidence separate |
| AC-021..023 viewport/accessibility | no critical overlap; mobile hint/balloon ≤220px; launcher label hidden below 768px and persistent from tablet breakpoint; distinct accessible hint/dismiss actions; reduced motion | browser/manual + a11y tests | baseline screenshots/tests | captures at 320/360/375/390/767/768/1024/1440 and guest onboarding CTA check | authenticated runtime, real virtual keyboard, theme/zoom and assistive-tech checks remain open |
| AC-024..028 security/data | SVG no external/script; no extra transport/read/write/LLM; scope reset; flag off preserves UI | static/unit/contract tests | source audit confirms existing single transport | focused assertions and diff/source review | CSP/runtime telemetry remains separate |
| AC-029 performance | no new network, bounded timer, no CLS regression measured | browser trace | baseline not yet captured | before/after trace against same environment | low-end physical device may be unavailable |
| AC-030 screenshots | dashboard, notifications, chat, editor/map, mobile across five styles | browser evidence | baseline capture pending | artifacts under `artifacts/ui/spec-308/` | unavailable routes must be explicit skips |
| AC-031 12 audit lenses | 12 distinct gap review records, affected checks rerun | review artifact | none yet | `qa-gap-audit.md` with distinct lens/evidence and reruns | prose review is not runtime verification |
| AC-032 PR/handoff/final verify | PR URL, exact merge SHA, generated evidence | GitHub + writer | no PR yet | attached PR, canonical handoff, reachability proof | production deployment excluded |
| AC-033 outcomes | metrics only if consented source exists; otherwise no invented uplift | static/privacy review | no verified telemetry contract | source evidence or explicit defer | success metrics may remain unmeasured |
| AC-034..036 supersession/localization/rollback | R1.2 bell stays bell; TH/EN; rollback restores legacy surfaces in all active UI states | component/browser | imported spec documents precedence | tests, i18n checks, rollback exercise | production rollback approval remains external |

## Focused commands
- `cd apps/web && npm test -- --run client/src/components/__tests__/GlobalAlerts.notificationBell.test.tsx client/src/components/guardian/__tests__/FeedbackButton.test.tsx` (verify runner argument syntax first).
- New focused Vitest files will be run by exact path; no repository-wide typecheck.
- `python3 -m tools.spec_handoff --repo . index --check` and `validate --spec-dir ...`.
- Playwright/browser screenshots per `ui-browser-verification.md` when app/runtime is available.
