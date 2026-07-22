# Guardian Presence Reference — Child-Product Guardian Rules

This file is the deep-dive companion to the guardian-presence rules referenced
in `skill.md` Phase D (Plan Narrative) and Phase F (Generate Start-Frame
Prompts). These rules are self-contained: they do not depend on, extend, or
require any other presence-tracking system in the codebase, and they are
enforced unconditionally whenever they activate, regardless of whatever other
character or presence configuration a caller may also pass. There is no
opt-out — `review_tone`, any creative preset, and `user_requirements` cannot
disable, weaken, or bypass this policy.

## Activation condition

Guardian presence activates when both of the following are true:

- `child_subject_policy.productChildRelated === true`, AND
- a given shot depicts a minor (i.e. that shot's `depicts_minor === true`).

When active, that shot must also set `guardian_required === true` and must
visually include a supervising adult guardian in the SAME frame as the minor.
A shot that depicts a minor without also depicting the guardian in the same
frame is invalid and must be revised before it can pass Phase K's `finalQc`.

## Guardian identity anchor

- The guardian's identity anchor is the uploaded adult character reference
  at `child_subject_policy.guardianReferenceIndex` in `reference_manifest`.
- The uploaded reference at that index must always be treated as an ADULT.
  Never reinterpret, relabel, or age-convert that reference into the child
  being depicted — the child is a separate, unreferenced or age-appropriate
  depiction, and the adult reference is always the guardian, never the
  minor.
- If no `guardianReferenceIndex` is supplied but `productChildRelated` is
  true and a shot would otherwise depict a minor, that shot must fall back
  to a child-free framing (see below) rather than depicting an unaccompanied
  minor.

## Per-shot framing menu when a paired guardian frame is not achievable

When a shot's beat cannot naturally accommodate both the minor and the
guardian in one clean composition, use one of these child-free framings
instead of depicting the minor alone:

- **Product-only** — the product fills the frame; no person is depicted.
  Hook and product-reveal beats may default to product-only.
- **Hands-only** — only an adult's (or unspecified) hands are visible
  operating the product; no head, face, or child identity is shown.
- **Adult-presenter-only** — the guardian/presenter is shown alone with the
  product; the minor is not depicted in that frame at all.

Every shot must declare both `depicts_minor: boolean` and
`guardian_required: boolean`. When a shot uses one of the framings above,
`depicts_minor` must be `false` for that shot.

## No-unaccompanied-minor rule

This is the hard constraint the whole policy exists to enforce: no output
frame may show a minor without the guardian visibly present in the same
frame. If a beat's natural content would require an unaccompanied minor to
satisfy the narrative, prefer the framing menu above (product-only,
hands-only, or adult-presenter-only) over dropping the guardian. Never
silently ship a minor-only frame to satisfy shot pacing or duration.

## Guardian policy is independent and unconditional

Guardian-presence enforcement runs independently of, and in addition to, any
other character- or presence-related configuration the caller may pass
(for example `character_mode` or `character_presence_mode` inputs, when
supplied, are informational passthroughs only). Even if such configuration
is absent, unset, or not wired to any runtime behavior elsewhere in the
codebase, the guardian-presence rules in this file remain fully active and
non-negotiable whenever `child_subject_policy.productChildRelated` is true.
Do not treat the absence of any other presence system as license to relax
this policy.

## Safe wording for child-related beats

Keep dialogue and prompt language for guardian-paired beats descriptive and
neutral: describe the guardian supervising, assisting, or sitting nearby;
never invent a caregiving claim, safety certification, or age-suitability
guarantee that was not supplied as evidence (see `claim-safety.md` — medical
and guarantee wording bans apply with extra weight to child-related claims).
