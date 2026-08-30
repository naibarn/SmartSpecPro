# Section 02 — Credits UI

## Ownership

Own `apps/web/client/src/pages/Credits.tsx` and Thai/English billing locale keys. Preserve unrelated context/OCR/report controls.

## UI/UX Contract

- Target user/job: account owner reviews filtered credit movement.
- Surface inventory: transaction card source select, start/end date inputs, refresh, three summary cards, mobile list and desktop table.
- State matrix: initial/loading keeps controls; invalid range shows validation and disables queries; empty shows zero summary plus empty list; error follows existing query behavior; refresh refetches data.
- Responsive matrix: controls wrap on narrow screens; summary is one column mobile and three columns at larger breakpoints; table keeps existing horizontal overflow.
- Accessibility: visible labels for all inputs, keyboard-native select/date controls, existing button focus styles, no icon-only new action.
- Copy: Thai and English labels for start date, end date, credit in, credit out, net, invalid range; no hard-coded user-facing summary text.
- Browser evidence: authenticated route replay at mobile and desktop is desirable; if unavailable, record skipped and rely on focused component tests/manual code review.

## Work

- default one calendar month ago through today using browser-local date-only values
- build one filter object for history and summary; convert end input to next-day exclusive Date
- reset page on source/start/end changes
- render localized numbers and signed net

## Acceptance

Changing any filter changes both list and summary; summary spans all matching rows, not current page only; invalid range does not query.
