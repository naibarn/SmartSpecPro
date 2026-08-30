# Section 02 — Wizard Route Surface

Add a page presentation to `CreateSeriesWizard` at
`/drama-series/:seriesId?tab=planning&edit=1`. Pass the existing shell `seriesId`
into finalization so the selected Draft/QC updates the same row. Keep the existing
modal as the default compatibility presentation and preserve recovery IDs.

The route must show a stable header, return action, accessible left-to-right
stepper, and responsive behavior without duplicating wizard logic. Refreshing the
edit URL must reopen only the active wizard state, not history.
