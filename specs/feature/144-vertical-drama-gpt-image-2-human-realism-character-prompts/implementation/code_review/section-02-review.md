# Code Review: Section 02 — Skill and generation contract

## Review round 1

The reviewer found seven actionable gaps: framing-insensitive anatomy anchors,
candidate instructions requiring negative_prompt, post-normalization budget
validation after credits, missing explicit target mode, target warning mode,
missing stale-snapshot decision behavior, and an accidental leading `+` in the
mirrored skill heading.

## Auto-fixes

- Made anatomy/contact anchors conditional on visible full-body/three-quarter
  framing and kept close-up/candidate QC focused on face/expression realism.
- Made candidate negative_prompt legacy-only and optional in both instructions
  and the skill example.
- Added final selected/candidate prompt normalization and cap assertions before
  credit deduction.
- Added explicit `imagePromptContractMode: "target"`, fail-closed capability
  validation, and target-aware warning collection.
- Added pure stale snapshot reuse/regenerate/reject decision logic with an
  actionable regenerate-required code.
- Removed the accidental patch marker and restored mirror parity.

## Review round 2

Final confirmation passed after the fixes. The selected-model router paths now
resolve capability from the same pricing/config row used by the render, so the
target contract is checked before prompt generation without adding a second DB
read. Legacy tests and transport behavior remain compatible.

## Review round 3 — transport and stale-state follow-up

- Target approved prompts without a current snapshot are rejected before any
  prompt generation or image credit reservation.
- Edited target prompts retain the snapshot metadata for stale-contract checks;
  only an exact prompt match persists the snapshot DNA.
- Candidate preflight normalizes every final prompt before claim/reservation and
  rejects stale candidate snapshots before paid submission.
- The media payload guard requires both the trusted marker and the current
  contract version before omitting `negative_prompt`.

## Verdict

PASS. No paid provider call was made during review.
