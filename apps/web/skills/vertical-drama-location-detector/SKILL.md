---
name: Vertical Drama Location Detector
description: Read one Vertical Drama series' whole-season story content plus its current location roster, then decide every distinct physical setting the story establishes across the whole season.
version: 1.0.0
category: other
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: map
tags:
  - vertical-drama
  - location
  - detection
  - visual-bible
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
# Vertical Drama Location Detector

You are given the WHOLE season's drafted story content (every episode's title, logline,
key beats, and shot-by-shot dialogue/action that exists so far) and the series' current
location roster (each location's `location_key`, `name`, and a short `description`). Your
job is creative judgment, not code: read the whole season and decide every DISTINCT
physical setting the story actually establishes — a place the story visits more than
once, or establishes clearly enough that it deserves its own durable reference image. The
calling app never tells you which locations exist in the story — it hands you only the
raw facts (roster + season text); you read the whole story and decide.

Return ONLY valid JSON:

```json
{ "contract_version": 1, "locations": [...] }
```

Each entry in `locations` MUST have:
- `location_key` — either an EXISTING roster entry's `location_key`, echoed back verbatim
  (see "Recognizing an already-known location" below), or a NEW lowercase-hyphen-slug key
  you invent for a setting that isn't in the roster yet (e.g. `home-kitchen`,
  `convenience-store`, `hospital-corridor`).
- `name` — a short, human-readable name for the location (may be in the series' own
  language).
- `description` — a concrete, ENVIRONMENT-ONLY description (see "Environment-only
  description — MANDATORY" below) — never mentions any person.
- `applies_to_episodes` — the episode numbers where this location is actually used, based
  on what the story text shows.

It is completely normal (and expected on some seasons, especially early or dialogue-only
ones) for the story to not yet clearly establish any distinct, reusable location at all —
see "Omit everything when nothing qualifies" below. The roster you're given may also
start completely EMPTY (an older series, or a wizard textarea nobody filled in) — that is
a normal starting point for this skill, not an error condition; propose every distinct
location fresh in that case.

## What counts as a distinct location — read this carefully

Only propose a location when the season's story text shows it being an ACTUAL, distinct
physical setting the story returns to or establishes clearly — not just a passing
mention.

**DO propose** when:
- Multiple shots/episodes are set in the same recognizable place (a family's home
  kitchen, a school hallway, a convenience store) — the story returns to it, or the shot
  descriptions make its physical details concrete enough to render (specific fixtures,
  layout, props).
- A single episode's shots establish a place in enough concrete detail (architecture,
  fixed fixtures, layout) that a reusable establishing-plate reference image is clearly
  worth having for it, even if the season doesn't (yet) return to it a second time.

**Do NOT propose** when:
- A place is only named in passing dialogue with no shot actually set there and no
  physical detail described (e.g. a character says "I used to work at a hospital" but no
  scene takes place in one).
- Two shots use similar-sounding but genuinely different settings (a shot at "the office"
  in episode 2 and a different, unrelated office in episode 9 for a different company) —
  do not merge them into one location just because the words are similar; either keep
  them as two distinct entries (different `location_key`s) or omit the less-detailed one
  if it's too thin to describe concretely.
- The setting is a single throwaway line with no way to describe its physical appearance
  concretely — never invent physical details the story doesn't support.

## Recognizing an already-known location (avoid re-proposing duplicates)

The `location_roster` you're given may already contain entries from a PRIOR run of this
same skill (or from a location the wizard's initial location list already seeded). Each
roster entry carries its own `location_key`, `name`, and `description`.

When you are about to describe a location and you recognize that a roster entry is
ALREADY the exact same physical place you would otherwise be describing fresh, use that
roster entry's OWN `location_key` verbatim in your output. This tells the calling app
"this is the same place you already know about, not a new proposal" — it will reuse the
existing row (keeping its already-approved description and any reference images intact)
instead of creating a duplicate, even if you happen to phrase the name/description
slightly differently than last time.

Still author `name`/`description` normally when doing this — write them exactly as you
would for a brand-new proposal. The calling app decides on its own whether to keep its
existing stored description or use yours; you are not responsible for that choice.

When you genuinely don't recognize an overlap — the roster is empty, or none of its
entries match the setting you're describing — simply invent a new lowercase-hyphen-slug
`location_key` and propose normally. This is the expected, common case for a season with
few or no roster entries yet.

**A different situation at the same physical place is still the same location — never
mint a "variant" of it.** The same room, building, or set returning to the story under a
different dramatic beat, mood, time of day, or reason for being there (a crisis call
happening in the same flight-control center that was calm on a normal shift; a hostage
standoff unfolding in the same lobby a character walked through casually last episode) is
still the SAME physical place. Echo the existing roster entry's `location_key` verbatim —
exactly as described above — even when what happens there this time feels dramatically
distinct. Never coin a derived key like `<existing-key>-visit1`, `<existing-key>-2`, or
similar, and never append a situation qualifier onto the `name`, such as
`"ศูนย์ควบคุมการปฏิบัติการบิน (รับสายด่วน)"` when the roster already has
`"ศูนย์ควบคุมการปฏิบัติการบิน"` (a real production mistake this skill must never repeat: a
single flight-control center wrongly became three roster rows — the original plus
`-visit1` "(รับสายด่วน)" and `-visit2` "(วิกฤตผู้โดยสาร)" — because each new crisis
happening there was treated as a new place). The situation, crisis, or mood belongs in
that episode's own scene description/key beats, never in the location's identity — a
location's `name` and `location_key` describe the PLACE, not what's currently happening
in it.

## Environment-only description — MANDATORY

`description` MUST describe the physical setting only — architecture, materials, fixed
fixtures/equipment, layout, and lighting — never a person, action, or dialogue. This
mirrors the sibling `vertical-drama-location-visual-bible` skill's own "establishing
plate" framing exactly: this description is later used to ground an environment-only,
no-people image-generation prompt, so it must stand on its own as a description of the
PLACE, not of what happens there or who is in it. Never mention any person, character
name, or human action — if a person appears in your description, the downstream
image-generation step inherits that mistake and renders someone into what must be an
empty establishing plate.

Good example (concrete, environment-only):
> "a modest Thai home kitchen, open-plan layout connecting to a small dining nook, a white
> refrigerator against the back wall, simple wooden cabinets above a tiled countertop,
> warm pale wood-grain tile walls, a low wooden table in the center foreground"

Bad example (describes an action/character instead of the place — do NOT do this):
> "the kitchen where the mother argues with her daughter every morning" — this describes a
> recurring SCENE, not the physical space; rewrite it as what the kitchen itself actually
> looks like.

## Worked example 1 — a season with several recurring locations

Input:

```json
{
  "contract_version": 1,
  "location_roster": [],
  "episodes": [
    {
      "episode_number": 1,
      "working_title": "เช้าวันธรรมดา",
      "logline": "หนูนาตื่นนอนในห้องนอนเล็กๆ ช่วยแม่จัดโต๊ะอาหารเช้าที่ครัวก่อนไปโรงเรียน",
      "key_beats": [
        "หนูนาตื่นนอนในห้องนอนเล็กๆ ผนังไม้เก่า มีโต๊ะเรียนตัวเล็กมุมห้อง",
        "ลงมาช่วยแม่จัดโต๊ะอาหารเช้าที่ครัวเปิดโล่งต่อกับมุมกินข้าว มีตู้เย็นสีขาว"
      ]
    },
    {
      "episode_number": 2,
      "working_title": "วันแรกที่โรงเรียนมัธยม",
      "logline": "หนูนาเดินเข้าโรงเรียนมัธยมเป็นวันแรกของเทอม ผ่านทางเดินยาวมีล็อกเกอร์สีเขียวสองข้าง",
      "key_beats": ["หนูนาเดินเข้าประตูโรงเรียน ทางเดินยาวมีล็อกเกอร์สีเขียวเรียงราย"]
    },
    {
      "episode_number": 4,
      "working_title": "วันหยุดช่วยงานบ้าน",
      "logline": "หนูนากลับมาที่ครัวเปิดโล่งเดิม ช่วยแม่ล้างจานและถูบ้านทั้งวัน",
      "key_beats": ["หนูนาล้างจานที่ครัวเปิดโล่งต่อกับมุมกินข้าว จุดเดิมกับตอนที่ 1"]
    },
    {
      "episode_number": 6,
      "working_title": "สอบกลางภาค",
      "logline": "หนูนานั่งทำข้อสอบกลางภาคในห้องเรียน ก่อนเดินผ่านทางเดินล็อกเกอร์สีเขียวกลับบ้าน",
      "key_beats": ["สอบเสร็จ เดินผ่านทางเดินล็อกเกอร์สีเขียวเดิมของโรงเรียนกลับบ้าน"]
    }
  ]
}
```

Output:

```json
{
  "contract_version": 1,
  "locations": [
    {
      "location_key": "home-kitchen",
      "name": "ครัวที่บ้าน",
      "description": "a modest Thai home kitchen, open-plan layout connecting to a small dining nook, a white refrigerator against the back wall, simple wooden cabinets, warm pale tile walls",
      "applies_to_episodes": [1, 4]
    },
    {
      "location_key": "school-hallway",
      "name": "ทางเดินโรงเรียน",
      "description": "a long school hallway lined with green metal lockers on both sides, pale institutional walls, fluorescent overhead lighting, polished tile floor",
      "applies_to_episodes": [2, 6]
    }
  ]
}
```

Note that หนูนา's small bedroom in episode 1 is NOT included — a single passing mention
with only a couple of physical details and no return visit in the season isn't developed
enough to warrant its own durable reference yet; the classroom exam room in episode 6 is
similarly omitted for the same reason (mentioned once, no concrete architectural detail
beyond "ห้องเรียน").

## Worked example 2 — second run recognizing an already-known location

Same season as worked example 1, run again after the calling app already saved
`home-kitchen` and `school-hallway` from the first run. The roster now includes both:

Input:

```json
{
  "contract_version": 1,
  "location_roster": [
    {
      "location_key": "home-kitchen",
      "name": "ครัวที่บ้าน",
      "description": "a modest Thai home kitchen, open-plan layout connecting to a small dining nook, a white refrigerator against the back wall"
    },
    {
      "location_key": "school-hallway",
      "name": "ทางเดินโรงเรียน",
      "description": "a long school hallway lined with green metal lockers on both sides"
    }
  ],
  "episodes": [
    {
      "episode_number": 7,
      "working_title": "งานเลี้ยงวันเกิด",
      "logline": "ครอบครัวจัดงานเลี้ยงวันเกิดเล็กๆ ที่ครัวเปิดโล่งเดิมของบ้าน มีเค้กวางบนโต๊ะเตี้ยกลางครัว",
      "key_beats": ["จัดงานวันเกิดที่ครัวเปิดโล่งเดิม มีเค้กวางบนโต๊ะเตี้ย"]
    }
  ]
}
```

You recognize the birthday party in episode 7 is happening in the SAME kitchen already in
the roster — echo its existing `location_key` back rather than inventing a new one:

Output:

```json
{
  "contract_version": 1,
  "locations": [
    {
      "location_key": "home-kitchen",
      "name": "ครัวที่บ้าน",
      "description": "a modest Thai home kitchen, open-plan layout connecting to a small dining nook, a white refrigerator against the back wall, a low wooden table used for family gatherings",
      "applies_to_episodes": [7]
    }
  ]
}
```

`school-hallway` is correctly omitted — episode 7's story text never returns to it.

## Worked example 3 — edge case: nothing established yet

Input:

```json
{
  "contract_version": 1,
  "location_roster": [],
  "episodes": [
    {
      "episode_number": 1,
      "working_title": "จุดเริ่มต้น",
      "logline": "เอกชัยเล่าย้อนอดีตให้เพื่อนฟังถึงวันที่เขาตัดสินใจลาออกจากงาน",
      "key_beats": ["เอกชัยเล่าเรื่องราวในอดีตให้เพื่อนฟัง ไม่มีฉากเปิดเผยสถานที่ชัดเจน"]
    }
  ]
}
```

Nothing in this episode's text establishes any concrete physical setting — it's a single
scene of dialogue with no described environment. Output an empty list rather than forcing
a proposal:

```json
{ "contract_version": 1, "locations": [] }
```

## Omit everything when nothing qualifies

When the season's story text doesn't clearly establish any distinct, reusable physical
setting, return `{ "contract_version": 1, "locations": [] }`. Do not force a location
into existence to have something to return — an empty result on a season that genuinely
hasn't established any distinct setting yet is the CORRECT output, not a failure. This is
especially expected on a short or early-stage season, or one still light on shot-level
detail.
