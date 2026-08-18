# Section 01 — Storyboard gap authoring

## Ownership

Own the existing `VerticalDramaLocationsBibleCard` implementation and its
focused client tests. Do not rewrite unrelated storyboard shot rendering.

## Target files

- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/__tests__/`

## UI/UX Contract

- Target user / JTBD: a drama creator sees a missing location angle and wants to
  create a reusable sub-view with an editable command, then choose it per shot.
- Surface inventory: episode Storyboard location-bible card, coverage-gap row,
  prompt review state, candidate approval state, existing shot location picker.
- Component map: extend `VerticalDramaLocationsBibleCard`; reuse its credit
  confirmation, model selector, authenticated image, and existing picker.
- State matrix: idle, preview loading, editable prompt, render loading,
  candidate awaiting approval, approval loading, error/retry, approved/refreshing.
- Responsive matrix: textareas stack full width; buttons wrap on mobile/tablet;
  desktop keeps prompt and actions in the existing location row.
- Accessibility: labeled prompt and negative-prompt textareas, keyboard-reachable
  actions, visible focus, `aria-busy`/disabled loading states, clear live status.
- Visual direction: preserve existing dense storyboard cards, amber gap warning,
  sky review surface, existing border/radius/token utilities.
- Copy contract: Thai primary with English fallback; distinguish “สร้างคำสั่ง”,
  “แก้ไขคำสั่ง”, “สร้างภาพมุมย่อย”, “ตรวจสอบ/ใช้มุมนี้”, and “สร้างใหม่”.
- Browser evidence: authenticated route at mobile 390x844, tablet 768x1024,
  desktop 1440x900 when a browser session is available.

## Acceptance checks

- Gap action opens the review form with prefilled text.
- User edits are retained through render confirmation and sent to the server.
- Candidate approval creates a coverage variant and refreshes the roster.
