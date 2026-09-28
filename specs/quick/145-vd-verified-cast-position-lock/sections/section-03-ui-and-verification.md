# Section 03 — UI and verification

Ownership: `VerticalDramaEpisodePage`, `VerticalDramaEpisodeWorkspace`,
`VerticalDramaStoryboardPanel`, and focused component/flow tests.

## UI/UX Contract

- Target user/job: a drama creator verifies which known character occupies each
  position before spending prompt/video credits.
- Surface inventory: shot image card, ordered cast editor, readiness message,
  prompt button, paid video button.
- Component map: existing shot card plus an inline ordered `<select>` list and
  confirm/edit controls; no new global navigation.
- State matrix: not required, missing, editing-invalid, saving, current-confirmed,
  stale-after-asset/cast-change, server-error.
- Responsive matrix: one column on narrow cards; compact two-column labels/selects
  when space permits; no horizontal drag dependency.
- Accessibility: associated labels, keyboard-selectable controls, live readable
  error text, buttons with explicit text, no color-only status.
- Design tokens: reuse existing Button/Badge/card border/background/text tokens and
  current amber/green semantic classes.
- Copy: Thai default plus English fallback. Missing/stale copy must say that prompt
  and paid video are blocked; ambiguity copy must recommend Change image, repair,
  or Video-Safe frame.
- Browser evidence: focused RTL component tests are required; authenticated manual
  browser verification is recorded when an available session exists.

TDD: callback payload preserves exact stable-key order; duplicate slots cannot save;
prompt/video actions disable until current lock exists; changing asset shows stale
guidance.

Acceptance: the user can correct and confirm Shot 5 without guessing names from
text, and cannot accidentally confirm an incomplete mapping.
