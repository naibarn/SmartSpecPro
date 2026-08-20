# Request

Implement the approved option 2 from the age-stage variant design: when a
Vertical Drama character generation request describes a child/life-stage look
for an adult lead, explain the mismatch and let the user confirm creation of a
new age-stage variant. The new variant must use child visual validation, keep
the parent story role, generate its own portrait, and be available for shot
binding without a generic 500 error.

Assumptions:

- Existing `createCharacterVariant` and character-image polling flows are the
  preferred integration points.
- `roleTier` remains the canonical narrative role; no database migration is
  needed for the first implementation.
- Existing storyboard variant selection and per-shot reference override remain
  the binding mechanism.

Non-goals:

- Rewriting the storyboard variant-selection model.
- Automatically spending credits or creating a variant without confirmation.
- Changing adult lead quality gates or child-safety requirements globally.
