# Premise-first series wizard — your idea is the spine, presets are seasoning

Status: DONE + LIVE (deployed 2026-07-18 01:15, web restart 01:15:05, smartaihub.app HTTP 200). DONE (2026-07-17 20:49)
Created: 2026-07-17
Reported by: user — "user อาจมีโครงเรื่องในใจ อยากจะพิมพ์ลงไปเลย … ปัจจุบันพอไม่มี
preset ตรง user ต้องเสียเวลาไปกรอกทีละช่องของทุกหน้าใน wizard เองทั้งหมด ซึ่ง user
ไม่มีข้อมูลที่สามารถไปกรอกได้เองขนาดนั้น"

## Problem statement

A user with a story in mind — e.g. *"พระเอกเป็นนักบิน นางเอกเป็นพนักงานภาคพื้น
อยากไต่เต้าไปทำงานบนเครื่อง มีปมเป็นเด็กกำพร้า"* — cannot get the wizard to build
anything for them. They must hand-fill every field of every step: โครงเรื่อง, โทน,
ตัวละคร, ฉาก — information they simply do not have.

**CORRECTION (2026-07-17 20:30).** An earlier draft of this plan claimed the
premise textarea was "silently discarded by the server because the tenant flag is
off". **That was WRONG and is retracted.** It came from querying
`tenants.settings->'featureFlags'` — the wrong place. Flags live in a dedicated
`tenants.featureFlags` COLUMN (`tenantFeatureFlagService.ts:182` `getTenantFeatureFlags`
selects `tenants.featureFlags`).

The truth, from the correct column:

| tenant | `verticalDramaUserPremise` | flags set |
|---|---|---|
| **Smart AI Hub** (`tenant-ZCSKEM9s`) — **owns series 18, i.e. the user's tenant** | **`true` — ALREADY ON** | 199 |
| SmartSpec Pro (`tenant-001`) | `false` (deliberately) | 199 |
| `__system__` | absent | 0 |

So **the premise IS honored** for this user; the prompt already treats it as the
story spine. No flag change is needed, and none was made. `shared/featureFlags.ts:620`'s
`false` is only the DEFAULT for a tenant with no explicit value — Smart AI Hub has one.

The real blockers are the two gates below, which is exactly what the user described.

## What is already built and already ON

This is a GATE problem, not a build problem — the capability exists and is enabled;
two hard-coded minimums simply refuse to let the user reach it:

- `verticalDramaPresetSynthesis.ts:272-281` — `buildUserPremisePrimaryBlock`
  already renders *"The user premise is the primary story spine. Setting,
  protagonist, core…"* into the prompt.
- `evaluatePremiseCoverage()` (`:407`) already scores whether the synthesized
  draft actually covered the user's premise.
- `resolveMixSelections()` (`:675`) already guards `selections.length > 0` — it
  tolerates zero presets.
- The zod input (`verticalDramaSeries.ts:3573`) has NO minimum: `.max(5).optional()`.
- `userPremise` is already in the synthesize input ("same contract as
  `createSeriesInput.userPremise`").
- 5 test files already cover the premise path, incl. a dedicated
  `verticalDramaSeries.userPremise.test.ts`.
- The flag is already exposed in Admin → tenant flags as "User Premise"
  (`tenantFeatureFlagGroups.ts:197`).

## Root cause of "ต้องกรอกเองทุกช่อง"

1. ~~The flag is off → premise ignored entirely.~~ **RETRACTED — see the CORRECTION
   above. The flag is ON for this user's tenant; the premise is honored.**
2. **`MIN_SELECTIONS = 2`** (`verticalDramaPresetSynthesis.ts:70`) blocks synthesis
   below two "story flavors", enforced twice:
   - server `validatePresetSynthesisSelection` (`:579`)
   - client `handleSynthesizePreset` (`CreateSeriesWizard.tsx:393`) — a hard toast
     + `return`.
   Note the gate counts `selectedPresets.length + selectedCategories.length`.
3. **One preset = verbatim copy, no AI.** `applyPreset` (`CreateSeriesWizard.tsx:282`)
   writes `genre`/`logline`/`mainPlot`/`seasonArc`/`tone`/`cliffhangerStyle`/
   `characters` straight from the preset into the form. No synthesis, no premise.
   This is exactly the user's complaint: *"ของเดิมพอเลือก preset อันเดียวระบบจะ fix
   ทุกช่องตาม preset ต้องมานั่งไล่แก้ไขเองเสียเวลา"*.
4. **The layout says the opposite of the intent.** Step 1 is
   `lg:grid-cols-[minmax(0,2.35fr)_minmax(22rem,0.85fr)]` (`:865`) — presets get the
   wide left column, the premise a narrow right rail. The user read it exactly as
   built: *"เดิมช่องที่กรอกอยู่ฝั่งขวา เลยมองว่าเป็นข้อมูลที่ใส่หลังผสม preset"*.
   `hasUserPremise` (`:931`) currently only drives a badge (`:1645`) — its own
   comment says "it does not itself gate anything".

## Target behaviour (user-decided 2026-07-17)

**The premise is the spine; presets are supplements that fill it out. Never the
reverse.**

| premise | presets | today | target |
|---|---|---|---|
| yes | 0 | **impossible** (gate blocks) | AI synthesizes every field from the premise |
| yes | 1 | `applyPreset` overwrites all fields, premise dropped | AI synthesis: premise primary, preset as flavour |
| yes | 2+ | AI mix of presets, premise dropped (flag off) | AI synthesis: premise primary, presets as flavour |
| no | 1 | verbatim copy (fine — nothing else to go on) | unchanged |
| no | 2+ | AI mix | unchanged |
| no | 0 | manual | unchanged |

## Proposed changes

### Phase 1 — CANCELLED (not needed)
The flag is already `true` for the user's tenant (see the CORRECTION above). The
user's "เปิดให้ทุกเทนันต์เลย" approval was given on my incorrect information, so it is
NOT acted on: `tenant-001` has a deliberate `false` and is left untouched pending a
decision made on correct facts. A `tenants` backup was taken before this was
understood and is retained anyway: `.db-backups/tenants_20260717_202841.sql`.
NO DATA WAS MODIFIED.

### Phase 2 — let the premise stand alone (server)
2.1 `validatePresetSynthesisSelection` takes a `hasUserPremise` fact. When true,
allow 0..MAX selections; when false, keep MIN 2 exactly as today. Keep the MAX 5
rule in both cases. Same "omit → behave exactly as before" convention this codebase
uses everywhere.
2.2 Thread it from both `synthesizeVerticalDramaPreset` and
`synthesizeVerticalDramaPresetV2` (`:592`, `:1076`) — both call the validator.
2.3 Confirm the prompt is coherent with zero presets: `buildFacetAssignments`/
`resolveMixSelections` already tolerate it, but the "primary owns `story_spine`"
language (spec §8.2.2.C.1) assumes a primary PRESET. With no presets, the PREMISE
owns the spine. Verify the rendered prompt says something sane and does not
reference a non-existent primary.

### Phase 3 — flow: premise wins over verbatim copy (client)
3.1 `handleSynthesizePreset` gate (`:393`): allow when `userPremise` is non-empty
OR `mixPresetIds.length >= 2`. Keep the error for the genuinely-empty case (no
premise AND <2 presets) — that request cannot produce anything.
3.2 When a premise is present, selecting ONE preset must NOT `applyPreset` verbatim.
Route through synthesis so the preset becomes flavour on the user's spine.
Preserve today's verbatim behaviour when there is NO premise (nothing else to
build from).
3.3 Button label must match what it will actually do:
- premise, 0 presets → "ให้ AI สร้างโครงเรื่องจากโจทย์"
- premise, 1+ presets → "ให้ AI ผสมโจทย์กับ preset"
- no premise, 2+ presets → "ให้ AI ผสมเป็น Preset" (unchanged)
"ผสม" with nothing to mix is nonsense copy.
3.4 Surface `evaluatePremiseCoverage`'s verdict if it isn't already — the user
should be told when the AI drifted from their premise.

### Phase 4 — layout says what the system means
4.1 Promote the premise to the primary input of step 1: it comes FIRST and reads as
the main event; presets become a clearly-optional "เสริมให้สมบูรณ์ (ไม่บังคับ)"
section. Invert or restructure the `2.35fr / 0.85fr` split accordingly.
4.2 The premise's helper copy already says "ระบบจะใช้โจทย์ของคุณเป็นแกนเรื่องหลัก
แล้วนำ preset ที่เลือก (1–5 แบบ) มาผสม" — note it says **1–5**, contradicting the
2-preset minimum it ships with. After Phase 2 the copy becomes true; adjust to
"0–5" / "ไม่เลือกก็ได้".
4.3 All copy in `verticalDramaWorkspaceCopy.ts` conventions; Thai; light+dark.

## Risk assessment

| change | risk | mitigation |
|---|---|---|
| ~~Enabling the flag~~ | — | CANCELLED — already on for the user's tenant; no change made |
| Relaxing MIN_SELECTIONS | LOW-MED | Only relaxes when a premise exists; no-premise path byte-identical |
| Not applying a single preset verbatim | MEDIUM | Behaviour change users may notice. Only when a premise exists — i.e. only when they asked for something else |
| Step-1 layout reflow | MEDIUM | Pure visual; `CreateSeriesWizard.tsx` is 2102 lines and has existing test coverage — keep pure logic untouched |
| Prompt with 0 presets | MEDIUM | The "primary preset owns the spine" spec language predates this; must verify the rendered prompt, not assume |

## Verification

- Unit: validator allows 0 with premise / still blocks 0 without / still caps at 5.
- Prompt snapshot: premise-only renders a coherent prompt with no dangling
  "primary preset" reference.
- Client: gate allows premise-only; single preset + premise routes to synthesis;
  single preset without premise still applies verbatim; button label per state.
- Manual, with the user's own example: type *"พระเอกเป็นนักบิน นางเอกเป็นพนักงาน
  ภาคพื้น…"*, press the button with 0 presets, and confirm every downstream wizard
  step arrives pre-filled and on-premise.
- Existing suites: `verticalDramaPresetSynthesis.test.ts`,
  `verticalDramaSeries.userPremise.test.ts`, `verticalDramaStoryBible.feature132.test.ts`,
  `CreateSeriesWizard`-related client tests must stay green.

## Dependency / sequencing note

The web service has NOT been restarted (see
`planning/vd-character-identity-repair/plan.md`) and the working tree carries ~146
files of other sessions' in-flight work. **Nothing in this plan becomes visible
until a restart** — including Phase 1's flag flip. Sequence the restart
deliberately with the user, not as a side effect of this work.
</content>


## Outcome (2026-07-17 20:49)

Phases 2/3/4 shipped; Phase 1 cancelled (flag was already on — see the CORRECTION).

**Two real bugs surfaced only because Phase 2.3 demanded the zero-preset prompt be
RENDERED rather than assumed coherent:**

1. `buildFacetAssignments` seeded `primarySelectionId` into all 8 facets with no
   check that it names a real preset. With zero presets it falls back to the
   literal string `"auto"`, so the prompt "assigned" every facet to a preset called
   `"auto"` that does not exist, then instructed the model to blend it. Fixed by
   only seeding when `knownIds.has(primarySelectionId)`.
2. `mixRecipe.supportingFlavors` was `z.array(...).min(1)` — with zero presets the
   model was FORCED to fabricate a supporting flavour just to pass validation.
   Relaxed (a schema relaxation only accepts a superset of previously-valid
   responses, so existing 2+-preset flows are unaffected).

The premise-only prompt now reads: *"No preset or category was selected — the user
premise above is the sole story spine. Do not invent, reference, or blend a preset
that was not selected."*, with `assignedPresets: []` across all 8 facets.

**Client** — new exported pure function `resolveCreateSeriesPresetAction({hasUserPremise, presetCount, lang})`
returning one of `apply_preset_verbatim | synthesize_from_premise_only |
synthesize_premise_and_presets | synthesize_presets_only | blocked`, plus the
button label. `blocked` now happens ONLY at no-premise + 0 presets.
With a premise + 1 preset the verbatim "ใช้ Preset นี้" button no longer renders at
all — so a click can never silently do nothing; the CTA becomes
"ให้ AI ผสมโจทย์กับ preset".

**Layout** — the premise is now a full-width hero at the top of step 1; below it the
columns are inverted, with "ข้อมูลพื้นฐาน" taking the wide 2.35fr column and the
preset library demoted to the 0.85fr rail with an explicit
"เสริมให้สมบูรณ์ (ไม่บังคับ)" badge. Helper copy's false "1–5 แบบ" claim corrected to
"0–5 แบบ ไม่บังคับ".

**Brief error worth recording:** the brief named `verticalDramaWorkspaceCopy.ts` as
the copy destination. That file is scoped to the EPISODE workspace, has no `t()`,
and `CreateSeriesWizard.tsx` has never imported it — the wizard uses
`verticalDramaCopy.ts` plus inline `lang === "th" ? … : …` ternaries for ~95% of its
strings. The agent followed the component's real convention instead of the brief.
Correct call.

Deferred: Phase 3.4 (surface `evaluatePremiseCoverage`'s verdict to the user) — the
scoring already runs server-side; nothing shows it in the UI yet.

Verification: 151/151 across `verticalDramaPresetSynthesis`, `verticalDramaSeries.userPremise`,
`verticalDramaStoryBible.feature132`, `CreateSeriesWizard`(+2 helper suites). Client
VD baseline unchanged (same pre-existing 9 files / 23 tests from other sessions).


## Phase 3.4 completed (2026-07-18 02:2x)

Re-checked: `evaluatePremiseCoverage` already runs server-side and appends a
`premise_coverage_low` warning to `draft.warnings`, and the wizard already renders a
warning in an amber box. BUT it rendered only `draft.warnings[0]` while the
premise-coverage warning is APPENDED to the END — so a preceding technical warning
(`preset_field_length_clamped`) could bury the one the creator most needs ("the AI
drifted from your premise"). Fixed the client to render EVERY warning, with the
premise-coverage warning sorted first. Conductor edit (3 lines → a sorted map),
typecheck clean, 26/26 wizard tests green.
