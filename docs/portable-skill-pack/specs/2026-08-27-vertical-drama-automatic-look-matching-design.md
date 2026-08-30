# Vertical Drama: automatic per-shot character-look matching

**Status:** approved for implementation  
**Date:** 2026-08-27  
**Scope:** sub-episode generation, storyboard shot character references, character-look slots, and the Characters tab

## Problem

The storyboard pipeline can currently ask the model to choose among character
variants, but it only supplies variants that already have an approved portrait.
When a shot clearly calls for a different age-stage or outfit and that variant
does not exist (or has no portrait), the requested look is lost. The user then
has to infer the missing look manually and repeat work in the Characters tab.

There is a second failure mode: semantically equivalent labels can be written in
slightly different Thai or English, causing repeated auto-created variants such
as `ชุดนอน`, `ชุดใส่นอน`, and `เสื้อผ้านอน` to accumulate.

## Goals

1. Select the best existing look separately for every shot.
2. Detect high-confidence semantic matches even when labels use close wording.
3. Create one reusable, portrait-less look slot when a required look is missing.
4. Persist the slot-to-shot relationship and show a clear waiting state.
5. Let the user replace a pending look with another existing look at any time.
6. Generate a detailed, consistent image brief for every proposed look.
7. Reuse the same slot on retries or regeneration; never inflate the roster.
8. Preserve manual shot choices and existing identity/tenant boundaries.
9. Keep wardrobe continuity believable without forcing a new outfit at every
   scene boundary.

## Non-goals

- Generate an image automatically or spend image-generation credits merely by
  creating a look slot.
- Change the user's manually selected shot references during regeneration.
- Infer a new human character from an outfit/age-stage mismatch.
- Rename or merge existing user-created variants silently.
- Make a pending look usable as an image reference before it has an approved
  portrait.

## Proposed behavior

### 1. Build a complete look catalog

The storyboard preparation step will load base characters and all child look
rows, including rows that have no approved portrait. Each look fact will carry:

- stable character key and parent key;
- look label and type (`outfit` or `age_stage`);
- description and wardrobe rules when available;
- portrait readiness;
- provenance (`user_created`, `story_detected`, or `system_suggested`).

The LLM will receive these as facts. A missing portrait will be visible as
“planned look / no approved reference” and must never be emitted as a normal
render reference by itself.

### 2. Two-stage per-shot matching

For each character present in a shot:

1. Normalize the shot text and look facts. Normalization includes Unicode NFC,
   whitespace/punctuation folding, Thai/English case folding, common Thai
   spelling variants, and a small maintained synonym vocabulary. Examples:
   `เข้านอน`, `นอนหลับ`, `คุยบนเตียง`, `pajamas`, and `sleepwear` map to the
   sleepwear intent; `เด็กทารก`, `เด็กแรกเกิด`, `เพิ่งคลอด`, and `newborn`
   map to the newborn intent.
2. Extract evidence per character, not just once for the whole shot. A cue
   attached to one named character, dialogue speaker, or action participant
   must not silently change every other character's look. Generic environment
   context (for example, merely being in a bedroom) is weaker than an explicit
   action (`กำลังเข้านอน`, `คุยอยู่บนเตียง`) or wardrobe statement (`สวมชุด
   ราตรี`).
3. Apply deterministic high-confidence rules for explicit age-stage, outfit,
   and context cues. A rule only wins when it has a clear positive signal and
   no conflicting signal. The maintained vocabulary must have a test fixture
   for each phrase, its canonical intent, signal strength, and known negative
   or ambiguous readings.
4. Resolve conflicts before ranking: incompatible age stages (newborn vs
   school-age), incompatible outfit requirements (sleepwear vs formalwear),
   and two different explicit outfits for the same character become `review`;
   the system must not pick the first matching phrase by array order.
5. For cases not resolved confidently, let the storyboard model rank only the
   catalog facts and return a structured candidate, reason, evidence spans,
   and confidence. If the model is unavailable, malformed, or below threshold,
   use the deterministic safe result (`base`/current compatible look plus
   `review`) and continue the pipeline.
6. Validate the candidate against the same normalized catalog. Unknown keys,
   contradictory family members, unsupported evidence, and weak matches are
   rejected; no free-form model label may directly create a database row.

The result is one look decision per base character per shot:

```json
{
  "baseCharacterKey": "char-nuna",
  "selectedLookKey": "char-nuna-sleep",
  "mode": "matched_existing",
  "reason": "ช็อตระบุว่าตัวละครคุยกันบนเตียงก่อนนอน",
  "confidence": 0.96
}
```

When no existing look is a valid match, the decision becomes
`needs_new_look` and contains a canonical requested-look identity plus a
detailed image brief. A neutral scene with no look cue remains on the base
character and does not create a slot.

### 3. Prevent duplicate look slots

Before inserting a suggested slot, search within the same parent character and
series using a semantic identity, not raw label equality. The identity is based
on:

- normalized look type;
- normalized intent/category (for example `sleepwear`, `newborn`,
  `evening_formal`);
- normalized description/wardrobe facts;
- an optional stable semantic key produced by the matcher.

Matching priority:

1. exact stable semantic key;
2. same parent + same type + same canonical intent **and compatible concrete
   wardrobe facts**;
3. same parent + high similarity across normalized label, description, and
   wardrobe attributes.

Canonical intent alone is not enough to merge two user-created looks. Distinct
garment silhouettes, colors, uniforms, accessories, or age-stage details
remain distinct when those facts are explicit. Category-only reuse is safe for
a system suggestion whose facts are still generic, or when the existing row is
demonstrably the same look. Dedupe must never silently erase a meaningful
user-created variant merely because both labels say “ชุดราตรี”.

If a candidate row exists, update only missing/derived suggestion metadata and
reuse its character key. Do not create another row. If several existing rows
are close, choose the one with an approved portrait; otherwise choose the most
recent compatible row and mark the ambiguity for the user rather than creating
another variant.

The insert path must be race-safe and idempotent. A retry of sub-episode
generation must converge on the same row and the same shot assignment.

The idempotency boundary is `(tenantId, userId, seriesId, episodeId,
shotNumber, parentCharacterKey, semanticKey, planRevision)`. A retry must first
re-read the current roster and current frame before inserting or overwriting
anything. The semantic slot key is stable; a database-generated row id or a
raw label is not a valid dedupe key.

### 4. Natural wardrobe continuity and rotation

Matching must consider the episode's ordered shot sequence, not only the text of
the current shot. The matcher will maintain a per-character look timeline with
scene, time-of-day, location, and the last selected look. It will apply these
rules:

- Keep the same look across adjacent shots in one continuous scene unless the
  script explicitly says the character changed clothes, aged, or moved to a
  context that makes the look impossible.
- Treat a meaningful time jump, location change, or new story situation as an
  opportunity to change look, but not as a mandatory change. A scene transition
  alone must never create a new slot.
- Penalize choosing the exact same look after a meaningful transition when
  another compatible existing look is available. Prefer an existing compatible
  look that has not just been used, while preserving age-stage and story
  constraints.
- Prefer reusing an older compatible look after a cooldown (for example, after
  several intervening shots or a later scene) rather than creating another
  look. Outfit rotation is a soft preference; explicit script facts always win.
- Do not rotate looks during a newborn/age-stage continuity block merely to add
  variety. Age-stage correctness outranks wardrobe variety.
- A single look may be reused in multiple scenes when the story gives no
  credible reason for a wardrobe change. The system should not manufacture
  clothing changes just to fill the look catalog.

The candidate score is therefore based on three independent signals:

1. **Story fit:** explicit age/outfit/context evidence in this shot.
2. **Continuity:** compatibility with adjacent shots and the current scene.
3. **Variety/reuse:** a soft penalty for immediate repetition and a soft bonus
   for reusing a compatible older look.

Story fit is dominant, continuity is next, and variety is last. If all existing
looks are poor fits, create one canonical missing-look slot only when the shot
contains a clear look requirement. If the shot has no clear requirement, retain
the current compatible look even when it repeats.

### 5. Pending look state and user override

Each affected shot will persist a look assignment separate from the ordinary
`requiredCharacterRefs` list, so the system can distinguish:

- a ready existing look;
- a pending look slot without a portrait;
- a user override to another ready look.

For `needs_new_look`:

- the shot is marked `waiting_for_character_look`;
- the pending slot key, requested label, detailed brief, and source shot are
  shown in the storyboard;
- image generation for that shot is blocked while the pending assignment is
  active;
- no image-generation credit is spent by the slot creation.

The user can choose “ใช้ลุคอื่น” and select another compatible look. That action
sets an explicit user override, clears the waiting blocker, marks the frame's
character references customized, and makes later automatic regeneration leave
the choice untouched. Choosing a look with no portrait keeps the shot waiting
with that look instead of silently falling back.

When the pending slot receives an approved portrait, the shot remains linked to
the same stable slot key and becomes renderable after the normal readiness
refresh. No re-generation of the storyboard is required.

### 6. Characters tab presentation

Suggested slots will appear nested under the owning character like other
variants, with:

- a clear “แนะนำจากช็อต …” / “Suggested from shot …” badge;
- the canonical look label;
- the full image brief, not only a short label;
- “ยังไม่มีภาพ — ช็อตกำลังรอลุคนี้” / “No portrait — shot is waiting” status;
- a single action to create the portrait;
- a link back to affected shots.

Existing rows must not be relabeled as system suggestions merely because they
were matched by the new algorithm.

### 7. Image-brief quality contract

The generated brief for a new look will be assembled from the character's
identity facts plus the shot's explicit evidence. It must include, when known:

- age/life stage and approximate age;
- outfit type, garment pieces, material, color, fit, and condition;
- hair/makeup/accessories that distinguish the look;
- pose/action/context only as needed to explain why the look is required;
- framing and lighting suitable for a reusable character reference portrait;
- identity-lock instruction to preserve the same person while changing only the
  requested look;
- negative constraints against wrong age, wrong outfit, duplicate people,
  text/watermarks, and accidental scene backgrounds.

Short source text must be expanded with structured character facts and the
canonical look intent. The system must not copy a one-line shot summary as the
entire image prompt.

Every brief is stamped with a prompt-contract version and carries a stable
separation between identity facts, requested look facts, shot evidence, and
negative constraints. Identity facts are immutable inputs; shot evidence may
explain why the look is needed but must not override the character's face,
body identity, or age-stage rules. If a required fact is unknown, the prompt
must choose a conservative, internally consistent default and state it rather
than inviting unconstrained invention. The generated brief is bounded in
length, redacted of provider/debug details, and is reused on retry so a retry
does not drift to a different outfit without a user edit.

### 8. Recovery and partial-failure contract

Automatic look resolution is an enrichment step and must not strand the parent
episode-generation workflow. Each phase reports a durable outcome, but no
unresolved look decision may become an unhandled exception or an indefinite
client spinner:

| Phase | Durable outcome on failure | Next safe action |
| --- | --- | --- |
| Catalog/readiness read | retain the previous refs and mark enrichment degraded | retry on the next plan refresh; user can choose a look manually |
| Semantic selection | keep the current compatible look and add `review` only when evidence is ambiguous | user chooses another look or keeps current |
| Slot materialization | re-read by stable semantic key; if still absent, do not emit a fabricated key | continue with prior refs and record a bounded diagnostic |
| Assignment/frame persistence | retry the same idempotency boundary; reconcile slot and frame on reload | never create a second slot |
| Portrait generation | keep the slot, store bounded failure/retry metadata, keep the shot waiting | retry generation or choose another look |
| Final render submission | run a fresh approved-portrait check before credit reservation/provider submission | show the exact pending look and recovery action |

Retries use bounded exponential backoff and a terminal, user-readable state;
they must not poll forever. A background or next-page reconciliation pass must
repair the two partial states “slot exists, assignment absent” and “assignment
exists, slot missing” by reusing the semantic key or reverting that shot to its
last safe reference. If a user deletes a suggested slot, all affected pending
assignments become `review`/base-compatible rather than retaining a dangling
selected key. User-visible diagnostics must include shot number, character,
look label, current state, and one actionable next step, without provider
stack traces or tenant-sensitive data.

## Data and contract boundaries

- Reuse `vertical_drama_characters` variant rows for durable look slots; use
  their existing `needsSetup`/portrait readiness behavior.
- Store shot-local assignment/proposal metadata in the existing episode
  storyboard/start-frame JSON contract unless live schema inspection proves a
  dedicated table is required for query volume or concurrency. The persisted
  assignment shape is normative and additive:

  ```ts
  type CharacterLookAssignment = {
    baseCharacterKey: string;
    selectedLookKey: string;
    mode: "base" | "matched_existing" | "needs_new_look" | "manual_override";
    status: "ready" | "waiting_for_portrait" | "review";
    canonicalIntent?: string;
    requestedLabel?: string;
    imageBrief?: string;
    reason: string;
    confidence: number; // normalized 0..1
  };
  ```

  `waiting_for_character_look` is a derived UI/readiness label, not a second
  persisted enum. A frame is waiting when any assignment has
  `status: "waiting_for_portrait"` and its selected look has no current
  approved portrait.
- `selectedLookKey` and `requiredCharacterRefs` describe the logical look
  selected for planning and continuity. They are not proof that a provider
  may receive an image reference. At the final attachment boundary, resolve a
  separate transient `renderableReferenceRefs` set from current approved
  portraits; a pending look must never be submitted to an image/video
  provider. A fresh readiness check must run at submit time, so a portrait
  generated after plan creation unlocks the same stable slot without plan
  regeneration.
- Keep base-character family identity separate from look selection so the same
  person is never attached twice in one shot through both base and variant keys.
- All reads and writes remain scoped by tenant, user, and series/episode owner.

### 9. Assignment lifecycle and compatibility rules

The lifecycle is deterministic and must be safe to replay:

```text
base/matched_existing + ready
          │
          ├── explicit missing look ──> needs_new_look + waiting_for_portrait
          │                                  │
          │                                  ├── portrait approved ──> ready
          │                                  └── user chooses another look
          │                                      └── manual_override + ready/waiting
          └── contradictory or low-confidence cue ──> review
```

- `manual_override` is authoritative for that shot until the user explicitly
  clears or replaces it; later plan regeneration may refresh explanations but
  must not replace its selected key.
- `review` is non-blocking for planning but must be visible and must not cause
  an automatic new slot or paid render with an unsupported reference. The UI
  must offer a ready-look picker or an explicit “keep current look” action.
- Status is recalculated from the current portrait asset at every render
  boundary and after Characters-tab asset mutations. Persisted status is a
  cacheable display hint, never the sole readiness authority.
- Legacy frames with no assignment array remain valid. Their effective mode
  is `base` and their existing reference behavior is preserved byte-for-byte.

## Failure and safety rules

- If matching confidence is low, do not create a new slot automatically; keep
  the base look and expose an optional review suggestion.
- If a look repeats across a transition, that is a review signal, not an
  automatic instruction to create a new look. Creation requires a clear
  wardrobe/age-stage need or an explicit user-approved suggestion.
- If two existing looks are semantically tied, prefer the approved one and show
  the reason; do not create a third look.
- If the source shot has contradictory cues (for example newborn and school
  uniform), mark the assignment for review instead of guessing.
- If slot creation succeeds but assignment persistence fails, retry idempotently
  and never leave an orphaned duplicate row.
- If portrait generation fails, retain the slot and show its failure/retry state;
  do not delete the slot or silently unblock the shot.

## Verification targets

Server tests should cover Thai/English synonym matching, exact-vs-semantic
deduplication, ordered-shot continuity, time/location transitions, cooldown
reuse, conflicting cues, retry/race convergence, pending assignment
serialization, approved-portrait transition, and preservation of manual
overrides. Client tests should cover the waiting badge, affected-shot links,
“use another look”, and the Characters-tab suggested-slot actions. A browser
pass must confirm the actual create-sub-episode flow and the blocked/unblocked
shot states; unit tests alone do not prove that flow.
