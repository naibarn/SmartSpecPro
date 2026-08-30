# Section 03: admin pricing and user history

## Ownership

Admin skill table/edit UX, localization, and user-facing credit history projection.

## Targets

- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/client/src/pages/Credits.tsx`
- `apps/web/client/src/pages/Dashboard.tsx` if projection changes are required
- Thai/English admin and credits locale files
- focused UI tests

## UI/UX Contract

- Target: admin configures price from the skill table without navigating away; user sees one clear skill-run charge.
- States: loading, default 2/0, edited unsaved, validation error, saved, failed save.
- Accessibility: labelled integer inputs, keyboard-editable controls, visible total, no truncation of skill name or charge detail.
- Copy: preserve existing bilingual locale structure; show tenant share, skill owner share, and total in both languages.
- Browser evidence: authenticated `/admin/skills` edit and `/credits` history click-through is required for live proof, but is not claimed by local tests.
