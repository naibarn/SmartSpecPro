# Phase 2 — Mode-first Create Series: own premise vs preset, skill-first fill-everything

Date: 2026-07-31
Status: approved for implementation (owner-directed)
Follows: `plan.md` (Phase 1 — the genreHint BAD_REQUEST crash fix, already landed)

## Owner request (verbatim intent)

> user เลือกก่อนว่าจะกำหนดแนวเรื่องเอง หรือ เลือก preset. ถ้าเลือกกำหนดเอง ก็พิมพ์แนวเรื่องเข้าไปเลย
> แล้วมีปุ่มสั่งให้สร้างช่องอื่นอัตโนมัติ ด้วย skill first เป็นหลัก คิดทุกช่องให้.
> ถ้าเลือก preset หนึ่งหรือ 2 preset ขึ้นไปก็ผสมเรื่องกันออกมาด้วย skill first เช่นกัน.
> พอกดให้สร้าง ก็ช่วยสร้างข้อมูลช่องอื่น ๆ จนครบทุก tab พร้อมกับตั้งชื่อเรื่องให้เลือกสัก 4-5 แบบ

Reference premise supplied by the owner (fake-marriage CEO/secretary, hidden parentage
mystery, heavy flirtation + love scenes, both leads in every episode) — used as the
acceptance fixture.

## Gap analysis (verified against code, 2026-07-31)

1. **No title options.** `synthesizedPresetDraftSchema` (verticalDramaPresetSynthesis.ts:153)
   returns a single `title`. The owner wants 4-5 candidates to choose from.
2. **`locations` is never filled.** `WizardState.locations` (CreateSeriesWizard.tsx:159) seeds
   the durable `vertical_drama_locations` roster via `bible.locationsDraft`, and drives the
   "ตัวละคร & ฉาก" tab — but `applyPresetDraft` (lines 836-868) never writes it. So "ครบทุก tab"
   is genuinely unmet today.
3. **No mode selector.** Premise-first hero and the preset library compete on one screen. This
   is what caused the Phase 1 incident: the owner typed a premise into the 100-char Genre box.

## Design decisions

### Mode selector (new, top of step 1)

Two explicit choices, chosen BEFORE any data entry:

- **A. เขียนแนวเรื่องเอง** — premise textarea is the only required input. Presets remain
  available inside this mode as an explicitly optional "เพิ่ม preset เสริมรสชาติ (ไม่บังคับ)"
  section, collapsed by default.
- **B. เลือกจาก preset** — preset library is primary. 1 preset = apply/synthesize;
  2-5 presets = skill-first blend.

Rationale for keeping presets reachable inside mode A: premise+preset blending is an
existing, skill-supported capability (`skill.md:172-198` "Premise-Primary Blending"). A hard
either/or would delete a working feature. Mode A therefore *defaults* to premise-only
(matching the owner's example) without removing the blend.

The mode selector must not add a wizard step or change `resolveWizardSteps` — it is a
presentation gate inside the existing step 1.

### Skill contract additions (skill-first — these live in skill.md, NOT in TypeScript)

Add to `apps/web/skills/vertical-drama-preset-synthesizer/skill.md` (and its identical
`SKILL.md` twin — the loader reads lowercase first; they must stay byte-identical):

- `titleOptions`: 4-5 distinct candidate SERIES titles. Rules for what makes a good title
  (hook, length, tone match, no spoilers, locale-appropriate) belong in the skill prose, not
  in TS. `title` remains the skill's recommended default and MUST be one of `titleOptions`.
- `locations`: 3-6 recurring locations, each with a name and a short visual description,
  matching the existing "one location per line" free-text convention the wizard expects.

Both fields are **optional in the Zod schema** so an older/short model response still
validates — absence degrades to today's behavior, never a hard failure. This mirrors the
existing lenient-parse convention used for `mixRecipe.supportingFlavors`.

### Client behavior

- Title picker: when `titleOptions` is present, `applyPresetDraft` shows the 4-5 candidates
  and lets the user pick; picking writes `form.title`. Preserve the existing rule that a
  user-typed title is never silently overwritten (CreateSeriesWizard.tsx:838).
- `locations`: `applyPresetDraft` writes `draft.locations` into `form.locations` using the
  same `name — description` join convention already used for `characters`.

## Hard constraints

- **Skill-first.** No story/creative rule, title heuristic, location taxonomy, or quality
  threshold may be written in TypeScript. TS only: transport, validation, wiring, layout.
- No DB schema change, no migration. `bible.locationsDraft` already exists.
- Additive only: every new response field optional; flag-off / older responses behave exactly
  as today.
- Both TH and EN copy for every user-visible string.

## Execution order (serialized — dependent layers, per CLAUDE.md)

1. **Stage 1** — skill.md + SKILL.md twin, `synthesizedPresetDraftSchema` (+ v2 schema),
   prompt builders, service tests.
2. **Stage 2** — client: mode selector, title picker, locations apply, tests.

Stage 2 depends on Stage 1's inferred types via tRPC; they must not run in parallel.

## Verification

- Service test: a model response carrying `titleOptions` + `locations` parses; a response
  WITHOUT them still parses (backward compatibility).
- Twin check: `diff skill.md SKILL.md` is empty.
- Client test: title picker writes the chosen title; locations land in `form.locations`;
  mode selector gates which panel is primary without changing step count.
- No new `tsc` errors vs. the pre-change baseline (baseline: 60 pre-existing project errors,
  0 in CreateSeriesWizard.tsx).
