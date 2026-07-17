# Feature 134 — Character Portrait Candidate Batch

## Goal

Implement the approved design in
`docs/portable-skill-pack/specs/2026-07-14-character-portrait-candidate-batch-design.md`.

For a Vertical Drama character whose identity is still open for casting, let the creator
request 1-5 equally strong portrait candidates in one flow. The Visual Bible Skill must
design materially different faces under one shared story/casting/cinematic language. The
creator explicitly selects the canonical portrait and Character DNA; unselected images stay
as durable alternatives and never become automatic references.

## Required outcomes

1. Add a lean Skill candidate-batch input/output contract and deterministic pairwise DNA
   diversity validation.
2. Preview one coordinated set, reserve exact render credits, submit independent image tasks,
   and persist owner-scoped candidate placeholders before external submission.
3. Settle each task into its candidate asset without accepting client-authored DNA metadata.
4. Atomically promote the chosen candidate and persist its Visual Bible while demoting the
   previous batch-selected primary.
5. Add first-time quantity controls, candidate approval/status/selection UI, saved
   alternatives, bilingual copy, responsive behavior, and accessibility states.
6. Preserve the existing single-image reference-locked flow after a primary exists and for
   approved-DNA recovery, variants, and twins.
7. Charge/refund exactly for submitted work, keep tenant/user/series/character isolation,
   and add focused Skill, service, router, frontend, and browser-state verification.

## Constraints

- No database migration solely for candidate batches; use existing role strings and JSONB
  metadata with bounded browser projections.
- Do not use one provider task with `numImages > 1`; distinct prompts need independent tasks.
- Do not perform biometric or real-person identity analysis.
- Preserve all pre-existing dirty-worktree changes in shared files.
- Do not stage, commit, push, deploy, or perform paid live image generation as part of the
  implementation verification.

## Authority

The approved design document is authoritative for detailed UX, data, credit, error, testing,
and non-goal decisions. The user explicitly approved implementation without further routine
questions.
