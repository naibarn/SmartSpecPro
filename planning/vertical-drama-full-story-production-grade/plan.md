# Vertical Drama — Production-Grade Full Story Generation (สร้างเนื้อเรื่องเต็ม + ร่างละเอียดทุกตอนย่อย)

Date: 2026-07-13
Status: In progress

## Problem statement

The "สร้างเนื้อเรื่องเต็ม + ร่างละเอียดทุกตอนย่อย" button (VerticalDramaDeepStoryDraftsPanel →
`verticalDramaSeries.generateStoryBibleDeep` → BullMQ job → `generateStoryBibleDeep()` in
`verticalDramaStoryBible.ts`) today:

1. Uses an **inline TS prompt** (`buildDeepDraftPrompts`, verticalDramaStoryBible.ts:2339) — not skill-first.
2. Shot drafts have no required **characters + per-character emotion** and no required **location** field.
3. Never creates **new scene/location slots** in `vertical_drama_locations` (Tab ฉาก) for locations the
   story invents — so scene images can't be generated from them.
4. No dialogue-accessibility rule (ภาษาเข้าใจง่ายระดับเด็กมัธยม, จำกัดศัพท์เฉพาะ).
5. The fan-out best-of-N + LLM-judge + revise-until-pass loop exists only in **premium** mode; the
   default path has no scoring loop and no hard completeness guarantee (all episodes, all fields).

## User requirements (2026-07-13)

- Per-shot synopsis must be complete: characters in the shot with explicit emotions; explicit location
  consistent with the defined scenes; if a location is new, describe it fully (place, surroundings,
  atmosphere) AND add a scene slot in Tab ฉาก for scene-image generation.
- Dialogue must be spoken Thai a high-schooler understands; domain jargon allowed but sparse.
- **Skill-first**: creative rules live in skill.md + reference guideline docs; TS computes facts only
  (existing locations, characters, episode plan) and orchestrates. Rely on LLM intelligence.
- Include the Production-Grade Vertical Drama guideline document as a skill reference.
- Loop engineering with more rounds: fan-out multiple candidates, judge, pick best, revise weakest until
  the scorecard passes the threshold BEFORE returning. Must return the complete content — full planned
  episode count, complete shot synopses, dialogue, and location/scene descriptions — in ONE run.
  Long processing time is acceptable; no second improvement pass afterwards.

## Affected files

| Area | File | Change |
|---|---|---|
| Skill (new) | `apps/web/skills/vertical-drama-full-story-architect/skill.md` | New generation skill: full-story + 9-shot drafts rules (shot completeness, dialogue accessibility, new-location declaration, JSON contract) |
| Skill (new) | `.../vertical-drama-full-story-architect/references/production-grade-vertical-drama.md` | The production-grade guideline document |
| Skill (edit) | `apps/web/skills/vertical-drama-season-dramaturgy-critic/skill.md` | draft_quality_score mode: add `shot_completeness` + `dialogue_accessibility` dimensions and criteria |
| Backend | `apps/web/server/services/verticalDramaStoryBible.ts` | Skill loader w/ references; extend zod schemas; deterministic completeness gate; loop defaults (rounds 4); prompt injects existing locations |
| Backend | `apps/web/server/routers/verticalDramaSeries.ts` | Persist `new_locations` → `vertical_drama_locations` after deep job merges; default deep generate to quality-loop mode |
| Backend | `apps/web/server/services/verticalDramaLocationReconciliation.ts` | Reuse/expose upsert for story-declared locations |
| Frontend | `apps/web/client/src/components/verticalDramaSeries/VerticalDramaDeepStoryDraftsPanel.tsx` | Client schema mirrors for new fields; CTA defaults to quality-loop (premium) mode; raise poll ceiling (~30 min); show characters/emotion/location in draft preview |
| Copy | `apps/web/client/src/components/verticalDramaSeries/verticalDramaCopy.ts` (or wherever copy lives) | Updated CTA/desc copy if needed |
| Tests | `apps/web/server/services/__tests__/*` | Schema, completeness gate, new-location persistence |

## Data contract (shared client/server)

Shot draft (extends existing `shot_number, summary, dialogue_lines[], silence_intent?, tie_in?`):

```jsonc
{
  "characters": [ { "name": "…", "emotion": "…", "emotion_after": "…?" } ], // min 1, names from Character Bible
  "location_key": "slug-64"  // must match an existing location key OR a key declared in new_locations
}
```

Chunk response (extends `{ episodeBreakdown, open_threads? }`):

```jsonc
{
  "new_locations": [ {
    "location_key": "slug-64", "name": "…",
    "description": "…",          // สถานที่ + สภาพแวดล้อมรอบข้าง
    "environment": "…",          // บรรยากาศ/แสง/รายละเอียดภาพ
    "time_of_day": "…?", "mood": "…?"
  } ]
}
```

Judge dimension keys added: `shot_completeness`, `dialogue_accessibility` (1–5, same scale as existing).

## Loop design (extends existing premium path — reuse, don't reinvent)

1. Fan-out `VD_PREMIUM_DRAFT_CANDIDATE_COUNT` (3) candidates per chunk (existing).
2. Deterministic gates (`computePremiumGateViolationCount`) + NEW completeness gate (facts only):
   every planned episode present, 9 shots each, every shot has ≥1 character w/ emotion, valid
   location_key (existing or declared), speakable dialogue. Violations feed revise instructions.
3. LLM judge via dramaturgy-critic skill (existing) with the 2 new dimensions.
4. Select winner, targeted revise below-floor/incomplete episodes; raise
   `VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS` 2 → 4; keep regression guard + keep-best-version (existing).
5. Season sweep (existing). Missing-episode corrective retry stays as final backstop.
6. The button's flow uses this loop path by default (one run, returns only complete+passing content).
7. Credit estimate (`estimatePremiumDeepDraftCalls`) updated for the new round budget.

Skill-first note (per feedback memory): scoring judgment lives in the critic skill rubric; TS only
computes factual completeness (counts/fields present) and enforces the returned scores against the
existing floor policy — no new hardcoded creative heuristics.

## Risk assessment

- `verticalDramaStoryBible.ts` is ~5k lines and shared with the shallow flow — changes must be additive;
  keep `episodeBreakdownItemSchema` base untouched for old bible versions (new fields optional at parse
  boundary for stored data; required only in the deep-draft chunk schema for NEW generations).
- Uncommitted work from another stream touches `verticalDramaEpisodePipeline.ts`, `verticalDramaPromptQc.ts`,
  `verticalDramaVideoMotionPromptGeneration.ts` (spec 028) — do NOT modify those files.
- Location inserts: dedupe by `locationKey` per series; never overwrite an existing location's data.
- Longer loop → longer jobs: raise client poll ceiling; BullMQ job has no wall-clock timeout (OK).
- Do not change model selection logic (user policy: respect model routing).

## Verification steps

1. `cd apps/web && pnpm check` (typecheck) — no new errors.
2. Vitest: new/updated tests for schemas, completeness gate, location upsert pass; existing VD tests pass.
3. Manual: trigger deep generate on a dev series; confirm job completes, bible contains characters/
   emotions/location_key per shot, new locations appear in Tab ฉาก, episode count matches plan.
4. `npm run build:deploy` + `sudo systemctl restart smartspec-web.service` (server files changed).

## Integration reconciliation (conductor, post-agent)

Two client/server contract mismatches between the parallel agents were found and fixed:
1. Job-result field: backend exposes `createdLocationCount` (number); frontend read
   `createdLocations` (array). Fixed `resolveDeepDraftCreatedLocationsCount` to read the number
   (legacy array shape still tolerated) + type annotation.
2. Credit estimate mirror: backend bumped `estimatePremiumDeepDraftCalls` to `chunkCount*10+2`;
   frontend `computePremiumDeepDraftCallEstimate` still `*6+2` — synced + updated its tests
   (pureHelpers + actions `~32 ครั้งเรียก`).
3. Score-dimension mirror: fully synced client `PREMIUM_DRAFT_SCORE_DIMENSIONS` (8 → 14) with copy,
   panel `draftScorecardSchema` (6 new dims `.optional()` for legacy scorecards), null-safe
   `selectBelowFloorPremiumDimensions`, and the copy test — so `shot_completeness` /
   `dialogue_accessibility` (the two new quality bars) show in the scorecard + below-floor list.

## Extend-horizon parity (follow-up, done 2026-07-14)

`runExtendStoryDraftHorizonJob` (the "ขยายตอน / extend horizon" flow) was wired to full
scene-system parity with `runGenerateStoryBibleDeepJob`, mirroring its exact pattern:
- Loads `existingLocations` (via `loadSeriesLocationFacts`) + `characterBibleNames` before
  generation and threads them into `generateStoryBibleDeep` (feeds the "EXISTING LOCATIONS"
  prompt block + completeness gate).
- Persists `result.newLocations` into `vertical_drama_locations` (Tab ฉาก) after the bible write
  via `persistDeepDraftDeclaredLocations` (best-effort, never overwrites existing keys).
- Adds `createdLocationCount` to the extend audit event + job result (client toast already reads it).
Extend already inherited skill-first prompt + completeness gate (same `generateStoryBibleDeep`
service). The premium quality-loop remains an explicit opt-in for extend (frontend checkbox,
unchanged) — a UX/cost choice, not a scene-system concern. Router typecheck clean; extend +
location test suites green (1 unrelated pre-existing `criteriaVersionMarker` drift in
`updateEpisodeDraftDialogue`).

## Deploy note

NOT auto-deployed. The working tree also holds an unrelated in-flight workstream (spec 028
native-audio invariant: modified `VerticalDramaEpisodePage.tsx`, `verticalDramaEpisodePipeline.ts`,
`verticalDramaPromptQc.ts`, `verticalDramaVideoMotionPromptGeneration.ts`, new
`verticalDramaStoryboardRevision.ts`, plus ~10 failing native-audio/storyboard tests). Because
`build:deploy` serves straight from this checkout, deploying now would ship that incomplete work
too. Deploy timing is left to the user. When ready: `cd apps/web && npm run build:deploy` then
`sudo systemctl restart smartspec-web.service` (server .ts changed).

## Progress

- [x] Discovery (flow trace + infra map)
- [x] Skill files authored
- [x] Backend implementation (verticalDramaStoryBible.ts, verticalDramaSeries.ts,
      verticalDramaLocationReconciliation.ts — skill-first prompt loader,
      existing-locations FACT injection, schema extensions, deterministic
      completeness gate, revise-round increase 2→4, shot_completeness/
      dialogue_accessibility judge dimensions, new-location persistence,
      premium default. See backend agent's Result Report for file-by-file detail.)
- [x] Frontend implementation
- [x] Backend tests green (519 passing / 5 pre-existing unrelated failures,
      35 new tests added) + backend typecheck clean (0 new errors)
- [x] Frontend tests green (all touched-file tests pass after integration fixes;
      25 failures across 10 files confirmed pre-existing spec-028 workstream,
      none reference changed exports) + frontend typecheck clean (0 new errors)
- [ ] Deployed — deferred to user (mixed working tree, see Deploy note)
