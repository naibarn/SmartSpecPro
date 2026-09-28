# Gap audit round 4 — UI, accessibility, and responsive behavior

Checked: normal-vs-special entry point, Thai/English labels, 5,000-character idea limit,
character/speaker caps, drag/drop plus file-input fallback, loading/disabled states, model
separation, modal scrolling, and special storyboard projection.

Fixes applied: added a dedicated feature-flagged button beside the unchanged normal button;
added the special dialog and product/image picker; added bounded-selection helpers/tests;
added a special badge/status card; projected special 1–5 prompt-ready shots into the shared
storyboard panel and hid normal story/script stage UI only for special episodes.

Evidence: UI helper tests pass and Vite client/widget builds pass. Authenticated browser
viewport, focus-trap, screen-reader, and no-overflow evidence is explicitly pending in the
browser evidence file.
