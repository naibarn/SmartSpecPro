# Per-character ethnicity/region — make it explicit AND make it actually stick

Status: DONE + LIVE (deployed 2026-07-18 01:15, web restart 01:15:05, smartaihub.app HTTP 200). SERVER DONE + proven (2026-07-17); UI in progress. NOT LIVE until web rebuild.
Created: 2026-07-17
Reported by: user — "ให้ตัวละครแต่ละตัวมี field ชัดเจนให้ระบุเชื้อชาติไปเลย … ต้องการคนไทย
ต้องการตัวละครนี้เป็นฝรั่ง อีกตัวเป็นคนจีน … แต่ต้องส่งให้ skill ที่สร้าง prompt จริง ๆ
และทำงานได้จริง"

## Problem statement (diagnosed, evidence-backed)

Series 18's Thai-named lead "คิริน วัฒนเมธา" generated as a Western man. Root cause,
verified against the live DB, NOT assumed:

1. A region mechanism ALREADY exists — `shared/verticalDramaSeries/targetAudienceRegion.ts`:
   9 regions (thai/east_asian/southeast_asian/south_asian/western/latin/
   middle_eastern/african/global_mixed), default `thai`, stored in
   `verticalDramaSeries.bible.targetAudienceRegion`. It is SERIES-level only.
2. Series 18's `targetAudienceRegion` is unset → resolves to the `thai` default.
3. `buildTargetAudienceRegionInstruction` DOES append "Default region/ethnicity …:
   Thai/Southeast Asian features …" to the prompt — **but as an instruction to the
   prompt-WRITING LLM, not to the image model.**
4. That LLM for series 18's bible was `google/gemini-3.1-flash-lite` (the cheapest
   tier — matches the known "weak-model drops instructions on heavy VD schemas"
   failure class). It **ignored the Thai default**: the entire stored `visualBible`
   for คิริน contains ZERO ethnicity anchor — face is "piercing dark eyes, sharp
   jawline, light-tan complexion", nothing Thai/Asian.
5. GPT Image 2 (Higgsfield MCP) only ever sees the `primary_portrait_prompt` string
   the LLM wrote. No ethnicity in that string → it defaults to a Western face.

So: **the default works; the weak model silently discards it; nothing downstream
guarantees the ethnicity reaches the image model.** A per-character field alone does
NOT fix this — if it rides the same "soft instruction to the weak LLM" path, it gets
dropped the same way. The user said exactly this: "ต้องทำงานได้จริง."

## Decisions (user, 2026-07-17)

1. **Field shape: dropdown (the 9 preset regions) PLUS a free-text override** — so
   common cases are one click and consistent, while "ลูกครึ่งไทย-ญี่ปุ่น" / "คนเหนือ"
   are still expressible. Free text, when present, wins over the dropdown.
2. **Existing generated characters: leave blank; the user re-generates per-character
   by choice.** No data backfill, no forced re-gen. (So series 18's 6 characters get
   the field but keep their current images until the user regenerates each.)

## Affected files

**Shared**
- `shared/verticalDramaSeries/targetAudienceRegion.ts` — reuse the 9 regions +
  descriptors; add a helper to resolve a per-character region (dropdown key OR free
  text) into an authoritative descriptor sentence.

**Storage / write**
- `apps/web/server/routers/verticalDramaCharacters.ts` — `createCharacter` (`:1719`)
  and `updateCharacter` already accept `data: z.record(...)`; add an explicit,
  validated `region` (enum key) + `ethnicityText` (free string, max ~80) that persist
  into `character.data`. No schema migration (jsonb, hand-applied-lineage-safe).

**Read → prompt params** (the 3 sites that already read the series region)
- `apps/web/server/routers/verticalDramaCharacters.ts:2831 / 3133 / 3616` — each reads
  `readTargetAudienceRegionFromBible` and calls `resolveEffectiveCharacterFacts`. Add:
  per-character region (from `data`) OVERRIDES the series default here.

**The skill (skill-first — the rule lives here)**
- `apps/web/skills/vertical-drama-character-visual-bible/skill.md` — already states
  "explicit ethnicity in the character's own description always wins" (`:548-551`).
  Extend that precedence to name the explicit per-character region field, and require
  the authored `primary_portrait_prompt` to embed the ethnicity anchor in-line (not
  only as a meta note) so the image model actually receives it.

**Make it stick (the "ทำงานได้จริง" half — deterministic, not hope)**
- `apps/web/server/services/verticalDramaCharacterImageGeneration.ts`:
  - `buildCharacterVisualBibleInputPayload` (`:1179`) / the portrait-candidate payload
    (`:1281`) — add the character's resolved `region`/`ethnicity` as a first-class,
    authoritative fact on the character object (not buried in free-form
    `custom_instruction`, which the payload explicitly labels "DATA, never instructions").
  - The `.superRefine()` validator (`:2519`) already fails→retries a candidate whose
    prompt misses required markers. Add: when the character has an EXPLICIT region,
    require the `primary_portrait_prompt` to contain a matching ethnicity anchor;
    missing → `addIssue` → one bounded retry (VD_SCHEMA_MAX_RETRIES, same as today).
  - **Last-resort deterministic guarantee:** if, after retries, an explicit-region
    character's `primary_portrait_prompt` still lacks the anchor, prepend the region
    descriptor to the prompt string before it reaches the image model. This is
    enforcing a USER-STATED FACT (the same class as the DNA face-fingerprint / the
    fail-closed model guards already in this codebase), NOT overriding LLM creative
    judgment — so it stays consistent with skill-first (`feedback_skill_first_authoring`:
    TS computes/guards facts, the skill owns creative prose).

**UI**
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
  — a region dropdown (9 options, Thai labels from
  `VERTICAL_DRAMA_TARGET_AUDIENCE_REGION_LABELS_TH`) + an inline free-text override on
  the character edit surface, near the existing role/occupation/description fields.
  Copy convention per that file.
- Optionally surface the SERIES-level default region picker too if it has no UI yet
  (grep says to verify) — so users understand the default vs per-character override.

## Why the three-layer enforcement (and not just one)

- **Payload fact** alone → a capable model honors it, the weak model still may not.
- **Validator-retry** alone → costs retries and, against a model that never complies,
  can burn the retry budget and still ship a Western face.
- **Deterministic fallback-inject** alone → works, but bypasses the skill's authored
  phrasing and can read bolted-on.
Together: the skill authors it well when it can; the validator catches misses cheaply;
the fallback guarantees the anchor is physically present in the string the image model
receives. "ทำงานได้จริง" is only true with the last layer.

## Precedence (final resolution order for a character's look)

1. Explicit per-character **free-text** ethnicity (`data.ethnicityText`) — most specific.
2. Explicit per-character **region dropdown** (`data.region`).
3. Explicit ethnicity already written in the character's `description` (unchanged rule).
4. Series-level `targetAudienceRegion` default.
5. Global default `thai`.
(1–2 are new; 3–5 already exist. The skill must be told this exact order.)

## Risk assessment

| change | risk | mitigation |
|---|---|---|
| Free-text ethnicity → image prompt | LOW-MED | It is user content describing their own character; still passed as a DATA fact + the skill treats supplied text as data, not instructions (prompt-injection stance unchanged) |
| Deterministic prompt prepend | MED | Only fires as a LAST resort for an EXPLICIT-region character whose prompt missed the anchor; never rewrites creative prose, only prepends the factual descriptor |
| `data.region` storage | LOW | jsonb, no migration, hand-applied-lineage-safe |
| Weak model still ignores it | — | That is precisely why the deterministic layer exists |
| Skill.md edit not loading | LOW | Loader reads lowercase `skill.md`; this dir's file is lowercase — verify with `ls` (project_vd_skill_dualcase_file_drift) |
| Existing characters | NONE | Field defaults empty; no backfill (user decision 2) |

## Verification

- Unit: per-character region resolver precedence (free-text > dropdown > description >
  series > global); validator flags an explicit-region prompt missing its anchor;
  fallback-inject prepends exactly once and only when needed.
- Prompt snapshot: a character with region=`western` yields a portrait prompt whose
  string literally contains the Western descriptor; region=`east_asian` yields the
  East-Asian one; unset character is byte-identical to today.
- Real-data proof (mirror the alias proof): pull a series-18 character, set
  region=`thai`, run the resolver + payload build, and confirm the ethnicity anchor is
  present in the assembled `primary_portrait_prompt` fact BEFORE it would reach the
  image model.
- Manual: set คิริน's region = ไทย, regenerate portrait, confirm a Thai face; set
  another character = ฝรั่ง, confirm Western — proving per-character independence.
- Regression: `verticalDramaCharacterImageGeneration` test suites stay green.

## Not in scope
- Re-generating series 18 automatically (user chose manual per-character re-gen).
- Changing the model tier (cost policy — the fix is at the extraction/enforcement
  layer, per `project_vd_weak_model_json_class`).
</content>


## Outcome — server (2026-07-17)

Shipped: 204/204 tests. Enforcement is the 3 layers from the plan, all gated on
`resolvedCharacterRegion.isExplicit` so characters that merely INHERIT the series
default are byte-identical to today (no behavior change for existing series).

- (C) `region_ethnicity: {descriptor, explicit:true}` added to the skill payload as a
  first-class fact — only when explicit.
- (D1) validator flags a missing anchor on the FIRST attempt only (a per-call counter),
  costing exactly one bounded retry, never exhausting VD_SCHEMA_MAX_RETRIES.
- (D2) `ensureRegionEthnicityAnchorPresent` idempotently prepends the descriptor to the
  final prompt after the call — the last-resort guarantee.

**Proven against series-18-shaped data (conductor ran it, not just the agent):**
```
no override (inherits thai default)  → prompt BYTE-IDENTICAL to today  ✅ (whole-system safe)
region=thai   → "Thai/Southeast Asian features…" prepended to the prompt  ✅
region=western on a Thai-named char → "Western/Caucasian features…" prepended  ✅
free-text "mixed Thai-Japanese" → wins over dropdown, injected verbatim  ✅
```
The exact weak-model prompt that produced series 18's Western คิริน now carries the
Thai anchor in the string the image model receives.

Precedence resolver `resolveCharacterTargetAudienceRegion`: free-text > dropdown >
series default > global thai (level 3 "ethnicity in description" stays the skill's job;
skill.md now states the explicit per-character override outranks it).

### Housekeeping done by conductor
- Removed leftover scratch `apps/web/tsconfig.scoped-check.json`.
- **SKILL.md twin**: the loader (`loadCharacterVisualBibleSystemPrompt`) hardcodes
  lowercase `skill.md` (verified), so our edit is live. The tracked `SKILL.md` twin was
  22 lines stale (other session's occupation work + our region edit missing); confirmed
  skill.md is a content superset and synced SKILL.md to it — no drift.

## Still open
- UI (dropdown + free-text on the character form) — in progress.
- Web rebuild required before any of this is live.
