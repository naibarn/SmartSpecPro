# VD Character Identity — fix the roster + repair existing series

Status: DONE + LIVE (deployed 2026-07-18 01:15, web restart 01:15:05, smartaihub.app HTTP 200). DONE except the merge REVIEW UI (3.4) and Phase 2.6. Series 18 repaired + series 7 defused 2026-07-17. **The server-side fixes are on disk but NOT LIVE
Created: 2026-07-17
Reported by: user (screenshot of `/drama-series/18`, 16 junk characters)

## Problem statement

`/drama-series/18` shows 16 characters in "ตัวละครในซีรีย์", all badged
"ต้องตรวจบทบาท" + "auto-สร้างจากเรื่อง — ยังต้องทำ DNA/ภาพ". The true cast is 6.

Verified against the live DB (read-only), NOT assumed:

```
-- vertical_drama_characters WHERE seriesId=18  → 16 rows
-- ALL: narrativeRole=NULL, roleTier=NULL, roleReviewStatus=needs_role_review,
--      data.source=auto_registered_from_story
-- characterKey: character, character-2 … character-14, plus lalin, kirin
```

But `vertical_drama_series.bible->'refinedCharacters'` for the same series is
**clean and complete** — 6 characters, each with `role`, `narrativeRole` AND
`roleTier` populated:

| name | narrativeRole | roleTier |
|---|---|---|
| คิริน วัฒนเมธา | protagonist | lead_male |
| ลลิน ศิริกุล | co_protagonist | lead_female |
| ธีร์ | supporting | second_lead_male |
| เมฆ | supporting | support_memorable |
| พิมพ์ชนก | supporting | rival_female |
| วรุตม์ | antagonist | villain_male_open |

So the LLM did its job. **Our code discards the data it already has, then
re-invents worse data from drifted spellings.**

Name occurrences across the persisted deep-draft (`bible.breakdownVersions[].items[].shotDrafts[]`):

| name | in shot `characters[]` | as dialogue `speaker` |
|---|---|---|
| ลลิน | 187 | 194 |
| คิริน | 176 | 190 |
| วรุตม์ | 37 | 35 |
| คีริน | 32 | 33 |
| ลลิณ | 23 | 31 |
| ธีร์ | 20 | 16 |
| พิมพ์ชนก | 17 | 23 |
| Lalin | 16 | 20 |
| เมฆ | 14 | 6 |
| Kirin | 14 | 20 |
| กิริน | 9 | 12 |
| ลลนารี | 6 | 6 |
| ลริน | 6 | 8 |
| คิรัน | 5 | 7 |
| วิทยุสื่อสาร | 0 | 2 |

Two DISTINCT failure classes are tangled together here, and they need different fixes:

1. **Legitimate short-form usage** — `คิริน` for `คิริน วัฒนเมธา`, `ลลิน` for
   `ลลิน ศิริกุล`. This is *correct Thai drama writing*; nobody says a full name
   every line. **Our contract is at fault**: the system has no concept of a
   canonical name + its aliases, so it reads a natural given-name as a stranger.
2. **Genuine spelling/transliteration drift** — `คีริน`, `กิริน`, `คิรัน`,
   `ลลิณ`, `ลริน`, `ลลนารี`, `Kirin`, `Lalin`. Model sloppiness that we neither
   prevent nor absorb.

### The drift is per-episode, and it proves the diagnosis

Distinct `characters[].name` values used, per episode, in series 18's deep draft:

| episode | names used |
|---|---|
| 1, 2, 4-9, 11, 15-18, 20 | `คิริน` + `ลลิน` (14 episodes agree) |
| 3 | `Kirin` + `Lalin` (romanized, whole episode) |
| 10, 13 | `คีริน` + `ลลิณ` |
| 12 | `คิรัน` + `ลลนารี` |
| 14 | `กิริน` + `ลริน` |
| 19 | `คีริน` + `ลลิน` (mixed) |

Each episode is internally CONSISTENT and drifts from its neighbours — exactly the
signature of a model re-guessing a name per chunk because no roster is pinned in its
context. And the decisive fact: **the bible's full name `คิริน วัฒนเมธา` appears in
0 of 20 episodes.** Not once. The model never saw the string.

14 of 20 episodes independently chose `คิริน` / `ลลิน`. That is the model telling us
what the canonical short form should be — which is precisely what `aliases` will
declare.

Episode 12 confirms identity beyond doubt: `ลลนารี` investigates AOG records as the
flight-ops coordinator and `คิรัน` finds the duplicated shift rosters as the engineer
— the exact roles of `ลลิน ศิริกุล` and `คิริน วัฒนเมธา` — and the antagonist
`วรุตม์` addresses her by name in-scene ("คุณเก่งนะลลนารี"). Same people, drifted
spelling. This is what makes the merge groups human-verifiable rather than a guess.

Note `วิทยุสื่อสาร` ("walkie-talkie") speaks 2 lines — exactly
`MIN_QUALIFYING_SPEAKER_LINE_COUNT`, so a *device* is one line away from
becoming a cast member. The junk denylist cannot scale to this.

## Root cause chain (each link verified in code)

1. **THE PRIMARY CAUSE — we command the model to copy a list we never give it.**
   `skill.md:56` DOES state the rule, clearly:
   > `name` — EXACTLY as spelled in the character bible. Never invent a new named character

   (An earlier draft of this plan claimed the skill had no naming rule. That was
   WRONG — the first grep used the wrong terms. Corrected here.)

   But `buildDeepDraftPrompts` (`verticalDramaStoryBible.ts:2916`) **has no
   character-roster parameter at all**, and the assembled `userPrompt`
   (`:3094-3106`) is exactly:
   `userPremise, audienceAgeRating, title, genre, tone, recapText,`
   **`knownLocationsBlock`**`, episodesPayload, VD_COMPACT_JSON_INSTRUCTION`.

   Locations get a rendered "EXISTING LOCATIONS" FACT block so the model reuses
   an established key instead of inventing one. **Characters get nothing.** The
   model never sees the string `คิริน วัฒนเมธา` anywhere in its context — it can
   only infer names from `recapText` and the episode loglines/keyBeats, which use
   whatever short form an earlier stage happened to write.

   So the model is told "copy the bible exactly", is handed no bible, improvises
   a spelling — and then the gate validates its improvisation against the full
   names it was never shown. That is why the violation rate is high enough that
   one corrective retry cannot clear it.

   **This is the highest-value fix in this plan and it is ~10 lines**: render a
   CHARACTER BIBLE fact block, mirroring `knownLocations`, listing each canonical
   name + declared aliases.

1b. **`dialogue_lines[].speaker` is ungoverned.** `grep -i speaker skill.md`
   returns exactly one hit (`:121`, about the speaker's face being legible in
   frame). The rule at `:56` binds `characters[].name` only. Yet
   `selectStoryIntroducedCharacterNames` treats a speaker with >=2 lines as
   grounds to mint a roster row — so the widest creation path is the one with no
   rule and no gate. Note the craft guideline
   (`references/production-grade-vertical-drama.md:411`) correctly says
   "ไม่เรียกชื่อกันทุกประโยค" — good writing advice that says nothing about the
   `speaker` metadata field.

2. **The completeness gate is advisory, not fail-closed.**
   `verticalDramaStoryBible.ts:3839-3856` — on violation it issues ONE corrective
   retry; if that retry still fails it keeps attempt #1 verbatim
   ("never throws away what the first attempt DID successfully draft").
   Drifted names are therefore *detected and then persisted anyway*.

3. **The gate never checks dialogue speakers.**
   `computeShotCompletenessViolations` (`:2282`) validates `shot.characters[].name`
   against `characterBibleNames` but ignores `dialogue_lines[].speaker` — yet
   `selectStoryIntroducedCharacterNames` accepts a speaker with ≥2 lines as
   grounds to mint a roster row. The creation path is wider than the gate.

4. **Auto-register throws away the role data it is handed.**
   `verticalDramaSeries.ts:1745` and `:2209` call
   `refinedCharacters: characterBibleNames.map(name => ({ name }))` — dropping
   role/tier/narrativeRole at the call site — and
   `verticalDramaCharacterRosterAutoRegister.ts:359-360` hardcodes
   `narrativeRole: null, roleTier: null` at the INSERT.
   **This alone explains every "ต้องตรวจบทบาท" badge in the screenshot.** The
   bible has the answer; we write NULL over it.

5. **Dedup is exact-normalized only.** `normalizeStoryCharacterName` (`:117`) is
   `.trim().toLowerCase().replace(/\s+/g," ")`. `คิริน` ≠ `คิริน วัฒนเมธา`, so both
   insert. No fuzzy, no alias, by design.

6. **`reconcileCharactersFromStoryBible` is UPDATE-only and silently no-ops.**
   `verticalDramaSeries.ts:2776` — looks up by exact normalized name, `continue`s
   on miss. It consumes the *same* `refinedCharacters` list that auto-register
   inserts from, and the two disagree: one can't find `คิริน`, the other happily
   creates it.

7. **`characterKey` is meaningless for Thai.** `slugifyForCharacterKey` does
   `.replace(/[^a-z0-9]+/g,"-")`; Thai is entirely outside `[a-z0-9]`, so every
   Thai name slugifies to `""` → literal fallback `"character"` → `character-2`,
   `character-3`… The UNIQUE index on `(seriesId, characterKey)` thus protects
   nothing, and the suffix loop **converts** would-be collisions into successful
   duplicate inserts.

8. **No repair capability exists.** Confirmed zero matches for
   `mergeCharacters|characterAlias|renameCharacter|dedupeCharacters` across
   `server/`, `shared/`, `client/src/`. `updateCharacter` can rename but cannot
   change `characterKey`, so refs dangle. `deleteCharacter` throws
   PRECONDITION_FAILED when variants/twins point at the row.
   `verticalDramaShotCharacterRepair.ts` repairs per-shot ref slots, not identity.

9. **UI defects** (`VerticalDramaCharacterStockPanel.tsx`): badges use `w-fit`
   (`:3724,3729,3741,3759,3778`) inside a `min-w-0` flex column — `fit-content`
   ignores the parent's shrink, and shadcn `Badge` is `whitespace-nowrap`, so the
   long fuchsia label can't wrap or truncate; the card wrapper (`:3512`) has no
   `overflow-hidden` to clip it. Icon row (`:4218`) is `justify-end` with no
   `flex-wrap`, ~160px of buttons in a ~200px column.

## Blast radius (measured 2026-07-17, live DB)

The duplicate-roster problem is **exclusive to series 18**. Every other series has
`auto_registered_from_story` = 0 — auto-register is new and series 18 is its first
subject. Series 18 also has **zero** downstream references, which makes its repair
far safer than feared:

| check | series 18 |
|---|---|
| episodes with `startFramePlan` (holds `requiredCharacterRefs`) | 0 of 5 |
| episodes with `storyboard` | 0 |
| rows with `parentCharacterId` / `sharesFaceWithCharacterId` (the circular FK) | 0 / 0 |
| `vertical_drama_character_assets` links | 0 |

So merging series 18 needs no ref rewrite, no FK repointing, and destroys no
generated imagery. The general merge tool still needs the full rewrite path for
series that DO have plans (series 16 has 20 such episodes, series 17 has 9) — but
none of those have duplicates today, so that path is insurance, not urgency.

**Separately, a genuinely systemic defect**: the Thai-slugify bug has produced a
useless `characterKey` (`character`, `character-2`, …) for **65 of 76 rows across
all 10 series**. Phase 1 fixes this for new rows only; existing keys are load-bearing
for series 16/17's start-frame plans and must not be rewritten.

## Affected files

**Schema/DB**
- `apps/web/drizzle/schema.ts` — new `verticalDramaCharacterAliases`
- new `apps/web/drizzle/manual_vertical_drama_character_aliases.sql`
  (this table's lineage is hand-applied — drizzle-kit generate is blocked by a
  meta-journal collision, per `manual_vertical_drama_131.sql` precedent)

**Skill (skill-first — the creative rule lives here, not in TS)**
- `apps/web/skills/vertical-drama-full-story-architect/skill.md`

**Server**
- `apps/web/server/services/verticalDramaCharacterRosterAutoRegister.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/routers/verticalDramaCharacters.ts`
- new `apps/web/server/services/verticalDramaCharacterIdentity.ts` (resolver)
- new `apps/web/server/services/verticalDramaCharacterMerge.ts` (repair)

**Client**
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaCharacterStockPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`

## Proposed changes

### Phase 0 — Backup (Database Safety Protocol, blocking)
```bash
pg_dump "$DATABASE_URL" --data-only --table=vertical_drama_characters \
  --file=".db-backups/vertical_drama_characters_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=vertical_drama_series \
  --file=".db-backups/vertical_drama_series_$(date +%Y%m%d_%H%M%S).sql"
pg_dump "$DATABASE_URL" --data-only --table=vertical_drama_episodes \
  --file=".db-backups/vertical_drama_episodes_$(date +%Y%m%d_%H%M%S).sql"
psql "$DATABASE_URL" -c "SELECT count(*) FROM vertical_drama_characters;"  # baseline
```

**DONE 2026-07-17 13:52** — `.db-backups/vertical_drama_{characters,series,episodes}_20260717_135244.sql`
Baseline: characters=76 (series18=16), series=10, episodes=106.

### Phase 1 — Stop the bleeding (no new concepts, pure bug fixes) — **DONE 2026-07-17**
*19/19 unit tests pass. Note: the plan said thread `readBibleRefinedCharacters(bible)`; that
function strips entries to `{name}` only — the correct one is
`readBibleRefinedCharacterProfiles`, which is what was used. Plan text below is left
as originally written; this note is the correction.*
1.1 Thread the full refined character through, not just its name:
`refinedCharacters: characterBibleNames.map(name => ({name}))` →
pass `readBibleRefinedCharacters(bible)` entries whole
(`name, role, narrativeRole, roleTier, occupation`).
1.2 `ensureRosterCharactersFromStory` INSERTs those fields instead of NULL, and
sets `roleReviewStatus: "ready"` when both narrativeRole+roleTier are present
(matching `seedCharactersFromDraft`'s existing rule), `roleProvenance:"ai_assigned"`.
1.3 Fix `slugifyForCharacterKey` for non-Latin: transliterate, else derive a
stable key from a short content hash — never the `"character"` literal.
**Existing keys are NOT rewritten here** (refs point at them); Phase 3 migrates.

*After 1.1-1.2 alone, a fresh series stops producing "ต้องตรวจบทบาท" cards.*

### Phase 2 — Canonical identity + alias contract (the real fix)
2.0 **[DO THIS FIRST — highest value/effort ratio in the whole plan]** Give
`buildDeepDraftPrompts` a `knownCharacters` param and render a CHARACTER BIBLE
fact block into `userPrompt`, mirroring `knownLocationsBlock` exactly (same
optional-param + honest-empty-block contract its doc comment describes). Thread
`readBibleRefinedCharacters(bible)` in from both call sites. Without this, every
other naming rule in this plan is unenforceable — the model cannot obey a list it
cannot see.
2.1 **Skill contract** (`skill.md`): the Story Bible must declare, per character,
a `canonical_name` plus an explicit `aliases[]` (given name, nickname,
romanization, honorific forms) — and every `shotDrafts[].characters[].name` and
`dialogue_lines[].speaker` MUST be one of those declared strings, never a new
coinage. Per `feedback_skill_first_authoring`, the *rule* is authored in the
skill; TS only computes facts and enforces the declared contract.
2.2 New `vertical_drama_character_aliases` table:
`(id, tenantId, seriesId, characterId FK CASCADE, alias varchar(255),
 normalizedAlias varchar(255), source varchar(24), createdAt)`
with **UNIQUE `(seriesId, normalizedAlias)`** — a DB-level guarantee that one
spelling can resolve to exactly one character. This is the guard
`(seriesId, characterKey)` was never able to be.
2.3 New `verticalDramaCharacterIdentity.ts` — `resolveCharacterName()` cascade:
exact characterKey → exact normalized name → **alias table** → declared-alias
from bible → *unresolved*. Pure + unit-tested, mirroring the
`selectStoryIntroducedCharacterNames` split.
2.4 Auto-register consumes the resolver instead of exact-match. Aliases from the
bible are seeded into the alias table when the character row is created.
2.5 Gate: extend `computeShotCompletenessViolations` to validate
`dialogue_lines[].speaker` against the same resolved name set — closing the hole
where the creation path is wider than the gate.
2.6 **Normalize-on-accept instead of persist-drift**: keep the existing
"never throw away attempt #1" behaviour (it is correct — losing a 20-episode
draft is worse), but before persisting, run unresolved names through resolution
and rewrite them to canonical. Only genuinely-unresolvable names reach the roster,
and those land as `needs_role_review` for a human — which is what that badge is
actually FOR.

### Phase 3 — Repair existing series (the user's "ซ่อมเรื่องที่ทำไปแล้ว")
3.1 `analyzeCharacterDuplicates(seriesId)` — proposes merge groups by resolving
roster names against `bible.refinedCharacters` + alias rules. LLM-judged for the
ambiguous remainder (`ลลนารี` — is it ลลิน, or a real minor character?), per
skill-first: the skill judges, TS supplies facts and applies the verdict.
**Proposal only — never auto-applies.**
3.2 `mergeCharacters({ keepId, mergeIds[] })` in one transaction:
record each merged row's name as an alias of `keepId` → repoint
`parentCharacterId` / `sharesFaceWithCharacterId` / `vertical_drama_character_assets`
→ rewrite `requiredCharacterRefs` across every episode's `startFramePlan`
(reusing `verticalDramaShotCharacterRepair.ts`'s established rewrite +
re-read-before-write pattern) → delete the merged rows.
3.3 **Story text is NOT rewritten.** `คิริน` stays `คิริน` in all 176 shots — it
becomes a registered alias of `คิริน วัฒนเมธา`. Non-destructive, and it preserves
the natural dialogue the model correctly wrote.
3.4 UI: "รวมตัวละครซ้ำ" review panel — shows proposed groups with evidence
(occurrence counts, which is canonical), user confirms per group.
3.5 One-off `scripts/repair-vd-character-identity.ts --series=18 [--apply]`
(dry-run default, JSON backup first — mirrors
`backfill-vertical-drama-character-roles.ts`).

### Phase 4 — UI cleanup — **DONE 2026-07-17**
*101/101 panel tests pass; diff is 11 className lines + 1 icon size, no logic touched.*
4.1 Badges: `max-w-full` + allow wrap/truncate; card gets `overflow-hidden`.
4.2 Icon row: `flex-wrap`.
4.3 Grid: add `xl:grid-cols-4`.
4.4 Collapse the large empty `aspect-[9/16] w-28` placeholder for DNA-less rows.

## Risk assessment

| Change | Risk | Mitigation |
|---|---|---|
| `mergeCharacters` deletes rows | **CRITICAL** | Full backup; transaction; user-confirmed proposals only; dry-run script default |
| Restoring the characters backup | **CRITICAL** | `pg_dump` warned of **circular FK** on `vertical_drama_characters` (`parentCharacterId`/`sharesFaceWithCharacterId` self-FKs). A `--data-only` restore WILL fail without `SET session_replication_role='replica'` (see root CLAUDE.md Recovery Cheat Sheet). Merge must repoint these self-FKs BEFORE deleting any row. |
| Rewriting `requiredCharacterRefs` | HIGH | Reuse proven repair-service pattern (re-read-before-write); never remove an existing ref |
| New alias UNIQUE index | MEDIUM | New table, no existing data to violate it |
| slugify change | MEDIUM | New rows only; existing keys untouched until Phase 3 |
| skill.md edit | MEDIUM | Lowercase `skill.md` is the file the loader reads (`project_vd_skill_dualcase_file_drift`); this dir has only lowercase — verified via `ls` |
| Gate covering speakers | LOW-MED | More violations → more retries → slower/costlier drafts. Normalize-on-accept absorbs this |
| Regression in deep-draft | MEDIUM | Existing tests: `verticalDramaSeries.deepStoryDrafts.test.ts`, `verticalDramaEpisodePipeline.*`, `verticalDramaCharacterRosterAutoRegister.test.ts` |

## Verification

- Unit: resolver cascade; alias dedup; `selectStoryIntroducedCharacterNames` with
  aliases; merge planner grouping; slugify for Thai/mixed/emoji names.
- Regression: full `pnpm test` on the VD suites listed above.
- Data: re-run the DB queries from "Problem statement" on series 18 → expect 6
  roster rows, all with narrativeRole+roleTier, `roleReviewStatus=ready`, and
  10 alias rows.
- Row-count check per Database Safety Protocol before/after every DB step.
- Manual: `/drama-series/18` shows 6 clean cards, no badge overflow.
- New series smoke test: create → expand bible → deep-draft → roster must equal
  the bible cast exactly, with roles filled.

## Progress log

| phase | status | note |
|---|---|---|
| 0 Backup | DONE | `.db-backups/*_20260717_135244.sql`; baseline 76/10/106 |
| 1 Stop the bleeding | DONE | roles threaded from bible; Thai slugify -> `c-<hash>`; 19/19 tests |
| 2.0 CHARACTER BIBLE block | DONE | renders at deep-draft `userPrompt` (before `knownLocationsBlock`); all 3 `buildDeepDraftPrompts` call sites threaded |
| 2.1 bible declares `aliases` | DONE | optional + tolerant — legacy bibles (incl. series 18's live one) still parse |
| 2.2 alias table | DONE | applied; UNIQUE `(seriesId, normalizedAlias)`; counts unchanged 76/10/106 |
| 2.5 gate covers `speaker` | DONE | router flattens name+aliases into `characterBibleNames` — alias-tolerant with no signature churn |
| 2.0b premium revise path | DONE | `knownCharactersBlock` now in the revise userPrompt + threaded to the season sweep |
| 2.3/2.4 resolver | DONE | `existingAliasNames` + bible-alias seeding (`onConflictDoNothing`); 22/22 tests |
| 3.1-3.3 merge service + tRPC | DONE | `verticalDramaCharacterMerge.ts` + 2 procedures; 28 unit tests; never run against the live DB |
| **SERIES 18 REPAIRED** | **DONE** | 16 -> 6 rows via a guarded SQL transaction (see below) |
| 3.4 merge review UI | NOT DONE | agents hit the session limit; the tRPC procedures exist and are unused |
| 4 UI cleanup | DONE | 101/101 tests; 11 className lines, no logic touched |
| skill.md naming contract | DONE | new rule 2b covers `characters[].name` AND `dialogue_lines[].speaker` (the latter had NO rule at all) |

Deferred (explicitly not started): Phase 2.6 normalize-on-accept; Phase 3.4/3.5 merge UI + one-off script.

## Decisions (RESOLVED by user, 2026-07-17)

1. **Repair mode: propose + confirm per group.** `mergeCharacters` never runs
   unattended. `analyzeCharacterDuplicates` produces groups with evidence; the
   user confirms each. This is why Phase 3.1 is proposal-only and 3.2 takes an
   explicit `keepId`/`mergeIds[]` from a confirmed group.
2. **Story text: alias-only, never rewritten.** `คิริน` stays `คิริน` in all 176
   shots and becomes a registered alias of `คิริน วัฒนเมธา`. Confirms Phase 3.3.
   Rationale: the model wrote correct Thai drama dialogue; rewriting it would
   both damage the writing and invalidate already-generated images/videos whose
   prompts were built from those shots.
</content>


## Series 18 repair — executed 2026-07-17 19:28 (user-approved)

Done as a single guarded `psql` transaction rather than through the new tRPC
procedure, because the web service was NOT restarted (see "Restart" below), so
the procedure isn't live yet. Same semantics, same order, same guards.

Backups first: `.db-backups/vertical_drama_{characters,series}_premerge_20260717_192750.sql`.

**A live-data surprise, caught by re-verifying instead of trusting the earlier
reading:** `asset_links` on series 18 had gone from **0 (measured ~14:00) to 5
(measured 19:27)** — the user had been working in the UI meanwhile, confirming
คิริน วัฒนเมธา's role and generating 5 portraits for it. Had the merge trusted
the stale zero, `vertical_drama_character_assets.characterId`'s
`ON DELETE CASCADE` would have destroyed real generated imagery. GUARD2 checks
this at commit time, not from a cached reading. Any future repair MUST do the
same.

Result — 16 rows -> 6, every one `ready`:

| id | name | narrativeRole | roleTier | aliases absorbed | assets |
|---|---|---|---|---|---|
| 70 | คิริน วัฒนเมธา | protagonist | lead_male | คิริน, Kirin, คีริน, คิรัน, กิริน | 5 |
| 71 | ลลิน ศิริกุล | co_protagonist | lead_female | ลลิน, Lalin, ลลิณ, ลลนารี, ลริน | 0 |
| 72 | ธีร์ | supporting | second_lead_male | — | 0 |
| 73 | เมฆ | supporting | support_memorable | — | 0 |
| 74 | พิมพ์ชนก | supporting | rival_female | — | 0 |
| 75 | วรุตม์ | antagonist | villain_male_open | — | 0 |

The role backfill reported `UPDATE 5`, not 6 — correct, not a bug: row 70 was
already `roleProvenance='user_confirmed'` (the user set it by hand during the
session), and the `WHERE ... <> 'user_confirmed'` clause deliberately refused to
overwrite a human's decision. It already had the right role anyway.

Integrity verified after commit: characters 76 -> **66** (= 76 - 10, exact); every
OTHER series' row count unchanged; episodes 106 unchanged; 10 alias rows; 106
asset rows intact.

Story text was NOT rewritten, per the user's decision — `คิริน` remains `คิริน`
in all 176 shots and is now a registered alias.

Additionally, series 18's bible now declares the short forms as first-class
aliases (`คิริน วัฒนเมธา` -> `["คิริน"]`, `ลลิน ศิริกุล` -> `["ลลิน"]`), so the Phase
2.0 CHARACTER BIBLE prompt block will TELL the next draft that the short form is
legal instead of leaving it to guess — which is what started all of this.

## Restart — deliberately NOT done

The user chose not to restart the web service. All server-side fixes (Phases
1/2/3) are on disk but NOT live: `smartspec-web.service` last started 17:00, and
prod runs directly from this checkout. The working tree also holds ~146 files of
OTHER sessions' in-flight work — including a regressed MCP transport guard whose
own test currently fails (`verticalDramaCharacters.modelSelection.test.ts`) —
so restarting would ship their half-finished work too. The DB repair above needed
no restart and is live now.

## Known-unrelated test failures observed (NOT caused by this work)

- 9 client VD test files / 23 tests (StoryboardPanel, EpisodeWorkspace,
  ProductionWizard, DialogueAudioPanel, ArcReplanCard, workspaceCopy native-audio
  copy wording). Our only client file, `VerticalDramaCharacterStockPanel.tsx`,
  passes 101/101.
- `verticalDramaCharacters.modelSelection.test.ts` — the MCP guard regression.
- `verticalDramaSeries.deepStoryDrafts.test.ts` — `criteriaVersionMarker`.
- 3 `verticalDramaStoryBible.*` tests asserting "missing required episode(s)"
  against source that says "Sub-episode(s)".
All predate this work and live in other sessions' uncommitted diffs.


## Phase 5 — alias-aware resolvers (found 2026-07-17 19:35, AFTER the merge)

The user asked whether the drama CONTENT needs fixing too. Investigating that
surfaced the last real gap, and it is the most dangerous one in this plan.

**Answer: the story text does NOT need rewriting — but two resolvers must learn
to read the alias table, or the story text becomes unusable.**

Aliases were only ever wired into `verticalDramaCharacterRosterAutoRegister.ts`
and `verticalDramaCharacterMerge.ts`. The two places that resolve a STORY name to
a roster character at production time do not consult them:

- `verticalDramaStoryboardGeneration.ts:838-849` — `speakerLookup` is built from
  `c.name.trim()` and variant `characterKey`s only. Its own comment (`:834-836`):
  an unresolved speaker "is skipped".
- `verticalDramaShotCharacterRepair.ts:188` — exact `characterKey`, then
  normalized name. No alias step.

Measured on the live DB after the merge:

| name in story | resolves by roster name | only via alias | shot refs | episodes |
|---|---|---|---|---|
| ลลิน | NO | yes | 187 | 14 |
| คิริน | NO | yes | 176 | 14 |
| คีริน | NO | yes | 32 | 10,13,19 |
| ลลิณ | NO | yes | 23 | 10,13 |
| Lalin | NO | yes | 16 | 3 |
| Kirin | NO | yes | 14 | 3 |
| กิริน, ลริน, ลลนารี, คิรัน | NO | yes | 26 | 12, 14 |
| วรุตม์, ธีร์, พิมพ์ชนก, เมฆ | yes | — | 88 | — |

**474 of 562 shot-character references, spanning ALL 20 episodes, resolve only via
alias. Both leads resolve by roster name in ZERO episodes.**

Note this is a gap the merge WIDENED: before it, `คิริน` had its own (faceless)
row, so the ref resolved to something useless; now that row is gone and the ref
resolves to nothing at all and is dropped. Series 18 has 0 storyboards today, so
no damage has occurred — but this MUST land before any storyboard/start-frame run,
or คิริน and ลลิน vanish from every shot.

Once landed, ep 3's `Kirin` resolves to character 70 — which owns the user's 5
approved portraits — i.e. correct for the first time ever.

Why rewriting the story text is the WRONG fix here:
- The model's prose is correct Thai drama writing; the craft guideline itself says
  "ไม่เรียกชื่อกันทุกประโยค" (`references/production-grade-vertical-drama.md:411`).
- 474 refs across 20 episodes is a large, risky edit for zero benefit.
- Episode 12 is written end-to-end with `ลลนารี`/`คิรัน`; rewriting names through
  well-written dialogue risks damaging it.
- The alias table exists precisely so identity is resolved at lookup time rather
  than by mutating authored content.

For NEW content the problem is already fixed upstream: the CHARACTER BIBLE block
now renders series 18's declared aliases (`คิริน`, `ลลิน`), so the next draft is
TOLD the short form is legal.

One genuine (minor) content smell remains, deliberately not acted on:
`วิทยุสื่อสาร` ("walkie-talkie") speaks 2 lines as a `speaker`. skill.md rule 2b
now forbids a device as a speaker, so new drafts won't do it; the existing 2 lines
never minted a roster row and are harmless.

**Status: DONE 2026-07-17 (backend agent dispatch).** Both resolvers are now
alias-aware:
- `verticalDramaStoryboardGeneration.ts` — `characters[].aliases?: string[]`
  (new optional field, sibling to `variants`); `speakerLookup`'s registration
  loop now runs a SEPARATE second pass after every character's own name/
  characterId/variant-key entries are registered, adding an alias key only
  when nothing already claims that exact string (existing key always wins —
  verified by a dedicated test where a real character's name collides with
  another character's declared alias). An alias always resolves to the BASE
  character's `characterId`, never a variant's, and never bypasses the
  family-aware variant dedup at `:865-882` (a shot whose LLM output already
  contains a family member is left alone).
- `verticalDramaShotCharacterRepair.ts` — added alias-table lookup as the 3rd
  resolution step (after exact `characterKey`, then normalized `name`;
  canonical name still wins on a collision). The resolution logic itself was
  extracted into a new exported pure function, `resolveSpeakerLabelToRosterKey`
  (mirrors `computeRepairedStartFramePlan`'s "pure core, DB orchestrator
  builds the inputs" split), so alias precedence is unit-tested without a
  database.
- `verticalDramaEpisodePipeline.ts`'s `generateRealStoryboard` (the only
  `generateStoryboardShotgrid` call site) now loads this series'
  `vertical_drama_character_aliases` rows (one query, joined on the alias
  table's numeric `characterId` -> the roster row's `characterKey`, NOT
  `characterKey` directly) and threads them onto each base character's
  `characters[].aliases`.
- No DB writes, no schema changes, no story-text edits. Six pipeline test
  files needed their fixed-position `mockDb.select.mockReturnValueOnce(...)`
  queues updated (+1 slot) to account for the new alias-rows query landing
  between the existing character-roster and location-roster selects — pure
  mechanical adjustment, no assertions changed. All 17 affected test files /
  160 tests pass (`verticalDramaShotCharacterRepair*`,
  `verticalDramaEpisodePipeline*`, `verticalDramaStoryboardGeneration*`);
  scoped `tsc` (composite disabled, 5-file include list) reports zero errors
  in any of the 5 touched files — remaining output is the pre-existing
  ioredis-dual-version / Express-Multer / `verticalDramaEpisodes.ts` baseline
  noise, unrelated to this change.


## Phase 6 — the NEW-PROJECT (wizard) path was still open (found 2026-07-17 19:45)

The user asked whether new projects are protected from a repeat. Checked against
the live DB rather than assumed. **Answer: not yet — and there is already a live
time bomb.**

Everything shipped through Phase 5 protects the DEEP-DRAFT path. The path every
new project actually STARTS on — wizard `seedCharactersFromDraft` -> bible
expansion (`refinedCharacters`) -> `reconcileCharactersFromStoryBible` -> deep
draft -> auto-register — still drifts at step 2->3.

Measured: bible `refinedCharacters` names vs roster names, per series:

| series | bible chars | matched in roster | bible name NOT in roster |
|---|---|---|---|
| 3 | 7 | 5 | **2** (`รินทร์`, `หมอศุภชัย`) |
| 7 | 5 | 4 | **1** (`ผู้บงการ`) |
| 4,5,6,8,9,16,17,18 | — | all | 0 |

Two DIFFERENT cases hide in that column:

1. **Bible-INTRODUCED characters** (series 3: `รินทร์`, `หมอศุภชัย`) — the wizard
   never seeded them. This case is already FIXED: `ensureRosterCharactersFromStory`
   creates them, and since Phase 1 it creates them WITH the bible's roles. Working
   as designed.

2. **Bible-RENAMED characters** (series 7) — the wizard seeded
   `ผู้บงการ(คนร้าย)`; the bible expansion refined it to `ผู้บงการ`. Same person.
   Nothing links them. **This is the bug, reproduced from a clean wizard project.**
   The moment series 7 runs a deep draft:
   - `reconcileCharactersFromStoryBible` (`verticalDramaSeries.ts:2776`) looks up
     `ผู้บงการ` by exact normalized name, misses `ผู้บงการ(คนร้าย)`, `continue`s —
     silently, roles never written;
   - `ensureRosterCharactersFromStory` sees `ผู้บงการ` is neither a roster name nor
     a known alias -> INSERTS a duplicate row.
   Series 7 is one deep-draft click away from series 18's screenshot.

Fix (Phase 6, in progress):
- The bible-expansion prompt must make the model declare the wizard draft's
  ORIGINAL name in `aliases[]` whenever it refines one — the only honest link,
  since `ผู้บงการ` vs `ผู้บงการ(คนร้าย)` is knowable only by declaration, never by
  string similarity.
- `reconcileCharactersFromStoryBible` becomes alias-aware (exact name -> alias
  table -> the bible entry's own declared aliases matched against roster names),
  writes the roles it currently drops, and records the linkage as a
  `bible_declared` alias so auto-register and the storyboard resolvers inherit it.
  It stays UPDATE-only — creation remains auto-register's job (root cause #6).

Still-open, lower severity (NOT started, no live instance):
- `createCharacterTwin` / `reconcileCharacterVariantPlan`'s twin matcher use raw
  case-sensitive `===` on `name` — stricter than every other writer, so a trailing
  space mints an independent row.
- `createCharacter` (manual UI) and `updateCharacter` do no name-collision check
  at all; a user can hand-create a duplicate. Arguably their prerogative.
- `seedCharactersFromDraft` does no DB dedup, but runs once against an empty
  roster at series creation, so it cannot duplicate in practice today.


### Phase 5 verified end-to-end against LIVE series 18 data (2026-07-17 20:0x)

Not fixtures — the real roster + alias rows pulled from the DB and fed through the
real `resolveSpeakerLabelToRosterKey`:

```
คิริน / Kirin / คีริน / กิริน / คิรัน   -> คิริน วัฒนเมธา
ลลิน / Lalin / ลลิณ / ลริน / ลลนารี  -> ลลิน ศิริกุล
วรุตม์ / ธีร์ / พิมพ์ชนก / เมฆ         -> themselves
วิทยุสื่อสาร                          -> UNRESOLVED (correct — a radio is not a character)
```

All 474 previously-unresolvable shot refs across all 20 episodes now resolve, with
zero edits to the story text. Ep 3's `Kirin` now points at character 70, which owns
the user's 5 approved portraits.

`วิทยุสื่อสาร` staying unresolved is the load-bearing negative result: the resolver
declines to force a match rather than inventing one, which is exactly why no
fuzzy/edit-distance matching may ever be added here.


## Phase 6 — DONE (2026-07-17 20:03)

**6.1** The bible-expansion prompt now surfaces the wizard's raw `charactersDraft`
as its own labelled block (it was previously buried inside the
`Existing bible: ${JSON.stringify(...)}` dump — present but not salient) and
instructs the model: when a `refinedCharacters` entry renames/expands a draft
name, it MUST echo the original verbatim in `aliases`. Renders nothing when
`charactersDraft` is absent — legacy series get a byte-identical prompt.
No TS-side draft→refined matching was added, deliberately: guessing which draft
line a refined name came from IS the fuzzy matching this plan forbids. The
declaration is the link; reconcile is the backstop.

**6.2** `reconcileCharactersFromStoryBible` cascade: exact normalized name ->
persisted alias table -> the bible entry's OWN declared `aliases[]` matched
against roster names. On an alias hit it writes the roles it used to silently
drop AND records the linkage as a `bible_declared` alias so auto-register and the
storyboard resolvers inherit it. Still UPDATE-only. 14 new tests.

Two judgement calls the agent made, both correct and worth keeping:
- **Keep the roster name, never rename it to the bible's.** The wizard name is
  deliberate human input; auto-renaming is irreversible and is the same
  "AI overwrites the human" class of bug this plan exists to kill. The alias is
  additive and reversible; an explicit human-confirmed rename can come later.
- **Record the alias even for `user_confirmed` rows** (skipping only the role
  SET). Identity-linking is not a role judgement, and skipping it would leave
  precisely those rows exposed to the duplicate-insert bug.

### Series 7 defused (2026-07-17 20:0x)

Series 7 was one deep-draft click from reproducing series 18's screenshot:
bible `ผู้บงการ` (role "ตัวร้ายเงา") vs roster `ผู้บงการ(คนร้าย)`
(role "ตัวร้ายเงาในเครือข่าย", antagonist/villain_male_open) — the same shadow
villain. Its bible predates the `aliases` contract, so 6.2's step 3 had nothing
to read.

Fixed with a single INSERT-only alias row (`merge_recorded`), no rename, no
delete. Roster still 5 rows. Reversible with one DELETE.

Full scan of all 10 series for this shape — only series 7 had it:

| series | bible-only name | roster-only name | verdict |
|---|---|---|---|
| 3 | `รินทร์`, `หมอศุภชัย` | — | genuinely NEW characters; auto-register creates them WITH roles. Fine. |
| 7 | `ผู้บงการ` | `ผู้บงการ(คนร้าย)` | **rename → duplicate risk. Defused.** |
| 8 | — | `เจน`, `คุณหญิงประไพ`, `ธาราทิพย์` | roster-only: the bible expansion dropped them. No duplicate risk, but reconcile can never give them roles. |
| 16 | — | `มินตรา` | same as series 8. |

Open, NOT addressed: the series 8/16 case — wizard-seeded characters the bible
expansion silently omitted. They can never receive roles from reconcile (there is
no bible entry to reconcile against) and will sit at `needs_role_review` forever.
Low severity, distinct bug, out of this plan's scope.


## Phase 3.4 — merge review UI DONE + LIVE (2026-07-18 01:46)

The last deferred piece. `analyzeCharacterDuplicates` + `mergeCharacters` had backend
+ 28 tests but no screen; series 18 was repaired via direct DB. Now there is a UI so
FUTURE duplicate situations are self-serve.

- New `VerticalDramaCharacterMergeReviewDialog.tsx` + a "รวมตัวละครซ้ำ" trigger beside
  the needs-setup filter chip in the roster panel.
- Flow honors the user decision: analyze → per-GROUP confirm (2-step, mirrors the
  existing delete interaction) → merge. No auto-apply. Per-DUPLICATE deselection via
  checkboxes was implemented (not deferred).
- Evidence shown per row: shot/speaker occurrence counts + episodes seen in, plus the
  analyzer's reasoning/confidence labelled as a suggestion. `autoFallback` groups
  flagged. `aliasesToRecord` shown with "story text is not rewritten".
- Series-18 (already-repaired) case renders a reassuring "ไม่พบตัวละครซ้ำ" panel, not an
  error/blank.
- **Backend shape correction the agent caught (my brief was wrong):** all ids are
  STRINGS in the router output (`String(...)` before return), not numbers. Client binds
  strings throughout. `mergeCharacters` payload:
  `{ seriesId, keepCharacterId: canonicalCharacterId, mergeCharacterIds: <selected subset> }`.
- 13 new pure-logic tests + 128/128 panel tests green; both files typecheck clean;
  frontend-only atomic deploy (build swap 01:46:01, no restart needed); smartaihub.app 200.

**The VD character-identity system is now complete end-to-end and live:** prevention
(bible block + speaker gate + alias contract on both deep-draft and wizard paths),
resilience (alias-aware resolvers across storyboard/repair/pipeline), and repair
(self-serve merge UI). Only Phase 2.6 (normalize-on-accept) remains deliberately
un-started — it is an optimization, not a gap.
