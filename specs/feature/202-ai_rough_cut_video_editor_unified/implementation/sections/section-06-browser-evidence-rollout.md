# Section 06 — Integration verification, browser evidence, and rollout

## Goal

Prove the UI state machine and release readiness after Sections 01–05. This
section owns evidence and gate decisions, not new product behavior.

## Ownership paths

- Add/modify focused Phase3 integration tests under
  `apps/web/client/src/components/videoeditor/__tests__/` or an appropriate
  editor route test location.
- Add/modify Playwright route fixtures/specs under the repository's existing
  `tests/e2e` or `apps/web/client/src/e2e` convention after locating the
  authenticated fixture owner.
- Add: `specs/feature/202-ai_rough_cut_video_editor_unified/implementation/ui-browser-evidence.md`
- Update completion/review docs only after evidence is collected; do not claim
  skipped browser/Windows/deployment proof as pass.

## Design

Create deterministic fixtures for project loading, saved/dirty/saving,
autosave failure, conflict, waiting-agent, capability-blocked, degraded, QC
blocking, completed, failed, and canceled jobs. Keep fixtures tenant-safe and
do not depend on live provider/worker state for UI assertions.

The Phase3 route harness must assert roles, names, state text, focus order,
keyboard actions, and action availability. Authenticated Playwright runs must
capture screenshots/traces and record console errors, viewport overflow,
loading/empty/error, disabled/focus/hover, dark-surface readability, and
reduced-motion behavior.

Required viewports are mobile 390x844, tablet 768x1024, desktop 1440x900.
Because the editor is dense, also run 360x800, 1024x768, and 1280x800. Use
stable artifact names under the evidence convention and record exact commands.

Release is blocked if a required UI state has no component state/test, if a
primary action is unreachable, if a modal loses focus, if a status implies
completion before server gates, or if browser evidence has an unresolved
critical console/accessibility/layout failure.

## TDD checklist

- Route harness covers all state fixtures and no false empty/complete state.
- Keyboard path covers editor open, tabs, timeline selection, dialogs, Escape,
  conflict resolution, job actions, review actions, and focus return.
- Existing focused videoeditor tests remain green.
- Browser evidence covers all viewport/check matrices.
- `git diff --check` and targeted import/build checks pass on owned paths.
- Full typecheck is not run unless explicitly requested due project constraint.

## UI/UX Contract

### Target User / JTBD

- Role: release reviewer and end user validating the editor workflow.
- Goal: prove the most important editor/job/review paths work at target sizes.
- Entry point: authenticated `/video-editor` and `/worker-jobs` routes.
- Success: evidence-backed release decision with residual risks explicit.

### Existing Pattern Reference

- Searched: existing Playwright route audit, `test-results` evidence, videoeditor
  component tests, and the UI browser verification contract.
- Found: route-level screenshots/overflow audit and focused Vitest suites, but
  current conflict/review/QC evidence is missing or stale.
- Decision: reuse existing fixtures/evidence shape and add current editor states.

### Surface Inventory

| Surface | Evidence | Required coverage |
|---|---|---|
| `/video-editor` | screenshots/traces + route harness | state, keyboard, focus, overflow |
| Project/conflict dialogs | route fixture | focus, copy, actions |
| Worker panel/jobs | screenshots/traces | lifecycle/reason/QC/output |
| AI review/QC | screenshots/traces | selected apply/reject/blocking |

## Implementation result

Added the current 10-round audit and browser-evidence gate artifacts:

- `implementation/audits/ui-ux-10-round-audit-2026-09-18.md`
- `implementation/ui-browser-evidence.md`

Focused Vitest, esbuild, and diff checks passed. Authenticated browser evidence
at the required six viewport sizes was not falsely claimed because a current
authenticated editor fixture/session was unavailable in this workspace. Release
remains gated on that external browser proof and any deployment/Windows proof;
the missing evidence is explicitly recorded rather than treated as a pass.

### Component Map

| Component | File | Owns | Consumes |
|---|---|---|---|
| Phase3 route harness | videoeditor test location | deterministic UI fixtures | mocked tRPC/project/job states |
| Browser route spec | existing Playwright e2e location | authenticated route evidence | test fixtures/auth session |
| Evidence writer | `implementation/ui-browser-evidence.md` | pass/fail/skipped record | screenshots/traces/notes |
| Release review | feature completion/review docs | evidence-backed claim | focused tests + browser artifact |

### State Matrix

| State | Expected UI | Verification |
|---|---|---|
| loading/empty | stable labelled state | Vitest + browser |
| error/retry | safe copy and action | Vitest + browser |
| conflict | preserve/resolve/focus | Vitest + browser |
| capability/job | reason/action truth | Vitest + browser |
| review/QC | gate and keyboard path | Vitest + browser |
| success/terminal | verified next action | Vitest + browser |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | pass or explicit failure with screenshot/trace | required |
| tablet 768x1024 | pass or explicit failure with screenshot/trace | required |
| desktop 1440x900 | pass or explicit failure with screenshot/trace | required |
| small-mobile 360x800 | dense-layout extension | required for editor |
| laptop 1024x768 | multi-panel extension | required for editor |
| wide-desktop 1280x800 | dense-detail extension | required for editor |

### Accessibility Acceptance

- Keyboard/focus path is recorded, not inferred from unit tests.
- Dialogs, tabs, buttons, timeline items, statuses, and live regions have
  accessible names/semantics.
- Console, contrast, reduced motion, overflow, and primary-action checks are
  recorded per viewport.

### Copy Contract

- Evidence records actual visible copy and language mode.
- Any raw/unsafe error or misleading completion label is a release finding.

### Browser Evidence Required

Use `ui-browser-verification.md` format. Skipped checks must state why, owner,
and whether they block release. Historical June 2026 evidence may be linked as
context but cannot replace current captures.

## Exit criteria

All local focused tests pass, current browser evidence is recorded, residual
gates are classified, and completion/review docs make only evidence-backed
claims for Spec 202/203 UI readiness.
