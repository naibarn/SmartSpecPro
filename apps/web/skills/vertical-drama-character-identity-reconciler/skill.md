---
name: Vertical Drama Character Identity Reconciler
description: Read one Vertical Drama series' current character roster, its Story Bible's canonical cast, and per-character occurrence facts, then decide which roster rows are actually the SAME person under a drifted/short-form spelling versus genuinely distinct characters.
version: 1.0.0
category: other
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: users
tags:
  - vertical-drama
  - character
  - identity
  - deduplication
  - repair
trigger_patterns: []
priority: 50
config:
  media_studio:
    auto_learning:
      enabled: false
      prompt_qa_after_auto_prompt: true
      image_qa_after_generation: true
      require_admin_approval: true
      min_prompt_score_to_pass: 85
      min_image_fidelity_score_to_pass: 80
      max_auto_patch_risk: medium
  orchestration:
    mode: local
    endpoint: null
    skillTargets: []
    parallel: false
    fallback: local
---
# Vertical Drama Character Identity Reconciler

You are given one Vertical Drama series' CURRENT character roster (every roster row's
`character_key`, its exact stored `name`, its role fields, and where it came from), the
series' Story Bible's canonical cast (`bible_characters` — each with a full `name`,
`narrative_role`, `role_tier`, `occupation`), and, per roster row, plain occurrence facts
computed from the drafted story text: how many shots cast that EXACT name, how many
dialogue lines that EXACT name spoke, and which episode numbers it appeared in, plus any
alias already recorded for it.

Your job is creative/narrative judgment, not code: **decide which roster rows are actually
the SAME character, appearing under a different spelling, short form, or romanization —
and which roster rows are genuinely different people.** The calling app never merges,
deletes, or renames anything itself; it only ever proposes what you decide, for a human to
confirm.

## Why this problem cannot be solved by string similarity — read this first

A roster row's `name` may be a drastically different SPELLING of the same person, not a
typo. Thai script and a romanized form of the same name can share **zero characters**
(`คิริน` vs `Kirin`) — ordinary edit-distance / fuzzy-string matching cannot catch this at
all, and a low string-similarity score must never be treated as evidence of "not a
duplicate." The reverse is equally true: two names that LOOK similar can be genuinely
different people (two different offices, two different minor characters who happen to
share a common short name). You must read the actual narrative evidence — occurrence
counts, which episodes a name appears in, and (most importantly) what the character
actually DOES in the story — not the spelling of the name itself.

Return ONLY valid JSON:

```json
{ "contract_version": 1, "groups": [...] }
```

Each entry in `groups` MUST have:
- `canonical_character_key` — the `character_key` of the roster row you judge should
  SURVIVE as the one true row for this person (pick the row whose stored `name` reads as
  the most complete / most narratively "correct" form when several candidates are close —
  the calling app will itself further prefer whichever member's name exactly matches a
  `bible_characters` entry, so you do not need to solve that tie-break perfectly yourself).
- `duplicate_character_keys` — the `character_key`s of every OTHER roster row that is the
  SAME person as the canonical row. Empty array (`[]`) when this roster row is not a
  duplicate of anything else in the roster.
- `reasoning` — a short, concrete explanation citing the actual evidence that convinced
  you (occurrence counts, matching bible name, matching role/occupation, a specific scene
  where both spellings clearly refer to the same person doing the same thing).
- `confidence` — your confidence this grouping is correct, `0` to `1`.

**Every `character_key` in the roster you are given MUST appear in exactly one group** —
either inside some group's `duplicate_character_keys`, or as some group's own
`canonical_character_key`. A roster row that is not a duplicate of anything still needs its
own group (`canonical_character_key` = its own key, `duplicate_character_keys: []`). Never
invent a `character_key` that isn't in the roster you were given, and never omit a roster
row from the output entirely — an omitted row is a row nobody could act on.

This skill does not delete, filter, or judge whether a name is "junk" (e.g. a mislabeled
sound cue or prop that leaked into the roster as if it were a speaking character) — that is
a different problem the calling app handles elsewhere. Every such row still needs a group of
its own here, same as any other genuinely-distinct roster row.

## Reading the evidence — what actually proves two rows are the same person

Trust, in roughly this order:
1. **An exact `bible_characters` name match.** If a roster row's `name` is IDENTICAL to a
   `bible_characters` entry's `name`, that roster row is almost certainly the canonical
   form of that bible character — other roster rows that are clearly the same person
   should be grouped as duplicates of it.
2. **High occurrence overlap with no bible match at all.** When several roster names never
   appear together in the same episode/shot, and one of them is used far more often than
   the others, treat the widely-used one as the natural canonical short form — this is a
   real signal, not a coincidence, when the story consistently uses one spelling far more
   than the rest.
3. **Narrative/contextual proof, independent of spelling.** The single strongest kind of
   evidence: a scene where a name is used to describe/address a character doing something
   that only the "other" name's row could be doing (their established job, their
   relationship to another named character, a distinctive action tied to their arc). A
   character being addressed BY NAME in dialogue by a third character is very strong
   evidence for identity, regardless of how different that name's spelling looks from a
   roster row's stored `name`.
4. **Per-episode consistency of a spelling.** If a whole episode consistently uses one
   spelling and a neighboring episode consistently uses a different one, while the roles/
   actions described are otherwise the same, that is the signature of the same person
   drifting across episodes, not two different people.

Do NOT merge purely because two names are phonetically close if the occurrence and
narrative evidence points the other way (e.g. two clearly different named minor characters
who happen to have similar-sounding short names, appearing in unrelated episodes, doing
unrelated things). When genuinely unsure and the evidence is thin, prefer a LOWER
`confidence` value over refusing to propose a group at all — the human reviewing your
proposal is the actual safety net, not you withholding a guess.

## Worked example — spelling drift across episodes (the common case)

Input roster + facts (abbreviated):

```json
{
  "contract_version": 1,
  "bible_characters": [
    { "name": "คิริน วัฒนเมธา", "narrative_role": "protagonist", "role_tier": "lead_male", "occupation": "engineer" },
    { "name": "ลลิน ศิริกุล", "narrative_role": "co_protagonist", "role_tier": "lead_female", "occupation": "flight-ops coordinator" }
  ],
  "roster": [
    { "character_key": "kirin", "name": "คิริน", "shot_character_occurrences": 176, "dialogue_speaker_occurrences": 190, "episodes_seen_in": [1,2,4,5,6,7,8,9,11,15,16,17,18,19,20] },
    { "character_key": "character-2", "name": "คีริน", "shot_character_occurrences": 32, "dialogue_speaker_occurrences": 33, "episodes_seen_in": [10,13,19] },
    { "character_key": "character-3", "name": "Kirin", "shot_character_occurrences": 14, "dialogue_speaker_occurrences": 20, "episodes_seen_in": [3] },
    { "character_key": "character-4", "name": "กิริน", "shot_character_occurrences": 9, "dialogue_speaker_occurrences": 12, "episodes_seen_in": [14] },
    { "character_key": "character-5", "name": "คิรัน", "shot_character_occurrences": 5, "dialogue_speaker_occurrences": 7, "episodes_seen_in": [12] },
    { "character_key": "lalin", "name": "ลลิน", "shot_character_occurrences": 187, "dialogue_speaker_occurrences": 194, "episodes_seen_in": [1,2,4,5,6,7,8,9,11,15,16,17,18,19,20] },
    { "character_key": "character-6", "name": "ลลิณ", "shot_character_occurrences": 23, "dialogue_speaker_occurrences": 31, "episodes_seen_in": [10,13] },
    { "character_key": "character-7", "name": "Lalin", "shot_character_occurrences": 16, "dialogue_speaker_occurrences": 20, "episodes_seen_in": [3] },
    { "character_key": "character-8", "name": "ลลนารี", "shot_character_occurrences": 6, "dialogue_speaker_occurrences": 6, "episodes_seen_in": [12] }
  ]
}
```

Episode 12's actual shot text (not shown above, but part of what you are handed as the
season script) shows `ลลนารี` investigating flight-ops AOG records — exactly
`ลลิน ศิริกุล`'s established job — and the antagonist addressing her directly as
"คุณเก่งนะลลนารี" in dialogue, while `คิรัน` in the same episode finds duplicated shift
rosters — exactly `คิริน วัฒนเมธา`'s job. That in-scene address by name plus matching
occupation is decisive: these are the same two people under episode 12's own drifted
spelling, not two new characters.

Output:

```json
{
  "contract_version": 1,
  "groups": [
    {
      "canonical_character_key": "kirin",
      "duplicate_character_keys": ["character-2", "character-3", "character-4", "character-5"],
      "reasoning": "คิริน is used in 15 of 20 episodes and exactly matches the bible's คิริน วัฒนเมธา. คีริน/Kirin/กิริน/คิรัน each appear in exactly one otherwise-orphaned episode, doing the engineer's job (finding duplicated shift rosters in ep.12 as คิรัน) that only this character has — per-episode spelling drift of the same protagonist, never co-occurring with another คิริน-family name in the same episode.",
      "confidence": 0.95
    },
    {
      "canonical_character_key": "lalin",
      "duplicate_character_keys": ["character-6", "character-7", "character-8"],
      "reasoning": "ลลิน is used in 15 of 20 episodes and exactly matches the bible's ลลิน ศิริกุล. ลลิณ/Lalin/ลลนารี each appear only in the same isolated episodes as their คิริน-family counterparts above; ep.12's ลลนารี is directly addressed by name while investigating flight-ops AOG records — ลลิน ศิริกุล's own established job.",
      "confidence": 0.95
    }
  ]
}
```

## Worked example — a genuinely distinct minor character (do NOT merge)

Two roster rows, `น้องมิ้น` (a schoolmate appearing once in episode 5, no dialogue lines,
never seen again) and `มิ้น` (a completely different bar hostess character appearing in
episodes 14-16 with her own distinct arc and dialogue). Despite the near-identical short
name, the occurrence facts show they never appear in the same episode, and the season
script shows two unrelated people in unrelated settings with no scene connecting them.
Output keeps them as two separate singleton groups rather than merging on name similarity
alone:

```json
{
  "contract_version": 1,
  "groups": [
    {
      "canonical_character_key": "nong-min",
      "duplicate_character_keys": [],
      "reasoning": "Appears once in episode 5 as a schoolmate with no dialogue; no narrative connection to มิ้น the bar hostess in episodes 14-16 — different setting, different role, never referenced together.",
      "confidence": 0.8
    },
    {
      "canonical_character_key": "min-hostess",
      "duplicate_character_keys": [],
      "reasoning": "A distinct recurring bar-hostess character across episodes 14-16 with her own dialogue and arc, unrelated to the one-off schoolmate mention in episode 5.",
      "confidence": 0.85
    }
  ]
}
```
