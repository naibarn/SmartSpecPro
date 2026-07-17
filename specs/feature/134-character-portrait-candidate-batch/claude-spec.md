# Feature 134 — Synthesized Specification

## Problem

The Characters page currently creates one first portrait and immediately treats it as the
identity reference. Creators may repeat paid generation many times before finding a face with
enough lead/villain/support screen presence. A single provider request with multiple images
does not reliably produce different people and does not fit the current one-result task flow.

## Required behavior

When a standalone character has no primary portrait and no parent/twin face source, expose
a 1-5 candidate-count control with default 3. This includes legacy stories with saved DNA
but no rendered primary; candidate planning ignores that old face lock and replaces it only
after selection. Preview one coordinated Skill-authored set, disclose
the paid render count/cost basis, submit each candidate as its own task, and show a responsive
selection grid. A one-image first batch still waits for explicit selection.

All candidates share story facts, role tier, age/region facts, casting floor, framing/lens/
lighting/color-grade family, emotionally readable cinematic realism, and anti-advertising
grammar. Every candidate is a different person: pairwise difference in at least three of
facial geometry, eyes/gaze, brows, nose, and lips/smile, plus hair and signature/silhouette
difference. Every adult lead independently passes existing lead-star QC.

Unselected images stay as `portrait_candidate` assets and remain selectable later. They are
never returned by primary-reference resolution. Selecting a candidate atomically promotes
its image and persists its server-stored Visual Bible; a previous batch-selected primary is
demoted. Manual imported primaries are not silently demoted.

After a primary exists, use the current one-image reference-locked flow. Parent/twin identity
flows also remain single identity.

## Reliability and credits

Create durable placeholders before external submissions. Reserve exact aggregate render
cost, skip reserve/refund for configured zero-cost transports, and refund immediate
unsubmitted work. Terminal task reconciliation remains owned by Media. Persist task/batch/
candidate provenance for resumption and settlement. Partial failure must preserve every
usable sibling candidate.

## Security and data boundaries

Use existing authenticated vertical-drama procedures and repeat tenant, user, series, and
character ownership checks. The client cannot supply or replace stored DNA metadata.
Candidate settle verifies its stored task identity and owned media asset. Browser projections
carry only bounded grouping/status IDs and no arbitrary metadata or provider-only secrets.

## UX and accessibility

Reuse the existing contact-sheet candidate-card grammar: selected ring/badge, real buttons,
`aria-pressed`, per-card status, retained versions, responsive grids, text status in addition
to color, visible focus, polite live updates, and bilingual Thai/English copy. Use 2 columns
at 390x844, 3 at 768x1024, and up to 5 at 1440x900 without horizontal scrolling.

## Constraints and non-goals

- No migration solely for batches.
- No `numImages > 1` task.
- No biometric/pixel identity scoring.
- No retroactive regeneration of downstream media.
- No change to variants/twins as unrelated faces.
- No live paid generation during verification.
- Preserve unrelated dirty-worktree changes and do not stage/commit/push.

## Acceptance

Focused Skill/runtime, stock, router, UI, type, and browser-state checks pass or carry a
specific recorded blocker. Normal existing character image and sheet flows remain compatible.
