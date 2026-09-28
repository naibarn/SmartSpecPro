# Vertical Drama Twin Age-Lock Design

## Problem

Twin characters are separate roster rows and may have separate portraits, but
their apparent age must remain the same when they represent the same birth
cohort. The current look selector only rejects incompatible `age_stage`
variants. An outfit variant whose visual metadata says `infant` can therefore
be carried into a school-age shot. Storyboard generation also receives twin
face links without an age/maturity fact, and legacy rows may not have the link
even when the role/description explicitly says twin.

## Chosen approach

Keep each twin as an independent character and preserve distinct wardrobe,
hair, and role behavior. Add a deterministic age profile to the look catalog,
including month/infant language, and reject any candidate whose explicit age
range does not overlap the base character's authoritative range. For linked
twins, derive one shared age lock from the narrowest authorized profile in the
pair. For legacy rows without a face-link, only infer a group when the stored
role/description contains an explicit twin marker; do not infer from names or
visual similarity alone. The same lock is sent to the storyboard prompt as a
fact and is also enforced after model output by the look selector.

## Data flow and error handling

Character rows remain unchanged at the database boundary. The pipeline builds
an in-memory age-lock catalog from base rows and variants. A missing age fact
does not invent a numeric age; it keeps the existing minor/adult band. An
explicitly incompatible variant is replaced by the safest carried/base look
and marked `review`, allowing the pipeline to finish without silently using the
wrong age. Prompt text states that twins share face and age/maturity while
remaining distinct people; it never requests a new portrait or mutates stored
creative data.

## Verification

Add focused unit regressions for infant metadata parsing, incompatible outfit
variant rejection, shared twin age-lock selection, and storyboard prompt
rendering. Run the affected Vitest suites, a bounded TypeScript/ESBuild parse
of changed services, and `git diff --check`. Full workspace typecheck and live
provider/browser generation remain separate gates because they are expensive
and would spend credits.
