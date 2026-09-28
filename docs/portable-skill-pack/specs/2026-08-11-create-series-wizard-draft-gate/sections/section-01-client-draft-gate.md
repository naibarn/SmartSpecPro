# Section 01 — Client Draft Gate

## Ownership

Own `CreateSeriesWizard.tsx` and focused wizard tests only.

## TDD expectations

Update the resolver test first, then add component tests for the gate. Do not rely on a
mutation's returned `data` as proof of user confirmation.

## Implementation

- Replace the direct single-preset action with `synthesize_single_preset`.
- Add stable source-signature helpers and request/applied draft keys.
- Treat a title as manual when the current title is non-empty and was not supplied by the
  draft apply operation; generated candidates require explicit selection.
- Require valid 4–5 distinct title options for automatic-title apply.
- Clear applied state on source-signature changes and regeneration; ignore stale async data.
- Disable/guard forward stepper and Next until draft apply + title + existing field checks pass.
- Keep Back available and preserve manual title/output edits.
- Keep premise guidance, examples, and character count visible outside the input; mark title,
  genre, and logline as optional or AI-fillable instead of implying every field must be typed.

## UI/UX Contract

- Target user/job: create a usable series draft without guessing whether AI generation or
  confirmation is complete.
- Surface inventory: preset/premise source panel, draft result/title choices, `ใช้ draft นี้`,
  `ปรับใหม่`, stepper, footer Next/Create.
- State matrix: idle, generating, draft-ready, title-required, applied, stale, failed.
- Responsive: preserve existing dialog scroll and two-column preset layout; disabled controls
  must remain readable at narrow widths.
- Accessibility: disabled forward actions expose an adjacent reason; title choices use buttons
  with selected state; loading buttons expose spinner with text and do not permit double-submit.
- Copy: Thai remains primary (`สร้าง draft`, `ใช้ draft นี้`, `เลือกชื่อเรื่อง...`,
  `draft เก่าแล้ว...`) with current English fallback.
- Browser evidence: manually exercise one-preset and premise flows through draft generation,
  title selection, apply, Next, stale-source edit, and regenerate.

## Acceptance

All client acceptance criteria in the approved design and TDD guidance pass, including the
always-visible partial-input guidance regression.
