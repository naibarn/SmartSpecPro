# Specification: Dynamic Casting Age Consistency

## Problem

Portrait candidates for one Drama Series character are generated from separate
candidate prompts and separate image tasks. The current contracts contain age fields in
some paths, but do not resolve one authoritative apparent-age range before the batch.
The first candidates can therefore look young and attractive while later candidates
look materially older.

## Product outcome

For every casting batch, derive one role-aware age profile from the target character's
authoritative story/DNA context. Use that profile in every candidate prompt and snapshot.
Different characters may receive different ranges, and an intentional age gap remains
visible. The system must not replace story logic with one global age default.

## Source precedence

The resolver uses this order:

1. Explicit story/character age or age range, when present and valid.
2. Approved `visualBible.ageRange` or structured `designDna.ageRange`.
3. An age-stage variant contract, preserving child/teen/adult life-stage semantics.
4. Role, occupation, relationship, story world, audience, and narrative context to
   infer a bounded range once.
5. If no safe range can be derived from either facts or meaningful role/story context,
   fail closed with a clear request to add age context; existing characters with a
   usable role/description should normally reach the role-inference stage. Do not
   silently invent 24–25 for every character.

Role examples such as student 17–19, young working adult 22–25, and older lead 30–35
are contextual inference outcomes, not one universal mapping. Optional clothing, pose,
framing, or reference-guidance text cannot override canonical story age.

## Technical contract

Introduce a typed `CharacterCastingAgeProfile` at the server boundary containing a
bounded numeric minimum/maximum, a human-readable label, source (`story_fact`,
`approved_dna`, `age_stage_variant`, or `role_inference`), confidence, and a short
non-sensitive rationale. The resolver is pure and testable; it does not read the DB.
The caller supplies facts from the already authorized character/context loader.

The normal candidate path resolves the profile once before building the candidate-batch
prompt. The request includes a server-authoritative age directive and requires one
shared range across all returned candidate DNA records. The validator rejects material
candidate `age_range` drift or missing age directives and uses the existing bounded
retry/fail-closed behavior.

The reference-guided path uses the same profile to populate `age_min`/`age_max` for
`character-candidate-prompt`. Its input JSON/schema must permit age-appropriate values
below 18, while retaining child-safety and non-sexualized presentation rules. The one
plain-text prompt is reused for each independent image task, and must state the shared
range plus the new-fictional-person/reference-guideline restriction.

The resolver and imported skill schema must share the existing validated age-stage lower
bound rather than retaining the current adult-only minimum of 18; 17–19 must be covered
by contract tests.

Candidate metadata/snapshots carry the resolved profile so selection and later audit can
explain which age contract was used. Existing approved DNA age data must not be lost when
the no-primary recast path removes face-lock fields.

## UI behavior

Do not add a required age input. In the casting controls or preview summary, show a
read-only explanation such as “ช่วงอายุจากบทบาทตัวละคร: 17–19 ปี” and its inferred/source
label. If the source is ambiguous and generation is blocked, explain which character
fact is missing. Keep the existing count selector, reference controls, selection,
regeneration, and downstream boundaries unchanged.

## Safety and failure handling

- Reject invalid ranges (`min > max`, unreasonable bounds, or missing source).
- Preserve age-stage/child rules and prohibit sexualized presentation for under-18
  profiles.
- If explicit age conflicts with inferred role context, explicit canonical story fact
  wins and the conflict is recorded for diagnostics.
- If a model returns different ranges across candidates, do not submit images from that
  batch until the existing retry or regeneration path produces a consistent set.
- No new table, migration, dependency, provider, classifier, or automatic downstream
  regeneration is introduced.

## Acceptance criteria

1. Five candidates for one character share one resolved apparent-age range.
2. Student, working-adult, and older-lead examples resolve contextually.
3. Two leads in an age-gap story resolve independently.
4. Explicit/approved DNA age facts take precedence over role inference.
5. Reference-guided input accepts 17–19 and preserves safety language.
6. Normal and reference candidate paths carry the same age profile contract.
7. Age drift is caught before provider submission.
8. No-reference behavior and all post-selection/downstream flows remain compatible.
