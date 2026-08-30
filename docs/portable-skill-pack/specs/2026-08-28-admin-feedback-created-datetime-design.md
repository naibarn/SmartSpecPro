# Admin Feedback Hub: Show ticket creation date and time in the left panel

## Goal

Make the exact submission time visible for every ticket in the Admin Feedback
Hub's left-hand list. Replace the current relative value (`1d ago`) with a
stable, readable local datetime such as `28/08/2026 14:35`.

## Scope

- Update only the ticket metadata row in `AdminFeedbackHub.tsx`.
- Reuse the existing `ticket.createdAt` value returned by `feedback.list`.
- Format using the browser/admin's local timezone, 24-hour time, and
  `DD/MM/YYYY HH:mm` ordering.
- Keep the existing clock icon, ticket ordering, filters, API, and database
  unchanged.
- Do not change the detail header on the right or other relative-date usages.

## Behavior and edge cases

- Valid timestamps render the exact local date and minute.
- Missing or invalid timestamps render the existing empty fallback rather than
  throwing or showing a misleading time.
- The existing compact metadata layout remains intact; no new row is added.

## Verification

- Add focused coverage for the datetime formatter if the page's existing test
  structure permits it; otherwise verify the helper by typecheck and diff
  inspection.
- Run `git diff --check`.
- Run the narrowest relevant web test/typecheck command available.
- Browser screenshot verification is optional for this small text-only change
  and will be reported separately if unavailable.

## Trade-off

Using the browser's local timezone keeps the display relevant to the admin
without adding a timezone setting or backend contract. The fixed `en-GB`
format gives the requested Gregorian slash date and 24-hour presentation while
leaving timezone resolution to the browser.
