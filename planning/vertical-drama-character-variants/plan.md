# Character variants (outfit/context looks) + twin face-sharing

## Context

Currently every Vertical Drama character has exactly ONE reference portrait,
used identically for every shot in every episode
(`verticalDramaCharacterStock.ts:349-369` `getPrimaryPortraitUrl`, a hard
`LIMIT 1` per character; confirmed as the single resolution point every
consumer — storyboard, start-frame — goes through). But a character's outfit
legitimately changes by scene: sleepwear at home, school uniform, work
clothes. Today the generated image always shows the one portrait's outfit,
so it frequently contradicts the script's described scene — the AI has no
way to know a shot needs a *different look* for the *same person*.

The fix: let an LLM skill — fed the WHOLE season's story content at once, the
same way the whole-block improve-script pass already works
(`verticalDramaImproveScript.ts`) — decide what distinct "looks" (variants)
each character needs, then materialize each variant as its own addressable
character entry (same face, different hair/outfit/makeup), so storyboard
generation can pick the right one per shot. Separately: twins (2, 3, or 4
siblings, identical or fraternal) must be modeled as fully independent
characters — never variants of one person — but identical twins need their
face reference *shared* from one sibling to the others while everything else
(wardrobe, personality) stays clearly distinct so viewers can tell them apart.

This is requested as a **new final step of the existing "ปรับปรุงบทละครให้มี
ความสมบูรณ์" (improve-script) flow** — it runs automatically after the
whole-season script improvement succeeds, reusing the same whole-season
context that flow already assembles. It is NOT a separate manual button.

A third case: the SAME character can also appear at different life stages —
childhood, teen, adult, elderly (flashbacks, an aging-over-the-season story,
etc.). This is a different kind of variant from an outfit/context change:
an outfit variant keeps the SAME face 100% locked with different hair/
clothes/makeup; an age-stage variant must let the FACE itself change
naturally with age — referencing the base character's face for family
resemblance/consistent identity, but explicitly NOT a hard 100% lock, since
a child's and an elderly version of the same person legitimately look
different. Both are still "the same underlying character, multiple
presentations," so they share the same variant-row mechanism (Phase A/B) —
they differ only in HOW the identity-lock instruction is phrased when
generating the variant's portrait (Phase C).

**Decisions already confirmed with the user:**
1. Variants and twins are both stored as ordinary rows in the existing
   `vertical_drama_characters` table (not a separate table) — a variant is
   linked to its parent character; each row keeps its own `characterKey` so
   downstream shot references can address a specific look directly.
2. Twin face-sharing: one twin is the face *source*; other twins reference it
   — not a symmetric "twin group" concept.
3. Age-stage variants (childhood/teen/adult/elderly) use the same
   parent/variant row mechanism as outfit variants, distinguished by a
   variant TYPE (see Phase A) that controls how strictly Phase C locks the
   face.

## Design

### Phase A — Schema + tab reorder (small, do first, independent of everything else)

Add two nullable, self-referencing columns to `vertical_drama_characters`
(`drizzle/schema.ts:20434-20481`) — Low risk per the Database Safety
Protocol (additive, row-count check only):
- `parentCharacterId: bigint | null` (FK → `vertical_drama_characters.id`) —
  set on a variant row, pointing at its base/parent character. `null` = a
  standalone character or a parent itself.
- `variantLabel: varchar(64) | null` — short label for a variant row (e.g.
  "ชุดนักเรียน", "ชุดนอน", "ชุดทำงานบ้าน", or an age-stage label like "วัยเด็ก",
  "วัยรุ่น", "วัยผู้ใหญ่", "วัยชรา"). `null` on non-variant rows.
- `variantType: "outfit" | "age_stage" | null` — set alongside
  `variantLabel`, controls how strictly Phase C locks the face when
  generating this variant's portrait: `"outfit"` = same age, 100% face lock,
  only hair/clothing/makeup differ; `"age_stage"` = face itself may change
  naturally with age, referenced loosely against the parent for family
  resemblance/consistent identity, never a hard lock. `null` on non-variant
  rows.
- `sharesFaceWithCharacterId: bigint | null` (FK → same table) — set on a
  twin row that must reuse ANOTHER character's face reference at a 100% lock
  (same mechanism as an `"outfit"`-type variant's lock strength, just across
  two independent characters instead of parent→variant). Distinct from
  `parentCharacterId`: twins are different people (independent name,
  wardrobe, personality, `characterKey`), they just may look alike.

Reuse the SAME `getPrimaryPortraitUrl`/character-asset machinery for every
row regardless of these new fields — a variant/twin row IS a normal
character row with its own `vertical_drama_character_assets` entries; the
new columns only change how rows relate to each other, not how portraits are
generated/stored.

Move the "ตัวละคร" tab before "ตอน" in `VerticalDramaSeriesDetailPage.tsx`'s
`ALL_TABS`/`STORY_TABS` ordering (`:110-131`) and wherever the render order
is applied (`:365`) — character variant planning must exist before episode
generation makes use of it.

### Phase B — New skill: season-wide character variant planning, wired as improve-script's final step

New skill (e.g. `vertical-drama-character-variant-planner`), same folder
convention as `vertical-drama-shot-image-action` (Phase 1 of the earlier
skill-first plan — use it as the structural template again). Input: the
series' current character roster (name/role/description) + every episode's
story content, assembled via `getActiveBreakdown(bible)` the exact same way
`verticalDramaImproveScript.ts`'s whole-block pass already gathers it
(`StoryScriptEpisodeInput[]` shape, `shared/verticalDramaSeries/storyScriptText.ts:46-54`
— reuse this data-gathering code, don't reinvent it). Output, per character: the list of distinct variants needed, each with a
`type`:
- `"outfit"` variants — label + what's different (hairstyle/outfit/makeup),
  explicitly SAME age/face, for scenes at the same point in the story that
  call for a different look.
- `"age_stage"` variants — label + the age stage + how the character's
  appearance should evolve (child/teen/adult/elderly), for flashbacks or a
  story that spans years — explicitly flagged as NOT a hard face lock.
plus twin detection — when the story implies twins/lookalikes, list them as
separate character entries, marking identical twins with a "shares face
with" reference to whichever sibling should be the face source.

Wire as a new final phase inside `runImproveScriptJob`
(`verticalDramaImproveScript.ts:1184`+) — after the whole-season script
improvement pass succeeds, call this new skill with the (now-improved)
season content, then create/update `vertical_drama_characters` rows to match
its plan. **Must be idempotent**: re-running improve-script on a series that
already has variant rows from a prior run should reconcile (update
labels/descriptions, add newly-needed variants, never blindly duplicate) —
match existing variant rows by `(parentCharacterId, variantLabel)` or a
similar stable key the skill's output provides. Surface a summary to the
user at the end of the job (e.g. "สร้างตัวละครใหม่: หนูนา (ชุดนักเรียน), หนูนา
(ชุดนอน)") via the existing job-progress/result mechanism this flow already
has.

### Phase C — Face-reference generation: twins (hard lock) + outfit variants (hard lock) + age-stage variants (loose reference)

`verticalDramaCharacterImageGeneration.ts`'s `generateCharacterVisualPrompts`
currently takes one character with no concept of an external face reference
(`GenerateCharacterVisualPromptsParams`, `:477-514`). Extend it to resolve
and pass a face-reference image as an input fact (mirroring the
"ground-truth reference image as structured input" pattern established in
the skill-first plan's Phase 3) in THREE cases, each with different
lock-strength instructions taught to `vertical-drama-character-visual-bible`'s
`skill.md` (mirror its existing "weave facts into prose, never append
verbatim" convention):

- **Twin** (`sharesFaceWithCharacterId` set) — resolve the source
  character's approved portrait (`getPrimaryPortraitUrl`), pass as
  `face_source_reference` with `lock_strength: "hard"`. Instruction: lock
  the face exactly to the attached reference, but make wardrobe/hairstyle/
  styling clearly, visibly distinct — per the user's explicit requirement,
  viewers must be able to tell the twins apart at a glance.
- **Outfit variant** (`parentCharacterId` set, `variantType: "outfit"`) —
  resolve the PARENT character's approved portrait, pass as
  `face_source_reference` with `lock_strength: "hard"`. Same instruction
  style as today's identity lock (face shape/skin tone/hairstyle unchanged,
  only clothing/outfit/makeup differ per the variant's own description).
- **Age-stage variant** (`parentCharacterId` set, `variantType: "age_stage"`)
  — resolve the PARENT character's approved portrait, pass as
  `face_source_reference` with `lock_strength: "loose"`. Instruction: use
  the reference as a guide for family resemblance and consistent identity
  (bone structure, eye shape, distinguishing features that persist across
  age) — explicitly do NOT force identical facial proportions; naturally age
  the face to match the variant's age-stage description (younger/older
  skin, proportions, styling appropriate to that life stage).

Add `face_source_reference: { image_url, lock_strength: "hard" | "loose" } | null`
to the skill's input schema; `skill.md` gets one shared "Face reference
locking" section covering both strengths (mirror
`vertical-drama-shot-image-action/skill.md`'s "Soften levels" section
structure — one section, level-gated instructions, worked examples for
both).

### Phase D — Storyboard generation selects the right variant per shot

Deliberately NOT pre-assigning "episode N / shot M → variant X" during Phase
B's season-wide pass (brittle against later episode revisions). Instead:
`verticalDramaStoryboardGeneration.ts`'s `GenerateStoryboardShotgridParams.characters`
(`:293-298`) currently sends one `{characterId, name, role, referenceImageUrl}`
per base character. Extend it to include, per base character, its available
variants (`{characterKey, variantLabel, description, referenceImageUrl}[]`)
as input facts — then teach `skill.md` (already confirmed clean/skill-first
in the earlier audit) to pick the variant whose look actually matches each
shot's own scene content and emit THAT variant's `characterKey` in
`shots[].characters`/`required_character_refs`, instead of always the base
character's key. This is a per-shot creative judgment call the skill is
already positioned to make (it already has full per-shot scene detail) —
code only supplies the available-variants list as facts, never decides which
one fits.

### Phase E — Frontend: Characters tab variant/twin display

`VerticalDramaCharacterStockPanel.tsx` (`:1386-1403`, currently one flat card
per character) — group variant rows under their parent's card (e.g. parent
card + a row of variant chips/sub-cards showing each variant's label and
thumbnail) so it's visually obvious "หนูนา has 3 looks." Twin rows stay
top-level (independent) cards — annotate with a small badge when
`sharesFaceWithCharacterId` is set (e.g. "ใช้ใบหน้าเดียวกับ [ชื่อพี่/น้อง]").

## Verification

- Database Safety Protocol: row-count check on `vertical_drama_characters`
  before/after the Phase A migration; `pnpm db:push` immediately after the
  schema edit.
- `pnpm check` + relevant test files after each phase (mirror the
  independent-verification discipline used throughout the skill-first plan —
  each phase should typecheck and pass its own tests before the next starts).
- Manual, on a real series with an outfit-varying storyline (e.g. the
  หนูนา example): run improve-script, confirm variant character rows appear
  in the Characters tab grouped under หนูนา with distinct labels; generate
  each variant's portrait and confirm the outfit differs while the face
  stays recognizable; generate a storyboard for an episode spanning multiple
  contexts (morning/school/evening) and confirm each shot's chosen reference
  image matches the scene's actual described outfit. Separately test a
  twins scenario: confirm two character rows are created, confirm the
  second twin's generated portrait shares the first's face but has visibly
  different styling. Separately test an age-spanning storyline: confirm an
  age-stage variant (e.g. "วัยเด็ก") is created under the parent, and that its
  generated portrait looks like a plausible younger version of the same
  person (family resemblance) rather than either an unrelated face or a
  simple re-texture of the adult portrait.

## Work package assignment

Same Rule 1b discipline as the earlier skill-first plan: each phase delegates
to `ssp-backend`/`ssp-frontend` with a complete brief (exact files, exact
schema/skill shape, a concrete non-empty worked example for the new skill —
never an empty-placeholder example, per the `repair_queue`/
`storyboard_handoff_json` lesson from this session), independently verified
(diff review + `pnpm check` + tests) before the next phase begins. Phases
B/C/D each touch different files and can run sequentially or, where file
sets don't overlap, in parallel — verify no overlap before parallelizing
(Phase C touches `verticalDramaCharacterImageGeneration.ts` +
`vertical-drama-character-visual-bible`; Phase D touches
`verticalDramaStoryboardGeneration.ts` + `vertical-drama-storyboard-shotgrid`
— these two are disjoint and safe to run together once Phase B's schema/skill
exist).
