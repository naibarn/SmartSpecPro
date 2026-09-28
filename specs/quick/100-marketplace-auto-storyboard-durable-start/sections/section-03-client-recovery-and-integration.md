# Section 03: Client Recovery and Integration

## Ownership

- `apps/web/client/src/lib/apiResponseDiagnostics.ts`
- `apps/web/client/src/pages/MarketplaceCaptureProductDetail.tsx`
- client diagnostics/polling tests
- cross-section verification only; do not redesign the page

Depends on the queued-run contract from Sections 01-02.

## Work

1. Write failing tests for lost-upstream classification and mutation behavior.
2. Export a reusable classifier that recognizes the existing lost
   server/proxy connection diagnostic without coupling the page to raw HTML.
3. Keep `optimisticAutoStoryboardStart` and fast polling active after an
   ambiguous lost-connection failure.
4. Show concise recovery copy explaining that the run is being checked.
5. Clear optimistic state for definitive failures and after the bounded polling
   window or observed run state resolves the ambiguity.
6. Run focused API, worker, service, and client regression suites; inspect the
   scoped diff for interaction with dirty user changes.

## UI/UX Contract

- Target user/job: a Marketplace Capture user starts Auto Storyboard Review and
  needs accurate progress without duplicate retries.
- Surface inventory: existing start button, toast/error feedback, run status,
  and polling behavior only.
- Component map: no new component; update mutation state handling and existing
  feedback copy.
- State matrix:
  - accepted: queued run shown and polling continues;
  - ambiguous connection loss: polling continues with recovery message;
  - definitive validation failure: polling stops and error is shown;
  - persisted terminal run: run failure becomes the source of truth.
- Responsive matrix: no layout change on mobile, tablet, or desktop.
- Accessibility: existing toast/status announcement mechanism remains usable;
  copy must not rely on color alone.
- Design tokens: none; no visual styling change.
- Copy: preserve the page's current language behavior; Thai recovery copy
  should be concise, with existing English fallback conventions.
- Browser evidence: no visual screenshot is required because layout is
  unchanged; behavior must be covered by component/source tests and, if the
  local route is runnable, one start-state smoke check.

## Acceptance checks

- Lost upstream errors do not clear optimistic polling immediately.
- Other errors retain current behavior.
- Polling terminates on observed run/terminal state or timeout.
- No new duplicate-start action is exposed.

## Implemented

- Exported the lost-upstream classifier.
- Kept optimistic polling active after ambiguous 502/524-style failures.
- Added a 60-second bounded recovery window guarded by the start-attempt
  generation so an older timeout cannot clear a newer start.
