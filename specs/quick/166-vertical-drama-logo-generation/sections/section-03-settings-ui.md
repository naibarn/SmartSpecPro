# Section 03 — Settings UI

## Ownership

Own `VerticalDramaSettingsTab.tsx`, localized overlay copy, and focused UI tests.

## UI/UX Contract

- Target user/job: series creator replacing a title or Facebook page watermark with an AI-generated transparent logo.
- Surface: each existing watermark slot; modal contains model select, optional channel name, editable prompt, confirmation, progress, result preview, and apply/cancel.
- State matrix: loading/empty/error model list; draft/invalid/confirming; submitting/polling/transient retry; completed preview; applying; success; generation/apply error with retry.
- Responsive matrix: slot cards remain one column on narrow screens; modal content scrolls without hiding primary action at 390x844, 768x1024, and 1440x900.
- Accessibility: labeled select/input/textarea, dialog title/description, focus return, keyboard-confirmable buttons, `aria-busy`/status text, no icon-only unlabeled action.
- Copy: Thai first with English fallback, exact prompt templates, explicit credit/pending warning where existing media copy supports it, localized validation and error text.
- Browser evidence: record route `/drama-series/:id?tab=settings`, required mobile/tablet/desktop checks, console/overflow/focus/loading/preview/apply state notes.

## TDD/acceptance

- Verify no duplicate mutation under repeated clicks.
- Verify secondary asks channel name before prompt generation.
- Verify prompt remains editable and apply only occurs after second confirmation.
- Verify existing upload/text controls remain unchanged.
