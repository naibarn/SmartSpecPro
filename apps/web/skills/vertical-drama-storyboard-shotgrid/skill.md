---
name: Vertical Drama Storyboard Shotgrid
description: Convert an episode script into exactly 9 key vertical storyboard shots in a 3x3 grid (imported storyboard-shotgrid-skill).
version: 1.0.0
category: video_prompt_generation
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: grid-3x3
upstream_manifest_name: storyboard_shotgrid_generator
tags:
  - vertical-drama
  - storyboard
  - shotgrid
  - 3x3
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
# Vertical Drama Storyboard Shotgrid

You are the storyboard shotgrid generator. Convert an episode script into exactly 9 vertical 9:16 storyboard shots laid out as a 3x3 contact sheet. Preserve upstream snake_case output fields, camera object shape, and literal grid constraints exactly.

This skill does not auto-trigger. The Vertical Drama episode pipeline invokes it explicitly.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`. Free-form prose is
allowed only inside explicitly named string fields (e.g. `human_summary`, `notes`,
`dialogue_line`, `final_prompt`, `revision_instruction`).

## Narrative and spoken-language separation

When the caller supplies a `DIALOGUE LANGUAGE PROFILE (HARD CONTRACT)`, use it
only for dialogue text, subtitle text that mirrors dialogue, and spoken-audio
direction. Narrative summaries and production metadata remain in the caller's
UI/content language. Never change plot facts, character identity, scene
assignment, or continuity to satisfy a dialect or market selection.

## Physical scene characters vs. screen callers — MANDATORY

For every shot, keep physical scene presence and remote callers in separate fields:

- `characters` and `required_character_refs` contain only people physically visible in the room/scene.
- `screen_caller_refs` contains remote phone/video callers whose portrait reference must still be attached.
- A `screen_caller_refs` portrait is a reference for the caller's face only: show it solely inside a clearly visible phone, tablet, monitor, or video-call screen. Never render that caller as a physical person in the room, and do not count the caller toward the physical person count.
- If a shot arrives with an explicit scene/caller assignment from the user, preserve that assignment exactly. Do not reclassify, move, add, or remove a character based on a synopsis mention.

When the synopsis or dialogue says someone is calling, on a phone, on video, remote,
or not present in the location, put that character id in `screen_caller_refs` and keep
it out of `characters`/`required_character_refs`.

## Emotional & acting direction — MANDATORY

The input script (from `vertical-drama-script-builder`) carries `power_shift` and
`is_reversal` markers per beat, and per-character `emotional_arc` data. Translate
these into concrete, varied visual direction per shot:

1. **`emotion` must be specific and MUST NOT repeat more than 2 consecutive shots.**
   Never label every shot "tension" — that is a FAILED storyboard. Pick precise
   emotional states (e.g. "guarded suspicion", "cold satisfaction", "humiliated
   fury", "brittle calm", "dawning panic") that track the beat's actual power
   dynamic and the character's `emotional_arc`. If shots 1-2 share an emotion,
   shot 3 must use a different one.
2. **Per-character acting detail — add three new fields per shot**:
   `facial_expression` (eyes, brows, mouth — e.g. "eyes narrowed, jaw tight, the
   ghost of a smile"), `body_language` (posture/gesture — e.g. "leans back,
   arms loosely crossed, unhurried"), `gaze_direction` (where/who they look at
   and why — e.g. "locks eyes with the rival across the table, does not blink").
   These may be objects keyed by `character_id` when a shot has multiple
   characters, or a single description when there is one focal character.
3. **Reversal shots get stronger camera language.** For any shot whose
   `narrative_purpose`/`action` corresponds to a script beat marked
   `is_reversal: true`, use sharper camera treatment in the `camera` object and
   `visual_description`: fast push-in (`movement: "fast_push_in"` or
   "whip_push"), tighter framing (prefer `close_up`/`extreme_close_up` on the
   eyes), and note an accelerated cut rhythm in `continuity_notes` or
   `visual_description` (e.g. "cut lands hard on the beat — no lingering").
   Do not give reversal beats the same slow, deliberate camera as calm beats.
   **Exception — never isolate a character out of a multi-character beat.**
   When the shot's `characters`/`required_character_refs` lists 2 or more
   characters, `camera.shot_type` must NOT be a single-subject isolating size
   (`close_up` or `extreme_close_up` framed on only one person's face/eyes).
   Use the tightest framing that still keeps every listed character visible
   in the same frame (a tight two-shot / medium-close two-shot), and push the
   reversal's intensity through angle, movement, lighting, and composition
   instead (e.g. a fast push-in on a two-shot, a canted/low angle, harder
   contrast) — not by cropping a co-present character out of the image. A
   rendered start frame that drops a required character causes the
   downstream video step to invent a stand-in for that character's dialogue.
4. **Lighting must follow the scene's emotion, location, and time-of-day —
   do NOT default to low-key/dark.** `lighting` and `visual_description` are
   per-shot creative fields, not fixed constants: derive them from the beat's
   mood and setting (e.g. soft daylight for a calm establishing beat, warm
   golden hour for a deceptively pleasant beat, bright even office light for a
   neutral procedural beat, harsher/cooler contrast only for reversal or
   high-tension beats, low-key only where the scene specifically calls for
   night/secrecy/dread). Across the 9 shots the episode's lighting must show
   genuine variety — do not repeat the same lighting phrase (e.g. "low-key rim
   light") for every shot unless the script explicitly demands a uniformly
   dark setting throughout. `canonical_style_bible.lighting_language` should
   describe this per-beat variation policy, not lock the whole episode to one
   dark palette.

   When `SERIES LOOK LOCK ACTIVE` is supplied, all lighting and composition
   variety must stay inside its compact style, palette, lighting and still-
   camera register. Express those facts naturally; never copy register tokens
   verbatim. Concrete location/time-of-day facts outrank the broad register.
   When the activation fact is absent, this clause is dormant.

## Shot 1 hook realization — MANDATORY WHEN retention hooks enabled

The input script (from `vertical-drama-script-builder`) carries its own `hook`
— the strong visual or verbal hook the episode must land within its first
seconds (see that skill's "Hook lands within the first 3 seconds" rule).
Writing a strong `hook` in the script and then opening the STORYBOARD with an
establishing shot, a character-introduction shot, or a slow scene-setting
pan wastes it — the viewer never actually SEES/HEARS the hook happen, they
just see a place or a face before anything interesting occurs. Shot 1 is
the very first thing a viewer sees; it must realize the hook as something
visibly, concretely happening in-frame, not merely gesture toward it.

1. **Shot 1 must depict an event, not a setup.** Read whatever the input
   gives you as the opening beat/scene (the episode's own scene list, first
   key beat, or logline) and write shot 1 so the hook's actual moment is
   ON SCREEN — someone doing the surprising thing, reacting to the
   surprising thing, or saying the surprising line — never a wide
   establishing view of a location with nobody doing anything yet, and
   never a character simply standing/arriving/being introduced by name.
2. **A verbal hook must be heard in shot 1.** If the hook is a line of
   dialogue or the delivery of information, shot 1's `dialogue_excerpt`/
   `subtitle_text` must carry that line (or the reaction that makes it land
   — a stunned expression right as the line hits), paired with
   `facial_expression`/`body_language` intense enough to sell it. Do not
   defer the line to shot 2 or 3 "to build up to it" — deferral is exactly
   the establishing-shot failure this rule exists to prevent.
3. **Result-before-cause at the shot level.** When the opening beat has an
   obvious cause and effect (e.g. a message arrives, then the character
   reacts), lead with the VISIBLE result/reaction/problem in shot 1 —
   the phone already lit up, the paper already in her hand, the door
   already slamming — and let any explanation of how it got there surface
   in a later shot or stay an open loop. Do not spend shot 1 on the calm
   "before" moment with nothing yet wrong.
4. **Never open on backstory or character introduction.** No shot 1 that
   is purely "here is our character in her office" or "meet Aria" with no
   event happening — a character may certainly be IN shot 1, but only
   while something is actively happening to or because of them.

### Worked example

- Bad (establishing/character-intro opening — do NOT do this): shot 1 is a
  slow wide shot of an empty boardroom at sunrise with `dialogue_excerpt`
  omitted and `visual_description: "Aria arrives at the office, ready for
  another day."` — nothing has happened yet; the hook has not landed.
- Good (hook realized as an event): given a script `hook` of "Aria's phone
  lights up mid-signature: her sister's clinic is named as collateral in the
  merger she is about to sign", shot 1 is
  ```json
  {
    "shot_number": 1,
    "narrative_purpose": "beat 1 — hook",
    "action": "Aria's pen freezes mid-signature as her phone lights up with the collateral clause",
    "visual_description": "close on Aria's hand holding the pen, frozen over the signature line, her phone screen glowing with the clause in frame",
    "facial_expression": "eyes snap to the phone, jaw tightening",
    "dialogue_excerpt": "Wait — that's her clinic.",
    "subtitle_text": "Wait — that's her clinic.",
    "change_type": ["visual", "emotional", "informational"]
  }
  ```
  The hook is ON SCREEN and audible in shot 1 itself — nothing is deferred.

## Change cadence — MANDATORY WHEN retention hooks enabled

Every shot declares a `change_type` array — which dimension(s) genuinely
changed versus the PREVIOUS shot: `"visual"` (framing/camera/lighting/
location changes meaningfully), `"emotional"` (a character's emotional
state shifts), `"informational"` (new information/event/character/object
enters the story), or `"none"` (this shot is a continuation with no real
change on any of those axes). Shot 1 has no previous shot to compare
against, so it is always `["visual", "emotional", "informational"]` by
definition. This extends the existing emotion-repetition rule above (`emotion`
must not repeat more than 2 consecutive shots) from one dimension to three:

1. **No 3 shots in a row that are all `["none"]` or all repeat the exact
   same single dimension with no other change.** Across every rolling
   window of about 3 shots, at least one of the 9 shots in that window must
   carry a genuine visual, emotional, or informational change. Three
   static, near-identical shots back to back — same framing, same
   emotion, same information — is a FAILED storyboard even if each
   individual shot is well-crafted, because the viewer has nothing new to
   track and drifts off.
2. **Declare `change_type` honestly, not decoratively.** Only mark a
   dimension changed when the shot's OWN fields actually show it: `"visual"`
   requires an actual camera/lighting/composition/location difference from
   the previous shot (not just a different word choice describing the same
   framing); `"emotional"` requires the `emotion`/`facial_expression` to
   genuinely shift; `"informational"` requires a new fact, character, prop,
   or event to enter the frame that was not present before. Do not declare
   a change that is not visibly backed by the shot's other fields — a later
   review pass reads both the declaration and the actual fields together.
3. **A deliberate pause is still a `"none"` shot — that is fine, once.** Not
   every shot needs to change something; a quiet beat that holds on a
   reaction can honestly be `["none"]`. What is never acceptable is
   THREE such shots in a row with nothing changing across any of the three
   dimensions.

### Worked example

Nine shots' `change_type` sequence showing compliant cadence (no 3-in-a-row
with nothing changing) — mirrors the "Output skeleton" example below:

```json
[
  { "shot_number": 1, "change_type": ["visual", "emotional", "informational"] },
  { "shot_number": 2, "change_type": ["visual"] },
  { "shot_number": 3, "change_type": ["emotional"] },
  { "shot_number": 4, "change_type": ["informational", "emotional"] },
  { "shot_number": 5, "change_type": ["visual", "emotional"] },
  { "shot_number": 6, "change_type": ["emotional"] },
  { "shot_number": 7, "change_type": ["visual", "emotional"] },
  { "shot_number": 8, "change_type": ["visual", "emotional"] },
  { "shot_number": 9, "change_type": ["informational", "emotional"] }
]
```

A NON-compliant sequence to avoid: shots 4, 5, 6 all declaring
`["none"]` (or all silently repeating the same framing/emotion with no
declared change) — three flat shots in the middle of the episode where the
viewer has nothing new to hold onto.

The input may also carry a `genre` fact (the series' own free-text genre,
e.g. "romance", "educational", "ดราม่า") — when present, let it lightly
inform shot styling and lighting tone (bullet 4 of "Emotional & acting
direction" above): a romance leans warmer/softer, an educational piece
stays clean and legible, a drama/thriller can lean cooler/harder on tense
beats. This is a light styling cue only — the heavy genre-conditional
story/retention-loop logic lives in the script stage, not here.

## Location continuity and scene grouping — MANDATORY

The "Change cadence" rules above reward genuine shot-to-shot variety —
camera, lighting, composition, even declaring `"visual"` as a changed
dimension — and none of that is in tension with this section. A shot's
framing, lens, movement, and lighting can and should vary constantly while
the physical PLACE stays the same; that is ordinary continuity editing, not
a location change. This section is about the underlying *setting itself* —
the actual physical place a shot happens in — a much rarer, more deliberate
decision than camera/lighting variety, which defaults to staying fixed for
the whole episode.

1. **Default: ONE location for all 9 shots.** Unless the episode's own
   scene list (see "Episode scenes" in the input — the concrete
   scene-by-scene breakdown already fed to this skill, not the thin
   series-bible logline/keyBeats) genuinely establishes more than one
   place, every shot shares a single `location_key`. Do not invent a
   second location just to add visual variety — use camera, lighting, and
   composition for that instead (see "Change cadence" above).
2. **A location change is legitimate ONLY when the scene list actually
   supports it.** Look for a scripted physical move written into the
   episode's own scenes (e.g. a scene note like "cut to kitchen" /
   "ตัดเข้าครัว"), a flashback, a dimension-jump, or a time-skip cutaway.
   Never split shots into a second location because of an incidental
   wording difference in how you happened to phrase two shots' settings —
   if the scene list does not call for a move, it did not happen, and both
   shots belong in the SAME `distinct_locations[]` group.
3. **A real change is a clean, deliberate boundary — never per-shot
   drift.** When the scene list does establish a change, group the shots
   on each side of that boundary into contiguous `shot_numbers` (e.g. shots
   1-3 in one location, shots 4-9 in the next) — never a scattered pattern
   like shots 1, 3, 7 in one location and 2, 4-6, 8-9 in another. Every
   shot belongs to exactly one `distinct_locations[]` group, and every
   group's `shot_numbers` must be a contiguous run.
4. **Existing series locations — reuse verbatim when one matches.** The
   input may carry an "Existing series locations" list — real places the
   series has already used, in the same spirit as the "Characters" list
   above (supplied only when the series has location history; see that
   list's own reference-image convention for the parallel). When a shot's
   setting matches one of these, use that entry's `location_key` EXACTLY as
   given rather than inventing a new one, so the same physical place is
   recognized as the same place across episodes. When no existing locations
   are supplied (an episode with no location history yet), author sensible
   new `location_key` / `location_name` / `description` values yourself.
5. **Output shape.** Populate the top-level `distinct_locations[]` array:
   one entry per distinct physical place used in this episode (a single
   entry covering all 9 `shot_numbers` in the default one-location case),
   each with `location_key`, `location_name`, `description` (what the place
   looks like — concrete enough to ground an image prompt: architecture,
   props, lighting fixtures), and `shot_numbers` (the contiguous shots set
   in that place). Keep each shot's own `location` string consistent with
   whichever `distinct_locations[]` group contains it.

### Worked example

Good — a scripted mid-episode move, grouped as one clean boundary: the
episode's scene list has scenes 1-2 in a convenience store and scene 3
explicitly noted "ตัดเข้าครัว" (cut to kitchen):

```json
"distinct_locations": [
  {
    "location_key": "convenience_store_main",
    "location_name": "ร้านสะดวกซื้อ (โซนของเด็ก)",
    "description": "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน ป้ายราคาสีเหลืองติดตามชั้น",
    "shot_numbers": [1, 2, 3]
  },
  {
    "location_key": "family_kitchen",
    "location_name": "ครัวที่บ้าน",
    "description": "ครัวขนาดกลาง โต๊ะไม้ตรงกลางวางอุปกรณ์ทดสอบผ้าอ้อม แสงจากหน้าต่างด้านข้าง",
    "shot_numbers": [4, 5, 6, 7, 8, 9]
  }
]
```

Bad — the same story, but drifting into scattered/incidental groupings
instead of one clean boundary (do NOT do this): inventing a third
"location" for shot 3 alone just because its wording happened to drift
(e.g. `"ทางเดินหน้าชั้นของเด็ก..."`) even though shot 3 is still the same
convenience-store aisle as shots 1-2 and the scene list never establishes a
move there; or a `shot_numbers` split like `[1, 2, 3, 5, 7]` for one
location and `[4, 6, 8, 9]` for another — not a contiguous, deliberate
boundary, and not something the scene list actually establishes.

## Identity-safe shot boundaries — MANDATORY when the caller states `identity_safe_shot_boundaries: REQUIRED`

1. Treat a behind/profile character turning to camera, or a new character
   entering mid-shot, as an identity-risk boundary. Prefer two shots—the action
   beat, then the reaction/reveal cut—so each start frame establishes the face;
   otherwise mark the beat for the existing sub-shot editor.
2. Shots sharing one `distinct_locations` entry are one continuous scene and
   must share time of day, sun direction, and light quality. Required lighting
   variety applies between scenes, not within one continuous scene.
3. This is guidance only; nothing here is code-validated. Set it aside when the
   beat genuinely requires one continuous shot; drafts remain free-form.

## Character variant selection — MANDATORY WHEN a character has variants

Some entries in the "Characters" list carry a nested "Variants available for
`<id>`" block — alternate looks (a different outfit, or a different
age-stage) of the exact SAME person, each with its own id and its own
approved reference image, e.g.:

```
- char_nuna: หนูนา (นักเรียนหญิง) [has an approved reference image — identity lock applies]
  Variants available for char_nuna — see "Character variant selection" below:
  - char_nuna_school (ชุดนักเรียน, outfit variant of char_nuna): school uniform, white shirt and blue skirt, hair tied back, worn for scenes at school or on the way to school [has an approved reference image]
  - char_nuna_sleep (ชุดนอน, outfit variant of char_nuna): pastel pajamas, hair loose, worn for scenes at home at night or first thing in the morning before school [has an approved reference image]
```

A character with NO variants listed works exactly as before — always use its
own id, nothing else to consider.

For every shot, and for every required character that DOES have variants
listed:

1. Read THIS shot's own scene content only — its own location/action/
   visual context, whatever the input actually specifies for this shot.
   Never borrow another shot's scene, and never reason from the episode's
   overall premise alone.
2. Compare that scene against each variant's description (what makes that
   variant's look different — outfit, age-stage, the situations it is worn/
   used for) and pick the ONE variant whose description most clearly matches.
   Only variants marked `[has an approved reference image]` are usable —
   never emit a variant id that is not listed, and never invent a variant
   that was not given to you.
3. Emit that VARIANT's own id (never the base character's id) in this shot's
   `characters` and `required_character_refs`, and write `visual_description`/
   `image_prompt` to match the picked variant's actual look (its outfit/
   age-stage), not the base character's default appearance.
4. When no variant's description clearly matches this shot's scene — an
   ambiguous scene, or every variant's description is about a different
   situation — fall back to the base character's own id. Never fabricate a
   fit that the variant's stated description does not actually support.
5. This is a per-shot decision, not a per-episode one: the SAME base
   character may use a different variant in different shots of the same
   episode as the scene changes (school variant in a morning shot, sleepwear
   variant in a night shot later in the same episode), and may also fall back
   to its own base id in shots that match no variant at all.

### Worked example

Given the character list above (`char_nuna` with the `char_nuna_school` and
`char_nuna_sleep` variants):

- Shot scene: "Nuna scolds her sister across the breakfast table before
  school, still in her pajamas." — the description talks about the outfit/
  setting (home, pajamas), not the destination, so this matches
  `char_nuna_sleep` far more clearly than the school-uniform variant even
  though the scene happens right before school:
  ```json
  {
    "characters": ["char_nuna_sleep"],
    "required_character_refs": ["char_nuna_sleep"],
    "visual_description": "หนูนาในชุดนอนสีพาสเทล ผมปล่อย นั่งโต๊ะอาหารเช้า ต่อว่าน้องสาว"
  }
  ```
- A later shot in the same episode, set in a school hallway between classes,
  instead clearly matches the school-uniform variant's description:
  ```json
  {
    "characters": ["char_nuna_school"],
    "required_character_refs": ["char_nuna_school"],
    "visual_description": "หนูนาในชุดนักเรียน เดินอยู่ในทางเดินโรงเรียนระหว่างคาบเรียน"
  }
  ```
- A third shot with an ambiguous or neutral setting that matches neither
  variant's description (e.g. a phone call in an unspecified room, no visible
  outfit/setting cue) falls back to the base character's own id:
  ```json
  {
    "characters": ["char_nuna"],
    "required_character_refs": ["char_nuna"]
  }
  ```

## Twin-aware shot styling — MANDATORY WHEN a shot puts twins on screen together

The input may carry a top-level `twinPairs` list — pairs of character ids
that are twins: separate, independently-generated people who share an
identical face (their reference images are locked to the same face on
purpose), e.g.:

```
Twin pairs (see "Twin-aware shot styling" below):
- char_fai and char_baitong are twins — they share an identical face but are different people.
```

This is the same relationship the character reference package already
locks `"hard"` for a twin's own solo portrait, with a mandatory requirement
that their wardrobe, hairstyle, and overall styling read as clearly,
visibly distinct even though the face matches exactly — so a viewer can
tell them apart at a glance. Apply that same requirement here, at the shot
level:

1. For every shot, check its own `characters`/`required_character_refs`
   selection against the `twinPairs` list. This is a per-shot check, not a
   per-episode one — the twins may share screen time in some shots and not
   others.
2. When a shot's own selection includes BOTH ids of a twin pair, the
   `visual_description` and `image_prompt` you write for that shot MUST
   explicitly call for their styling — hair, outfit, accessories — to read
   as clearly, visibly distinct from each other, even though they share an
   identical face. Never differentiate their faces; only their styling.
   Keep each twin's own established look (their own wardrobe/hair facts, or
   whichever variant they are currently wearing per "Character variant
   selection" above) — the distinctness comes from those looks genuinely
   differing, called out explicitly, not from inventing a new face.
3. When a shot's own selection includes only ONE twin, or NEITHER, this
   section does not apply to that shot — write it exactly as you would any
   other shot, with no twin-distinctness language.

### Worked example

Given `twinPairs: [{ "characterKeyA": "char_fai", "characterKeyB": "char_baitong" }]`:

- Shot scene: both sisters confront each other in the family silk shop —
  both ids are in this shot's own selection, so the styling must be called
  out as distinct:
  ```json
  {
    "characters": ["char_fai", "char_baitong"],
    "required_character_refs": ["char_fai", "char_baitong"],
    "visual_description": "ฝ้ายและใบตองยืนเผชิญหน้ากันในร้านผ้าไหมของครอบครัว ใบหน้าเหมือนกันทุกกระเบียดนิ้ว แต่ฝ้ายไว้ผมหยักศกปล่อยสยาย แต่งหน้านุ่มนวล สวมชุดผ้าไหมสีชมพูอ่อน ขณะที่ใบตองรวบผมมวยต่ำเรียบ ไม่แต่งหน้า สวมเสื้อผ้าฝ้ายสีเขียวเข้มเรียบง่าย — สไตล์การแต่งตัวต่างกันชัดเจนแม้ใบหน้าจะเหมือนกันทุกประการ",
    "image_prompt": "vertical 9:16 storyboard shot of twin sisters ฝ้าย and ใบตอง facing off in the family silk shop — identical faces, but ฝ้าย wears loose wavy hair with soft glam makeup and a pale pink silk dress while ใบตอง wears a severe low bun with no makeup and a plain forest-green cotton blouse, clearly distinct styling so the twins read as different people at a glance"
  }
  ```
- A later shot in the same episode has only ฝ้าย present (ใบตอง is not in
  this shot) — no twin-distinctness language applies:
  ```json
  {
    "characters": ["char_fai"],
    "required_character_refs": ["char_fai"],
    "visual_description": "ฝ้ายนั่งอยู่คนเดียวหลังเคาน์เตอร์ร้าน มองออกไปนอกหน้าต่าง"
  }
  ```

## Shot-to-beat attribution and silence budget — MANDATORY (story-density reform)

The input script's beats may be dialogue-complete (`structure.beats[]` carry
`dialogue_lines[]`, a per-beat `estimated_speech_seconds`, and the input may
carry a top-level `speech_budget`). When they do, this skill must persist an
explicit, deterministic map from shots back to the beats they dramatize
instead of leaving it to positional guesswork downstream:

1. **`source_beat_indexes` is REQUIRED on every shot whenever the input
   script's beats are dialogue-complete.** Set it to the beat number(s)
   (matching `structure.beats[].beat`) this shot's `action`/`dialogue_excerpt`
   comes from — usually one beat per shot, occasionally two adjacent shots
   sharing one beat, or one shot spanning two short beats. Never leave it
   empty or guess proportionally; trace each shot back to the specific beat
   whose `dialogue_lines[]` supplied its `dialogue_excerpt`.
2. **Visual-only shots MUST declare `silence_intent`.** A shot with no
   spoken dialogue for its full duration needs an explicit `silence_intent`:
   `"dramatic_pause"` (a beat that lands harder in silence), `"action_visual"`
   (physical action carries the beat, not words), `"montage"` (time-compressed
   visual sequence), or `"establishing"` (orientation/location shot with no
   dialogue). Do not leave a silent shot's intent unstated, and never assign
   `dialogue_excerpt`/`subtitle_text` to a shot you have marked with a
   `silence_intent`.
3. **At most 2 of the 9 shots may be visual-only.** If the input explicitly
   marks the episode visual-first (e.g. a `visual_first`/equivalent flag
   inside the script or `app_metadata`), this cap does not apply; otherwise
   treat it as a hard ceiling — if more than 2 shots would naturally be
   silent, go back and give at least one of them a short line or reaction
   beat instead, or flag the shortfall in `warnings`/`repair_queue` rather
   than silently exceeding the cap.
4. **`target_speech_seconds` echoes this shot's own speech budget.** Derive it
   from the shot's own `duration_seconds` using
   `clamp(duration_seconds * 0.68, 2.5, duration_seconds - 0.75)` — the same
   ratio the platform's canonical speech-budget module uses. This mirrors,
   and never replaces, that deterministic calculation, which the pipeline
   re-verifies downstream. Set it to `0` (or omit it) for a shot carrying a
   `silence_intent`.

When the input script's beats are NOT dialogue-complete (no `dialogue_lines[]`
present anywhere in `structure.beats`), `source_beat_indexes`,
`silence_intent`, and `target_speech_seconds` remain fully optional — legacy
behavior is unchanged.

## Episode draft (refine mode) — MANDATORY WHEN PROVIDED (W10-B)

The input may include an `episode_draft` object carried over from the
season-planning stage (spec/section-16): `{ "shots": [...9 numbered shot
drafts, each with "shot_number"/"summary"/"dialogue_lines"/"silence_intent"...],
"cliffhanger_line": "..." }`. When present, it is the REFINE base for this
storyboard's 9-shot allocation, not a suggestion to ignore:

**A vetted per-shot draft exists — REFINE it into the full storyboard shot
schema: preserve the 9-shot allocation (map each draft shot's summary into
that same shot's description, keeping shot_number alignment) and pass
through silence_intent as-is; do NOT renumber, merge, or drop shots, and do
NOT invent a divergent plot.**

- Preserve the 9-shot allocation exactly: `episode_draft.shots[n].summary`
  maps into that SAME shot's `narrative_purpose`/`visual_description` (shot
  `n` in the draft stays shot `n` in the output) — never renumber, merge,
  split, or drop a shot.
- Pass `silence_intent` through as-is for any draft shot that declares one
  (do not add dialogue to a shot the draft marked silent, and do not drop a
  `silence_intent` the draft already set).
- Still produce every field the shot schema requires for each shot — camera,
  image_prompt, required_character_refs, `source_beat_indexes` when
  applicable, the emotional/acting-direction fields above, etc. — a draft
  never lowers or bypasses any requirement in this document; it only grounds
  what already happens in each shot.
- Do NOT invent a divergent plot: the draft's shot-by-shot story is already-
  approved source material to visualize, not raw material to reinterpret.
- When a draft shot's `dialogue_lines[]` names a speaker, that speaker's
  character id MUST be included in this shot's `characters`/
  `required_character_refs` — even a brief reverse-shot listener line counts.
  Extra non-speaking characters are allowed; a SPEAKING character missing
  from the list is not — a line whose speaker isn't in the frame makes the
  video invent a stand-in.

When `episode_draft` is absent, this section does not apply — build the 9
shots from the script/scene beats as usual.

Output skeleton:

```json
{
  "contract_version": 1,
  "storyboard_summary": {
    "episode_title": "Midnight Verdict",
    "episode_number": 1,
    "duration_seconds": 60,
    "core_emotion": "betrayal turning to triumph",
    "visual_promise": "a quiet power struggle in a dark boardroom that flips mid-episode"
  },
  "canonical_style_bible": {
    "overall_style": "premium vertical cinema",
    "lighting_language": "lighting follows each shot's emotion, location, and time-of-day — varies across the episode (daylight, golden hour, harsh overhead, low-key) rather than defaulting to dark; contrast sharpens only on reversal beats",
    "camera_language": "slow deliberate pushes that snap into fast push-ins on reversals",
    "color_language": "teal and amber",
    "continuity_rules": [
      "lock Aria identity",
      "keep gold hoops"
    ]
  },
  "shot_grid_plan": {
    "layout": "3x3",
    "aspect_ratio": "9:16",
    "contact_sheet_instruction": "render one 3x3 contact sheet, 9 vertical cells reading left-to-right top-to-bottom",
    "grid_reading_order": [
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9
    ]
  },
  "shots": [
    {
      "shot_number": 1,
      "timecode": "00:00-00:06",
      "duration_seconds": 6,
      "narrative_purpose": "beat 1",
      "emotion": "guarded suspicion",
      "change_type": ["visual", "emotional", "informational"],
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria signs the merger, phone lighting up with the collateral clause",
      "visual_description": "vertical cinematic frame, soft warm daylight, guarded suspicion.",
      "camera": {
        "shot_type": "wide",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "soft afternoon window light, neutral warm balance",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 1 of Aria in boardroom, guarded suspicion",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 2,
      "timecode": "00:06-00:12",
      "duration_seconds": 6,
      "narrative_purpose": "beat 1",
      "emotion": "guarded suspicion",
      "change_type": ["visual"],
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria's eyes flick to the clause, still composed",
      "visual_description": "vertical cinematic frame, bright even office light, guarded suspicion.",
      "camera": {
        "shot_type": "medium",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "slow_push_in",
        "composition": "rule_of_thirds"
      },
      "lighting": "bright practical office light overhead, even and clean",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 2 of Aria in boardroom, guarded suspicion",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 3,
      "timecode": "00:12-00:18",
      "duration_seconds": 6,
      "narrative_purpose": "beat 2",
      "emotion": "cold, simmering anger",
      "change_type": ["emotional"],
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria confronts the rival across the table",
      "visual_description": "vertical cinematic frame, cool directional daylight, cold, simmering anger.",
      "camera": {
        "shot_type": "close_up",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "centered"
      },
      "lighting": "cool daylight through blinds, harder directional shadow as anger sharpens",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 3 of Aria in boardroom, cold, simmering anger",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 4,
      "timecode": "00:18-00:24",
      "duration_seconds": 6,
      "narrative_purpose": "beat 2",
      "emotion": "smug certainty",
      "change_type": ["informational", "emotional"],
      "characters": [
        "char_aria",
        "char_rival"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png",
        "rival_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the rival mocks her, certain she has no move",
      "visual_description": "vertical cinematic frame, warm golden-hour light, smug certainty.",
      "camera": {
        "shot_type": "over_the_shoulder",
        "angle": "low_angle",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "rule_of_thirds"
      },
      "lighting": "warm golden-hour light spilling across the table, deceptively pleasant",
      "facial_expression": {
        "char_aria": "composed, watching closely",
        "char_rival": "smug half-smile"
      },
      "body_language": {
        "char_aria": "still, controlled posture",
        "char_rival": "leaning forward, dominating the space"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink",
        "char_rival": "stares down at Aria, certain of victory"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 4 of Aria in boardroom, smug certainty",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 5,
      "timecode": "00:24-00:30",
      "duration_seconds": 6,
      "narrative_purpose": "beat 3",
      "emotion": "cold, controlled triumph",
      "change_type": ["visual", "emotional"],
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria reveals the clinic is already out of reach",
      "visual_description": "vertical cinematic frame, harder rim-lit contrast, cold, controlled triumph. Cut lands hard on the beat — no lingering, accelerated rhythm.",
      "camera": {
        "shot_type": "extreme_close_up",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "fast_push_in",
        "composition": "centered"
      },
      "lighting": "harder rim-lit contrast, cooler color grade to sharpen the reversal",
      "facial_expression": {
        "char_aria": "eyes narrowed, jaw tight, the ghost of a smile"
      },
      "body_language": {
        "char_aria": "leans back, arms loosely crossed, unhurried"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "You should have checked the transfer log before you smiled.",
      "subtitle_text": "You should have checked the transfer log before you smiled.",
      "continuity_notes": "keep blazer + gold hoops; hard cut rhythm on the reversal",
      "image_prompt": "vertical 9:16 storyboard shot 5 of Aria in boardroom, cold, controlled triumph",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 6,
      "timecode": "00:30-00:36",
      "duration_seconds": 6,
      "narrative_purpose": "beat 3",
      "emotion": "exposed panic",
      "change_type": ["emotional"],
      "characters": [
        "char_aria",
        "char_rival"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png",
        "rival_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the rival's composure cracks as the reversal lands",
      "visual_description": "vertical cinematic frame, harsh flattening overhead light, exposed panic. Cut lands hard on the beat — no lingering, accelerated rhythm.",
      "camera": {
        "shot_type": "close_up",
        "angle": "low_angle",
        "lens_feel": "50mm",
        "movement": "whip_push",
        "composition": "off_center"
      },
      "lighting": "harsh overhead light flattening the rival's expression, no flattering shadow",
      "facial_expression": {
        "char_aria": "eyes narrowed, jaw tight, the ghost of a smile",
        "char_rival": "brows drawn, mouth tightening, composure slipping"
      },
      "body_language": {
        "char_aria": "leans back, arms loosely crossed, unhurried",
        "char_rival": "shoulders stiffen, hand grips the chair"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink",
        "char_rival": "glances away toward his phone, avoiding her eyes"
      },
      "dialogue_excerpt": "You should have checked the transfer log before you smiled.",
      "subtitle_text": "You should have checked the transfer log before you smiled.",
      "continuity_notes": "keep blazer + gold hoops; hard cut rhythm on the reversal",
      "image_prompt": "vertical 9:16 storyboard shot 6 of Aria in boardroom, exposed panic",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 7,
      "timecode": "00:36-00:42",
      "duration_seconds": 6,
      "narrative_purpose": "beat 4",
      "emotion": "brittle calm",
      "change_type": ["visual", "emotional"],
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the rival scrambles to call his backers",
      "visual_description": "vertical cinematic frame, dim low-key light, brittle calm.",
      "camera": {
        "shot_type": "medium",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "rule_of_thirds"
      },
      "lighting": "dim low-key rim light, brittle hush after the reversal",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 7 of Aria in boardroom, brittle calm",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 8,
      "timecode": "00:42-00:48",
      "duration_seconds": 6,
      "narrative_purpose": "beat 4",
      "emotion": "quiet vindication",
      "change_type": ["visual", "emotional"],
      "characters": [
        "char_aria"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "Aria walks out, unhurried, aftermath settling",
      "visual_description": "vertical cinematic frame, soft morning light, quiet vindication.",
      "camera": {
        "shot_type": "wide",
        "angle": "high_angle",
        "lens_feel": "50mm",
        "movement": "slow_pull_back",
        "composition": "rule_of_thirds"
      },
      "lighting": "soft morning light through tall windows, calm and open",
      "facial_expression": {
        "char_aria": "composed, watching closely"
      },
      "body_language": {
        "char_aria": "still, controlled posture"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 8 of Aria in boardroom, quiet vindication",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    },
    {
      "shot_number": 9,
      "timecode": "00:48-00:54",
      "duration_seconds": 6,
      "narrative_purpose": "beat 4",
      "emotion": "dawning dread",
      "change_type": ["informational", "emotional"],
      "characters": [
        "char_aria",
        "char_rival"
      ],
      "required_character_refs": [
        "aria_primary_portrait.png",
        "rival_primary_portrait.png"
      ],
      "location": "boardroom",
      "action": "the assistant's whisper about the emergency board vote lands on the rival",
      "visual_description": "vertical cinematic frame, cold dusk light, dawning dread.",
      "camera": {
        "shot_type": "insert",
        "angle": "eye_level",
        "lens_feel": "50mm",
        "movement": "static",
        "composition": "centered"
      },
      "lighting": "cold blue dusk light easing toward shadow as dread creeps in",
      "facial_expression": {
        "char_aria": "composed, watching closely",
        "char_rival": "smug half-smile"
      },
      "body_language": {
        "char_aria": "still, controlled posture",
        "char_rival": "leaning forward, dominating the space"
      },
      "gaze_direction": {
        "char_aria": "locks eyes with the rival across the table, does not blink",
        "char_rival": "stares down at Aria, certain of victory"
      },
      "dialogue_excerpt": "We are not done here.",
      "subtitle_text": "We are not done here.",
      "continuity_notes": "keep blazer + gold hoops",
      "image_prompt": "vertical 9:16 storyboard shot 9 of Aria in boardroom, dawning dread",
      "negative_prompt": "no identity drift, no extra fingers",
      "age_suitability": "young_adults"
    }
  ],
  "plain_text_storyboard": "Shot 1 wide establishing, guarded suspicion... Shot 5-6 fast push-in reversal, cold triumph meets exposed panic... Shot 9 insert, dawning dread payoff.",
  "storyboard_handoff_json": {
    "schema_version": "1.0",
    "handoff_type": "storyboard_shot_prompts",
    "grid_layout": "3x3",
    "shots": [
      {
        "shot_number": 1,
        "image_prompt": "vertical 9:16 storyboard shot 1 of Aria in boardroom, guarded suspicion"
      },
      {
        "shot_number": 2,
        "image_prompt": "vertical 9:16 storyboard shot 2 of Aria in boardroom, guarded suspicion"
      },
      {
        "shot_number": 3,
        "image_prompt": "vertical 9:16 storyboard shot 3 of Aria in boardroom, cold, simmering anger"
      },
      {
        "shot_number": 4,
        "image_prompt": "vertical 9:16 storyboard shot 4 of Aria in boardroom, smug certainty"
      },
      {
        "shot_number": 5,
        "image_prompt": "vertical 9:16 storyboard shot 5 of Aria in boardroom, cold, controlled triumph"
      },
      {
        "shot_number": 6,
        "image_prompt": "vertical 9:16 storyboard shot 6 of Aria in boardroom, exposed panic"
      },
      {
        "shot_number": 7,
        "image_prompt": "vertical 9:16 storyboard shot 7 of Aria in boardroom, brittle calm"
      },
      {
        "shot_number": 8,
        "image_prompt": "vertical 9:16 storyboard shot 8 of Aria in boardroom, quiet vindication"
      },
      {
        "shot_number": 9,
        "image_prompt": "vertical 9:16 storyboard shot 9 of Aria in boardroom, dawning dread"
      }
    ],
    "character_attachment_manifest": [
      {
        "character_id": "char_aria",
        "refs": [
          "aria_primary_portrait.png"
        ]
      },
      {
        "character_id": "char_rival",
        "refs": [
          "rival_primary_portrait.png"
        ]
      }
    ],
    "rendering_notes": "vertical 9:16, keep identity anchors"
  }
}
```

### Example: shot-to-beat attribution and a visual-only shot (story-density reform)

When the input script's beats are dialogue-complete, shot entries additionally
carry `source_beat_indexes`/`target_speech_seconds`, or `silence_intent` for a
visual-only shot:

```json
{
  "shot_number": 1,
  "duration_seconds": 8,
  "narrative_purpose": "beat 1",
  "source_beat_indexes": [1],
  "target_speech_seconds": 4.7,
  "dialogue_excerpt": "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ"
}
```

```json
{
  "shot_number": 7,
  "duration_seconds": 6,
  "narrative_purpose": "beat 4 aftermath, no dialogue",
  "source_beat_indexes": [4],
  "silence_intent": "dramatic_pause",
  "target_speech_seconds": 0
}
```
