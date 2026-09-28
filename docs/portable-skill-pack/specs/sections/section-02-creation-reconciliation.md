# Section 02 — Creation and Story Bible Reconciliation

## Goal

Carry structured role data from Preset Synthesizer through wizard, seeding, Story Bible,
manual creation, variants, twins, and updates.

## Ownership

- Preset service/skill contract and examples.
- `CreateSeriesWizard.tsx` structured draft transport.
- `verticalDramaSeries.ts` parsing/seeding/reconciliation.
- `verticalDramaStoryBible.ts` structured refinement.
- Character route input schemas for manual/variant/twin paths.

## Behavior

Preset output contains stable character ID/key, narrative role, role tier, occupation,
age, description, and confidence/evidence. Wizard state stores the object directly; legacy
text import remains supported. Seeding persists the object atomically.

Story Bible returns character IDs and canonical role fields. Reconciliation preserves a
user-confirmed role, accepts valid unconfirmed structured refinement, and marks ambiguous
results for review. It never promotes a lead from `ซีอีโอหญิง`, `บอดี้การ์ด`, or another
occupation alone. Same-person variants inherit role; distinct twins receive their own role.

## TDD stubs

- Structured preset output and occupation/narrative-role separation.
- Wizard round-trip plus legacy text parser compatibility.
- CEO heroine persists as `lead_female` with occupation `CEO`.
- User-confirmed role wins over later Story Bible output.
- Manual, update, variant, twin, and age-stage paths round-trip canonical fields.
- Ambiguous refinement becomes review-required and blocks production image generation.

## Completion proof

Run focused preset, series-router, story-bible, and character-router tests. Capture one
round-trip fixture from preset to Visual Bible input.
