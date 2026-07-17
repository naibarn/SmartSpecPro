# Feature 134 Interview Record

The product interview was completed in the preceding design conversation. The user
explicitly instructed implementation to continue without further routine questions.

## Q1 — What happens to images that are not selected?

Keep them as durable face alternatives so the creator can change the canonical choice later.
They must not be automatic identity references.

## Q2 — How should candidates differ?

Use the supplied three-image example as the quality model: the same premium vertical-drama
casting and cinematic character language, but recognizably different faces. Hair, pose,
camera, outfit, or background changes alone are insufficient.

## Q3 — Should implementation pause for additional confirmation?

No. Implement the approved specification end to end and do not ask again for routine choices.

## Auto-decisions

- Use one lean Skill candidate-set call and N independent image tasks.
- Default first-time count to 3 and allow 1-5.
- Store server-authored snapshots in existing asset metadata; expose only bounded projection
  fields.
- Create candidate placeholders before external task submission.
- Use a dedicated settle operation and an atomic select/promote operation.
- Preserve existing editable prompt behavior only for later normal regeneration; candidate
  previews remain read-only to protect prompt-to-DNA integrity.
- Skip database migration, biometric image comparison, live paid image generation, staging,
  commit, push, and deployment.

