# Section 03 — Dashboard warning

## Ownership

Own auth user projection, Dashboard priority notice, and English/Thai copy.

## Target files

- `apps/web/client/src/contexts/AuthContext.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`
- `apps/web/client/src/locales/en/dashboard.json`
- `apps/web/client/src/locales/th/dashboard.json`

## UI/UX Contract

- Target user/job: free-credit user needs to understand the deadline and act.
- Surface: Dashboard priority snapshot; CTA routes to `/credits`.
- States: non-eligible hidden; active warning with days remaining; cancelled
  hidden; expired is blocked by auth; loading follows existing auth skeleton.
- Responsive: use existing notice card layout for mobile and desktop.
- Accessibility: use existing semantic heading/text/button structure and ensure
  warning copy is readable without color alone.
- Copy: explicitly state 15 days, reset to zero, account disablement, and
  purchase cancellation; provide Thai and English translations.
- Browser evidence: a real authenticated browser check is not claimed unless
  run; focused component tests are required.

## TDD expectations

Test the rendered warning text, remaining-day interpolation, CTA, and hidden
states.
