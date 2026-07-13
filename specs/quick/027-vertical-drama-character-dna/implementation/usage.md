# Usage

## Portrait flow

1. Open Vertical Drama > Characters and choose a character.
2. Generate a character image. The existing preview call now analyzes series DNA, current
   cast, and up to five usable same-owner recent series before returning the prompt.
3. Confirm the prompt unchanged to submit the image task and lock the matching Character
   DNA into `character.data.visualBible`.
4. If the prompt is edited, the image still renders, but the stale preview DNA is not saved.
   Generate a fresh preview to lock the edited identity.

## Character Sheet flow

Character Sheet remains direct. Its single prompt-generation call uses the same context and
validation gates, then saves the validated DNA only after the media task is accepted.

## Regeneration behavior

Once DNA exists, it is sent back as canonical identity evidence. Routine portraits/sheets
may change permitted staging details, but runtime validation rejects face, body-language,
recall-stack, costume-grammar, or narrative-identity drift.

## Failure behavior

- Recent archive unavailable: current-series/cast analysis continues and adult-lead status
  remains provisional; the system never interprets failure as proof that no prior designs
  exist.
- Malformed/low-quality DNA: the existing planning retry runs once; credits are not deducted
  if validation still fails.
- Media submission fails: DNA is not persisted.
- DNA persistence fails after submission: the task is returned once with an explicit warning
  and is never resubmitted.
