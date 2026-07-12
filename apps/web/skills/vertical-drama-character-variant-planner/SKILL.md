---
name: Vertical Drama Character Variant Planner
description: Read one Vertical Drama series' whole-season story content plus its current character roster, then propose outfit variants, age-stage variants, and twin/lookalike detections for the season.
version: 1.0.0
category: other
execution_mode: llm-only
auto_trigger: false
enabled_by_default: false
credit_multiplier: 1
strict_provider_pin: false
contract_version: 1
icon: users-round
tags:
  - vertical-drama
  - character-planning
  - variants
  - twins
  - improve-script
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
# Vertical Drama Character Variant Planner

You are given the WHOLE season's drafted story content (every episode's title, logline,
key beats, and shot-by-shot dialogue that exists so far) and the series' current
character roster (each character's `character_key`, `name`, `role`, and a short
`description`). Your job is creative judgment, not code: decide which characters
genuinely need a **distinct visual variant** of themselves for a scene the season
already establishes, and whether the story establishes any **twins/lookalikes**. The
calling app never tells you which characters need variants — it hands you only the raw
facts (roster + season text); you read the whole story and decide.

Return ONLY valid JSON that conforms to `schemas/output.schema.json`:

```json
{ "contract_version": 1, "character_plans": [...], "twin_detections": [...] }
```

Every `character_plans[].character_key` and every `twin_detections[].source_character_key`
MUST be one of the `character_key` values from the input roster — never invent a
character_key that isn't in the roster, and never propose a plan/twin for a character
that doesn't exist in the input. It is completely normal (and expected on most runs) for
a character to need NO variants at all — only include a character in `character_plans`
when you are proposing at least one variant for them; omit characters that need nothing.
Likewise, omit `twin_detections` entirely (empty array) when the story never establishes
twins/lookalikes.

## Two variant types — read this carefully, they are NOT interchangeable

### `"outfit"` variants — same person, same age, same face, different look

Propose an `"outfit"` variant when the season's story text shows this character,
across DIFFERENT recurring scenes/contexts, in a DIFFERENT outfit, hairstyle, or
styling that would look visibly wrong if every one of those scenes used the exact
same single reference image. The classic case: a character has an at-home look, a
school/work look, and maybe a special-occasion look, and the season genuinely
returns to each of these contexts more than once (not just a single throwaway
mention).

**DO propose** when:
- Multiple episodes/shots explicitly describe the character in different, named
  attire tied to different recurring settings (home vs. school vs. work vs. a formal
  event) — e.g. a character described in "ชุดนอน" at home in episode 1, then
  "ชุดนักเรียน" at school in episodes 2 and 3, then helping with housework in
  "ชุดทำงานบ้าน" in episode 4 and again in episode 6.
- The season's own key beats or shot summaries make the look change part of the
  STORY itself (a uniform, a costume, a disguise that recurs).

**Do NOT propose** when:
- The story mentions clothing only once, in passing, with no recurring pattern —
  a single throwaway description is not a variant, it is just texture for that one
  scene.
- The difference is emotional/situational only ("she looks tired," "her hair is a
  mess after running") with no actual described change of GARMENTS.
- You are guessing at a plausible wardrobe the story never actually describes —
  never invent a variant the text doesn't support.

An `"outfit"` variant's face is 100% the same as the parent character — only hair,
clothing, makeup, and accessories differ. Write `description` as a compact but
concrete visual description of THIS LOOK ONLY (not the character's whole identity,
which the parent character row already owns) — e.g. "school uniform: white blouse,
navy pleated skirt, hair in twin braids, no makeup, black school shoes."

### `"age_stage"` variants — same identity, face allowed to change naturally with age

Propose an `"age_stage"` variant ONLY when the season's story text explicitly shows
this character AT A DIFFERENT LIFE STAGE in an actual scene — a flashback to
childhood, a time-skip forward that ages the character, or a season that spans years
so the character is shown as a child in early episodes and an adult later. This is
NOT the same as an outfit variant: the face itself is allowed (expected) to look
different at a different age, so never phrase the description as a hard face lock.

**DO propose** when:
- A flashback shot/scene explicitly depicts the character as a child/teen while the
  present-day story depicts them as an adult (or vice versa).
- A key beat states a time-skip (e.g. "10 ปีต่อมา") after which the character is
  shown noticeably older.

**Do NOT propose** when:
- A character is merely DESCRIBED as looking older/more tired emotionally, with no
  actual different-age SCENE.
- The story never leaves the character's established present-day age at all.

Write `description` as a concrete description of the age-stage appearance,
explicitly framed as loosely referencing the parent for family resemblance/consistent
identity, never as an identical-face requirement — e.g. "around 8 years old, rounder
face, shorter hair in two short pigtails, simple cotton play clothes; keep the same
distinguishing features (mole above left eyebrow) for recognizability, but the face is
naturally younger, not a locked copy of the adult portrait."

### `applies_to_episodes`

List the episode numbers (from the input) where this specific variant is actually
needed, based on what the story text shows. This is informational for the calling
app (it does not have to be exhaustive to the character), but should reflect the real
episodes you found evidence for.

## Twin / lookalike detection

Only flag twins when the season's story text EXPLICITLY establishes multiple related
characters who look alike (a sibling relationship stated in the story, or a scene
that directly says two characters are twins or are mistaken for one another because
they look identical) — 2, 3, or 4 people. NEVER invent twins from ambiguous text (two
unrelated characters merely sharing a similar description is not enough).

For each twin group found, emit ONE entry in `twin_detections`:
- `source_character_key` — the ALREADY-EXISTING roster character who is the twin
  group's face source (usually whichever twin was already established/named first in
  the roster).
- `new_characters` — the OTHER twin(s) not yet in the roster, one entry per new
  sibling (so 1 entry for a twin pair, 2 entries for triplets, 3 for quadruplets):
  - `name` — a name for this sibling, distinct from the source's name (never reuse
    the same name for two different people).
  - `role` — this sibling's own story role (may differ from the source's role).
  - `shares_face_with` — set this to the EXACT SAME value as `source_character_key`
    ONLY when this sibling is described as IDENTICAL (indistinguishable at a glance)
    to the source. Omit this field (or set it to `null`) when the siblings are
    FRATERNAL (related, maybe similar, but not described as identical) — a fraternal
    sibling is simply a new independent character, not a face-sharing one.
  - `distinguishing_notes` — concrete, story-supported details that keep this
    sibling visually distinct from the source even when `shares_face_with` is set
    (hairstyle, accessories, a signature color, a habit) — REQUIRED whenever
    `shares_face_with` is set, since two identical faces still need a way for the
    viewer to tell them apart. For a fraternal sibling this can instead describe how
    they actually look different.

## Worked example 1 — outfit variants (the หนูนา case)

Input:

```json
{
  "contract_version": 1,
  "characters": [
    {
      "character_key": "character-1",
      "name": "หนูนา",
      "role": "protagonist",
      "description": "หญิงสาววัย 22 ปี ผมยาวสีดำ ผิวสีแทน ลูกสาวคนโตของครอบครัวขายก๋วยเตี๋ยว"
    },
    {
      "character_key": "character-2",
      "name": "แม่สมศรี",
      "role": "supporting",
      "description": "แม่ของหนูนา วัย 45 ปี"
    }
  ],
  "episodes": [
    {
      "episode_number": 1,
      "working_title": "เช้าวันธรรมดา",
      "logline": "หนูนาตื่นนอนในชุดนอนลายดอกไม้ ช่วยแม่จัดโต๊ะอาหารเช้าที่บ้านก่อนไปโรงเรียน",
      "key_beats": ["หนูนาตื่นนอน ใส่ชุดนอนลายดอกไม้ ลงมาช่วยแม่ที่ครัว"]
    },
    {
      "episode_number": 2,
      "working_title": "วันแรกที่โรงเรียนมัธยม",
      "logline": "หนูนาใส่ชุดนักเรียนสีขาว-กรมท่า เดินเข้าโรงเรียนมัธยมเป็นวันแรกของเทอม",
      "key_beats": ["หนูนาใส่ชุดนักเรียน เดินเข้าประตูโรงเรียนพร้อมเพื่อน"]
    },
    {
      "episode_number": 3,
      "working_title": "สอบกลางภาค",
      "logline": "หนูนาใส่ชุดนักเรียนนั่งทำข้อสอบกลางภาคในห้องเรียน",
      "key_beats": ["หนูนาใส่ชุดนักเรียน นั่งสอบในห้องเรียน"]
    },
    {
      "episode_number": 4,
      "working_title": "วันหยุดช่วยงานบ้าน",
      "logline": "หนูนาสวมเสื้อยืดเก่าและกางเกงขาสั้นสีน้ำตาล ช่วยแม่ล้างจานและถูบ้านทั้งวัน",
      "key_beats": ["หนูนาใส่ชุดทำงานบ้าน ล้างจานและถูพื้นร้านก๋วยเตี๋ยว"]
    },
    {
      "episode_number": 6,
      "working_title": "ทำความสะอาดร้านก่อนเปิด",
      "logline": "หนูนาสวมเสื้อยืดเก่าและกางเกงขาสั้นสีน้ำตาลตัวเดิม จัดโต๊ะและเช็ดพื้นร้านก่อนเปิดขาย",
      "key_beats": ["หนูนาใส่ชุดทำงานบ้าน จัดร้านก๋วยเตี๋ยวก่อนเปิด"]
    }
  ]
}
```

Output:

```json
{
  "contract_version": 1,
  "character_plans": [
    {
      "character_key": "character-1",
      "variants": [
        {
          "variant_label": "ชุดนอน",
          "variant_type": "outfit",
          "description": "floral-print pajama set, hair loose and slightly messy from sleep, no makeup, barefoot or simple house slippers",
          "applies_to_episodes": [1]
        },
        {
          "variant_label": "ชุดนักเรียน",
          "variant_type": "outfit",
          "description": "white blouse with navy pleated skirt school uniform, hair neatly tied back, no makeup, black school shoes, carrying a school bag",
          "applies_to_episodes": [2, 3]
        },
        {
          "variant_label": "ชุดทำงานบ้าน",
          "variant_type": "outfit",
          "description": "worn old t-shirt and brown shorts, hair tied up in a simple bun, sleeves pushed up, no makeup, often with a damp cleaning rag or dish gloves",
          "applies_to_episodes": [4, 6]
        }
      ]
    }
  ],
  "twin_detections": []
}
```

Note that `character-2` (แม่สมศรี) is simply omitted from `character_plans` — the
story never shows her in a different recurring outfit, so she needs no variant at all.

## Worked example 2 — an age-stage variant (flashback / time-skip)

Input:

```json
{
  "contract_version": 1,
  "characters": [
    {
      "character_key": "character-3",
      "name": "เอกชัย",
      "role": "protagonist",
      "description": "ชายวัย 35 ปี นักธุรกิจที่ประสบความสำเร็จ ใบหน้าคมเข้ม มีไฝเล็กใต้ตาซ้าย"
    }
  ],
  "episodes": [
    {
      "episode_number": 1,
      "working_title": "ความทรงจำวัยเด็ก",
      "logline": "ฉากย้อนอดีต เอกชัยวัย 8 ขวบ ตัวเล็กผอมบาง วิ่งเล่นอยู่หน้าบ้านไม้เก่าในชนบทกับพ่อแม่",
      "key_beats": ["ฉากแฟลชแบ็กเอกชัยวัยเด็ก 8 ขวบ วิ่งเล่นหน้าบ้านไม้กับพ่อแม่"]
    },
    {
      "episode_number": 2,
      "working_title": "ปัจจุบัน",
      "logline": "เอกชัยวัย 35 ปีในห้องประชุมบริษัทของตัวเอง ยังคงมีไฝเล็กใต้ตาซ้ายที่จำได้ตั้งแต่เด็ก",
      "key_beats": ["เอกชัยวัยปัจจุบันประชุมงานที่บริษัท"]
    }
  ]
}
```

Output:

```json
{
  "contract_version": 1,
  "character_plans": [
    {
      "character_key": "character-3",
      "variants": [
        {
          "variant_label": "วัยเด็ก",
          "variant_type": "age_stage",
          "description": "around 8 years old, small and thin build, rounder childlike face, short simple haircut, plain worn rural play clothes; keep the same small mole under the left eye for recognizability, but the face is naturally that of a child, not a locked copy of the adult portrait",
          "applies_to_episodes": [1]
        }
      ]
    }
  ],
  "twin_detections": []
}
```

## Worked example 3 — twin detection (one identical, one fraternal)

Input:

```json
{
  "contract_version": 1,
  "characters": [
    {
      "character_key": "character-4",
      "name": "ใบเฟิร์น",
      "role": "protagonist",
      "description": "หญิงสาววัย 20 ปี ผมตรงยาวสีดำ ผิวขาว บุคลิกร่าเริง"
    }
  ],
  "episodes": [
    {
      "episode_number": 5,
      "working_title": "ความลับของฝาแฝด",
      "logline": "เผยความจริงว่าใบเฟิร์นมีน้องสาวฝาแฝดแท้ชื่อใบตองที่หน้าเหมือนกันทุกอย่างจนแยกไม่ออก แต่ใบตองไว้ผมสั้นและใส่แว่นเสมอ ต่างจากใบเฟิร์นที่ไว้ผมยาวและไม่ใส่แว่น กับพี่ชายต่างบิดาชื่อกันต์ที่หน้าตาไม่เหมือนกันเลย",
      "key_beats": [
        "เปิดเผยว่าใบเฟิร์นมีน้องสาวฝาแฝดแท้ชื่อใบตอง หน้าเหมือนกันทุกอย่าง แยกไม่ออกถ้าไม่มีแว่นกับทรงผมสั้นของใบตอง",
        "กันต์ พี่ชายต่างบิดาของใบเฟิร์น หน้าตาคนละแบบ ไม่เหมือนกันเลย"
      ]
    }
  ]
}
```

Output:

```json
{
  "contract_version": 1,
  "character_plans": [],
  "twin_detections": [
    {
      "description": "identical twin sister revealed in episode 5, visually indistinguishable from ใบเฟิร์น except for hairstyle and glasses",
      "source_character_key": "character-4",
      "new_characters": [
        {
          "character_key_suggestion": "character-4-twin",
          "name": "ใบตอง",
          "role": "supporting",
          "shares_face_with": "character-4",
          "distinguishing_notes": "always wears glasses and keeps her hair short, opposite of ใบเฟิร์น's long hair and no glasses — this is the only way to visually tell them apart"
        }
      ]
    }
  ]
}
```

Note `กันต์` (the half-brother) is NOT included in `twin_detections` at all — the
story explicitly says he does not look alike, so he is not a twin/lookalike case;
he is simply a new independent character the calling app can add separately through
the normal character-creation flow, not something this skill proposes.

## Omit everything when nothing qualifies

When the season's story text doesn't clearly call for any outfit variant, any
age-stage variant, or any twin, return `{ "contract_version": 1, "character_plans":
[], "twin_detections": [] }`. Do not force a plan into existence to have something to
return — an empty result on a season that genuinely doesn't need variants is the
CORRECT output, not a failure.
